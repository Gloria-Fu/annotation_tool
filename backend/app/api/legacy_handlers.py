import csv
import io
import random
from pathlib import Path
from typing import Any

from fastapi import Depends, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy import exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import (
    SESSION_COOKIE,
    create_session,
    delete_session,
    delete_user_sessions,
    hash_password,
    verify_password,
)
from app.config import settings
from app.database import get_db
from app.dependencies import current_user, ensure_project_access, require_roles
from app.features.work_items import state_machine
from app.features.work_items.service import commit_prepared_revision
from app.features.work_items.state_machine import InvalidTransition
from app.infrastructure.annotation_storage import AnnotationStorage
from app.models import (
    AnnotationRevision,
    AssignmentHistory,
    ClaimPolicy,
    Dataset,
    DatasetEpisode,
    DatasetStatus,
    ImportJob,
    ItemStatus,
    PackageStatus,
    Project,
    ProjectMember,
    QaStatus,
    QualityCheck,
    Role,
    TaskItem,
    TaskPackage,
    TaskPackageMember,
    User,
    audit,
)
from app.schemas import (
    AssignmentRequest,
    DatasetCreate,
    LoginRequest,
    MemberCreate,
    PackageCreate,
    PasswordChange,
    ProjectCreate,
    QualityInput,
    ReclaimRequest,
    ReviewInput,
    RevisionInput,
    StatsOut,
    TaskItemOut,
    UserCreate,
    UserUpdate,
    WorkContext,
)
from app.services.importer import ImportValidationError, inspect_dataset, resolve_dataset_root
from app.worker import import_dataset

API = "/api/v1"
annotation_storage = AnnotationStorage()


def health(db: Session = Depends(get_db)) -> dict[str, str]:
    db.execute(select(1))
    return {"status": "ok"}


def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> User:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not user.is_active or not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_session(user.id)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        max_age=settings.session_ttl_seconds,
        path="/",
    )
    audit(db, user.id, "login", "user", user.id)
    db.commit()
    return user


def logout(
    response: Response,
    request: Request,
    token: str | None = Query(default=None, include_in_schema=False),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    cookie_token = request.cookies.get(SESSION_COOKIE) or token
    if cookie_token:
        delete_session(cookie_token)
    response.delete_cookie(SESSION_COOKIE, path="/")
    audit(db, user.id, "logout", "user", user.id)
    db.commit()


def me(user: User = Depends(current_user)) -> User:
    return user


def change_password(
    payload: PasswordChange,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> User:
    if not verify_password(user.password_hash, payload.current_password):
        raise HTTPException(status_code=400, detail="当前密码错误")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    delete_user_sessions(user.id)
    token = create_session(user.id)
    response.set_cookie(
        SESSION_COOKIE,
        token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="strict",
        max_age=settings.session_ttl_seconds,
        path="/",
    )
    audit(db, user.id, "change_password", "user", user.id)
    db.commit()
    return user


def _manageable_project_ids(db: Session, user: User) -> set[str]:
    if user.role == Role.DEVELOPER_ADMIN:
        return set()
    return set(
        db.scalars(select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)).all()
    )


def list_users(
    user: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
):
    if user.role == Role.DEVELOPER_ADMIN:
        return db.scalars(
            select(User).where(User.is_deleted.is_(False)).order_by(User.created_at.desc())
        ).all()
    project_ids = _manageable_project_ids(db, user)
    return db.scalars(
        select(User)
        .join(ProjectMember)
        .where(ProjectMember.project_id.in_(project_ids), User.is_deleted.is_(False))
        .distinct()
        .order_by(User.username)
    ).all()


def create_user(
    payload: UserCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
):
    if actor.role == Role.ANNOTATION_MANAGER:
        if payload.role not in (Role.ANNOTATOR, Role.REVIEWER):
            raise HTTPException(status_code=403, detail="标注管理员只能创建标注员或审核员")
        manageable = _manageable_project_ids(db, actor)
        if not payload.project_ids or not set(payload.project_ids).issubset(manageable):
            raise HTTPException(status_code=403, detail="只能将账号加入自己管理的项目")
    new_user = User(
        username=payload.username,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(new_user)
    try:
        db.flush()
        for project_id in set(payload.project_ids):
            if not db.get(Project, project_id):
                raise HTTPException(status_code=404, detail="项目不存在")
            db.add(ProjectMember(project_id=project_id, user_id=new_user.id))
        audit(db, actor.id, "create_user", "user", new_user.id, role=payload.role.value)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户名已存在") from exc
    return new_user


def update_user(
    user_id: str,
    payload: UserUpdate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="账号不存在")
    if actor.role == Role.ANNOTATION_MANAGER:
        manageable = _manageable_project_ids(db, actor)
        target_projects = set(
            db.scalars(
                select(ProjectMember.project_id).where(ProjectMember.user_id == target.id)
            ).all()
        )
        if target.role not in (Role.ANNOTATOR, Role.REVIEWER) or not target_projects.intersection(
            manageable
        ):
            raise HTTPException(status_code=403, detail="无权管理该账号")
    if payload.display_name is not None:
        target.display_name = payload.display_name
    if payload.is_active is not None:
        target.is_active = payload.is_active
        if not payload.is_active:
            delete_user_sessions(target.id)
    if payload.reset_password:
        target.password_hash = hash_password(payload.reset_password)
        target.must_change_password = True
        delete_user_sessions(target.id)
    audit(
        db,
        actor.id,
        "update_user",
        "user",
        target.id,
        fields=list(payload.model_dump(exclude_none=True)),
    )
    db.commit()
    return target


def delete_user(
    user_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> None:
    target = db.get(User, user_id)
    if not target or target.is_deleted:
        raise HTTPException(status_code=404, detail="账号不存在")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="不能删除当前登录账号")
    if actor.role == Role.ANNOTATION_MANAGER:
        manageable = _manageable_project_ids(db, actor)
        target_projects = set(
            db.scalars(
                select(ProjectMember.project_id).where(ProjectMember.user_id == target.id)
            ).all()
        )
        if target.role not in (Role.ANNOTATOR, Role.REVIEWER) or not target_projects.intersection(
            manageable
        ):
            raise HTTPException(status_code=403, detail="无权删除该账号")
    target.is_active = False
    target.is_deleted = True
    delete_user_sessions(target.id)
    audit(db, actor.id, "delete_user", "user", target.id, deleted_username=target.username)
    db.commit()


def list_projects(user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(Project).where(Project.is_active.is_(True)).order_by(Project.name)
    if user.role != Role.DEVELOPER_ADMIN:
        stmt = stmt.join(ProjectMember).where(ProjectMember.user_id == user.id)
    return db.scalars(stmt).all()


def create_project(
    payload: ProjectCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
):
    project = Project(name=payload.name, description=payload.description, created_by_id=actor.id)
    db.add(project)
    try:
        db.flush()
        audit(db, actor.id, "create_project", "project", project.id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="项目名称已存在") from exc
    return project


def add_member(
    project_id: str,
    payload: MemberCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
):
    ensure_project_access(db, actor, project_id, manager=True)
    target = db.get(User, payload.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="账号不存在")
    if actor.role == Role.ANNOTATION_MANAGER and target.role not in (Role.ANNOTATOR, Role.REVIEWER):
        raise HTTPException(status_code=403, detail="只能添加标注员或审核员")
    member = ProjectMember(project_id=project_id, user_id=target.id)
    db.add(member)
    try:
        db.flush()
        audit(db, actor.id, "add_project_member", "project", project_id, user_id=target.id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户已在项目中") from exc
    return {"id": member.id}


def list_datasets(
    project_id: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    stmt = select(Dataset).order_by(Dataset.created_at.desc())
    if project_id:
        ensure_project_access(db, user, project_id)
        stmt = stmt.where(Dataset.project_id == project_id)
    elif user.role != Role.DEVELOPER_ADMIN:
        stmt = stmt.where(Dataset.project_id.in_(_manageable_project_ids(db, user)))
    return db.scalars(stmt).all()


def create_dataset(
    payload: DatasetCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
):
    ensure_project_access(db, actor, payload.project_id)
    try:
        root, info, digest = inspect_dataset(payload.root_path)
    except ImportValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    dataset = Dataset(
        project_id=payload.project_id,
        name=payload.name,
        root_path=str(root),
        metadata_hash=digest,
        info=info,
        created_by_id=actor.id,
    )
    db.add(dataset)
    try:
        db.flush()
        job = ImportJob(dataset_id=dataset.id)
        db.add(job)
        db.flush()
        audit(
            db,
            actor.id,
            "create_dataset",
            "dataset",
            dataset.id,
            root_path=str(root),
            import_job_id=job.id,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="该目录和元数据版本已导入") from exc
    import_dataset.delay(job.id)
    return dataset


def get_import_job(job_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    job = db.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    dataset = db.get(Dataset, job.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="数据集不存在")
    ensure_project_access(db, user, dataset.project_id)
    return job


def retry_import(
    job_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
):
    old = db.get(ImportJob, job_id)
    if not old:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    if old.status not in (DatasetStatus.FAILED, DatasetStatus.READY):
        raise HTTPException(status_code=409, detail="当前状态不可重试")
    job = ImportJob(dataset_id=old.dataset_id)
    db.add(job)
    db.flush()
    audit(db, actor.id, "retry_import", "dataset", old.dataset_id, import_job_id=job.id)
    db.commit()
    import_dataset.delay(job.id)
    return job


def list_packages(
    project_id: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    stmt = select(TaskPackage).order_by(TaskPackage.created_at.desc())
    if project_id:
        ensure_project_access(db, user, project_id)
        stmt = stmt.where(TaskPackage.project_id == project_id)
    elif user.role != Role.DEVELOPER_ADMIN:
        stmt = stmt.where(TaskPackage.project_id.in_(_manageable_project_ids(db, user)))
    if user.role in (Role.ANNOTATOR, Role.REVIEWER):
        any_restriction = exists(
            select(TaskPackageMember.id).where(TaskPackageMember.package_id == TaskPackage.id)
        )
        is_allowed = exists(
            select(TaskPackageMember.id).where(
                TaskPackageMember.package_id == TaskPackage.id, TaskPackageMember.user_id == user.id
            )
        )
        stmt = stmt.where(
            TaskPackage.status == PackageStatus.PUBLISHED, or_(~any_restriction, is_allowed)
        )
    return db.scalars(stmt).all()


def create_package(
    payload: PackageCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
):
    ensure_project_access(db, actor, payload.project_id, manager=actor.role != Role.DEVELOPER_ADMIN)
    dataset = db.get(Dataset, payload.dataset_id)
    if not dataset or dataset.project_id != payload.project_id:
        raise HTTPException(status_code=400, detail="数据集不属于该项目")
    if dataset.status != DatasetStatus.READY:
        raise HTTPException(status_code=409, detail="数据集尚未导入完成")
    stmt = select(DatasetEpisode).where(DatasetEpisode.dataset_id == dataset.id)
    if payload.episode_indices is not None:
        stmt = stmt.where(DatasetEpisode.episode_index.in_(set(payload.episode_indices)))
    if payload.episode_start is not None:
        stmt = stmt.where(DatasetEpisode.episode_index >= payload.episode_start)
    if payload.episode_end is not None:
        stmt = stmt.where(DatasetEpisode.episode_index <= payload.episode_end)
    episodes = list(db.scalars(stmt.order_by(DatasetEpisode.episode_index)).all())
    if not episodes:
        raise HTTPException(status_code=400, detail="所选范围没有 episode")
    seed = payload.random_seed
    if payload.claim_policy == ClaimPolicy.RANDOM:
        seed = seed if seed is not None else random.SystemRandom().randint(1, 2_147_483_647)
        random.Random(seed).shuffle(episodes)
    package = TaskPackage(
        project_id=payload.project_id,
        dataset_id=dataset.id,
        title=payload.title,
        description=payload.description,
        claim_policy=payload.claim_policy,
        random_seed=seed,
        created_by_id=actor.id,
    )
    db.add(package)
    db.flush()
    if payload.member_ids:
        valid_members = set(
            db.scalars(
                select(ProjectMember.user_id).where(
                    ProjectMember.project_id == payload.project_id,
                    ProjectMember.user_id.in_(set(payload.member_ids)),
                )
            ).all()
        )
        if valid_members != set(payload.member_ids):
            raise HTTPException(status_code=400, detail="成员范围包含非项目成员")
        db.add_all(
            [TaskPackageMember(package_id=package.id, user_id=user_id) for user_id in valid_members]
        )
    db.add_all(
        [
            TaskItem(package_id=package.id, episode_id=ep.id, claim_order=i)
            for i, ep in enumerate(episodes)
        ]
    )
    audit(db, actor.id, "create_task_package", "task_package", package.id, item_count=len(episodes))
    db.commit()
    return package


def publish_package(
    package_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
):
    package = db.get(TaskPackage, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="任务包不存在")
    ensure_project_access(db, actor, package.project_id, manager=actor.role != Role.DEVELOPER_ADMIN)
    if package.status != PackageStatus.DRAFT:
        raise HTTPException(status_code=409, detail="只有草稿任务包可以发布")
    package.status = PackageStatus.PUBLISHED
    audit(db, actor.id, "publish_task_package", "task_package", package.id)
    db.commit()
    return package


def list_items(
    package_id: str,
    status: ItemStatus | None = None,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    package = db.get(TaskPackage, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="任务包不存在")
    ensure_project_access(db, user, package.project_id)
    if user.role in (Role.ANNOTATOR, Role.REVIEWER):
        has_restriction = db.scalar(
            select(func.count(TaskPackageMember.id)).where(
                TaskPackageMember.package_id == package.id
            )
        )
        if has_restriction and not db.scalar(
            select(TaskPackageMember).where(
                TaskPackageMember.package_id == package.id, TaskPackageMember.user_id == user.id
            )
        ):
            raise HTTPException(status_code=403, detail="你不在该任务包的成员范围内")
    stmt = select(TaskItem).where(TaskItem.package_id == package_id)
    if status:
        stmt = stmt.where(TaskItem.status == status)
    return db.scalars(stmt.order_by(TaskItem.claim_order).limit(1000)).all()


def _claim(db: Session, package_id: str, user: User, review: bool) -> TaskItem:
    package = db.get(TaskPackage, package_id)
    if not package or package.status != PackageStatus.PUBLISHED:
        raise HTTPException(status_code=404, detail="没有可领取的任务包")
    ensure_project_access(db, user, package.project_id)
    allowed = (
        (Role.REVIEWER, Role.ANNOTATION_MANAGER)
        if review
        else (Role.ANNOTATOR, Role.ANNOTATION_MANAGER)
    )
    if user.role not in allowed:
        raise HTTPException(status_code=403, detail="当前角色不能领取此类任务")
    if user.role in (Role.ANNOTATOR, Role.REVIEWER):
        has_restriction = db.scalar(
            select(func.count(TaskPackageMember.id)).where(
                TaskPackageMember.package_id == package.id
            )
        )
        if has_restriction and not db.scalar(
            select(TaskPackageMember).where(
                TaskPackageMember.package_id == package.id, TaskPackageMember.user_id == user.id
            )
        ):
            raise HTTPException(status_code=403, detail="你不在该任务包的成员范围内")
    stmt = select(TaskItem).where(TaskItem.package_id == package_id)
    if review:
        stmt = stmt.where(
            TaskItem.status == ItemStatus.REVIEW_PENDING, TaskItem.annotator_id != user.id
        )
    else:
        stmt = stmt.where(TaskItem.status == ItemStatus.AVAILABLE)
    item = db.scalar(stmt.order_by(TaskItem.claim_order).with_for_update(skip_locked=True).limit(1))
    if not item:
        raise HTTPException(status_code=409, detail="暂无可领取任务")
    try:
        if review:
            state_machine.claim_review(item, user.id)
            stage = "review"
        else:
            state_machine.claim_annotation(item, user.id)
            stage = "annotation"
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.add(
        AssignmentHistory(
            task_item_id=item.id, stage=stage, action="claim", assignee_id=user.id, actor_id=user.id
        )
    )
    audit(db, user.id, "claim_task", "task_item", item.id, stage=stage)
    db.commit()
    return item


def claim_annotation(
    package_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    return _claim(db, package_id, user, False)


def claim_review(
    package_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    return _claim(db, package_id, user, True)


def my_tasks(
    stage: str = Query(default="annotation", pattern="^(annotation|review)$"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    assignee_column = TaskItem.reviewer_id if stage == "review" else TaskItem.annotator_id
    stmt = select(TaskItem).where(assignee_column == user.id)
    if stage == "review":
        stmt = stmt.where(TaskItem.status.in_((ItemStatus.REVIEW_ASSIGNED, ItemStatus.REVIEWING)))
    else:
        stmt = stmt.where(
            TaskItem.status.in_(
                (
                    ItemStatus.ANNOTATION_ASSIGNED,
                    ItemStatus.ANNOTATING,
                    ItemStatus.CHANGES_REQUESTED,
                )
            )
        )
    return db.scalars(stmt.order_by(TaskItem.updated_at.desc())).all()


def assign_items(
    package_id: str,
    payload: AssignmentRequest,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
):
    package = db.get(TaskPackage, package_id)
    assignee = db.get(User, payload.assignee_id)
    if not package or not assignee:
        raise HTTPException(status_code=404, detail="任务包或账号不存在")
    ensure_project_access(db, actor, package.project_id, manager=actor.role != Role.DEVELOPER_ADMIN)
    ensure_project_access(db, assignee, package.project_id)
    expected_role = (
        (Role.REVIEWER, Role.ANNOTATION_MANAGER)
        if payload.stage == "review"
        else (Role.ANNOTATOR, Role.ANNOTATION_MANAGER)
    )
    if assignee.role not in expected_role:
        raise HTTPException(status_code=400, detail="账号角色与指派阶段不匹配")
    items = list(
        db.scalars(
            select(TaskItem)
            .where(TaskItem.package_id == package_id, TaskItem.id.in_(payload.item_ids))
            .with_for_update()
        ).all()
    )
    if len(items) != len(set(payload.item_ids)):
        raise HTTPException(status_code=404, detail="部分条目不存在")
    for item in items:
        expected_status = (
            ItemStatus.REVIEW_PENDING if payload.stage == "review" else ItemStatus.AVAILABLE
        )
        if item.status != expected_status or (
            payload.stage == "review" and item.annotator_id == assignee.id
        ):
            raise HTTPException(status_code=409, detail=f"条目 {item.id} 当前不可指派")
        try:
            if payload.stage == "review":
                state_machine.assign_review(item, assignee.id)
            else:
                state_machine.assign_annotation(item, assignee.id)
        except InvalidTransition as exc:
            raise HTTPException(status_code=409, detail=f"条目 {item.id} 当前不可指派") from exc
        db.add(
            AssignmentHistory(
                task_item_id=item.id,
                stage=payload.stage,
                action="assign",
                assignee_id=assignee.id,
                actor_id=actor.id,
            )
        )
    audit(
        db,
        actor.id,
        "assign_tasks",
        "task_package",
        package_id,
        item_ids=payload.item_ids,
        assignee_id=assignee.id,
        stage=payload.stage,
    )
    db.commit()
    return items


def reclaim_item(
    item_id: str,
    payload: ReclaimRequest,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
):
    item = db.get(TaskItem, item_id)
    package = db.get(TaskPackage, item.package_id) if item else None
    if not item or not package:
        raise HTTPException(status_code=404, detail="任务不存在")
    ensure_project_access(db, actor, package.project_id, manager=actor.role != Role.DEVELOPER_ADMIN)
    try:
        if item.status in (
            ItemStatus.ANNOTATION_ASSIGNED,
            ItemStatus.ANNOTATING,
            ItemStatus.CHANGES_REQUESTED,
        ):
            old_assignee, stage = state_machine.reclaim_annotation(item), "annotation"
        elif item.status in (ItemStatus.REVIEW_ASSIGNED, ItemStatus.REVIEWING):
            old_assignee, stage = state_machine.reclaim_review(item), "review"
        else:
            raise HTTPException(status_code=409, detail="当前状态不可回收")
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail="当前状态不可回收") from exc
    db.add(
        AssignmentHistory(
            task_item_id=item.id,
            stage=stage,
            action="reclaim",
            assignee_id=old_assignee,
            actor_id=actor.id,
            reason=payload.reason,
        )
    )
    audit(db, actor.id, "reclaim_task", "task_item", item.id, reason=payload.reason)
    db.commit()
    return item


def _item_access(
    db: Session, item_id: str, user: User
) -> tuple[TaskItem, TaskPackage, DatasetEpisode, Dataset]:
    item = db.get(TaskItem, item_id)
    package = db.get(TaskPackage, item.package_id) if item else None
    if not item or not package:
        raise HTTPException(status_code=404, detail="任务不存在")
    ensure_project_access(db, user, package.project_id)
    episode = db.get(DatasetEpisode, item.episode_id)
    dataset = db.get(Dataset, package.dataset_id)
    if not episode or not dataset:
        raise HTTPException(status_code=404, detail="任务关联的数据不存在")
    return item, package, episode, dataset


def _latest_revision(db: Session, item_id: str) -> AnnotationRevision | None:
    return db.scalar(
        select(AnnotationRevision)
        .where(AnnotationRevision.task_item_id == item_id)
        .order_by(AnnotationRevision.version.desc())
        .limit(1)
    )


def _initial_segments(episode: DatasetEpisode, fps: float) -> dict[str, Any]:
    annotations = (episode.episode_metadata or {}).get("language_annotations", [])
    subtasks = [
        a for a in annotations if a.get("style") == "subtask" and a.get("timestamp") is not None
    ]
    starts = [max(0, min(episode.length, round(float(a["timestamp"]) * fps))) for a in subtasks]
    segments: list[dict[str, Any]] = []
    for index, annotation in enumerate(subtasks):
        start = 0 if index == 0 else starts[index]
        end = starts[index + 1] if index + 1 < len(starts) else episode.length
        if end <= start:
            continue
        skill = next(
            (
                a.get("content")
                for a in annotations
                if a.get("style") == "skill" and a.get("timestamp") == annotation.get("timestamp")
            ),
            None,
        )
        segments.append(
            {
                "id": f"imported-{index + 1}",
                "start_frame": start,
                "end_frame": end,
                "text": str(annotation.get("content", "")).strip(),
                "source": "imported",
                "skill": skill,
            }
        )
    return {"schema_version": "segments.v1", "segments": segments}


def _validate_segments(payload: RevisionInput, length: int, require_text: bool = False) -> None:
    if payload.schema_version != "segments.v1":
        raise HTTPException(status_code=422, detail="仅支持 segments.v1 标注格式")
    segments = payload.payload.get("segments")
    if not isinstance(segments, list):
        raise HTTPException(status_code=422, detail="payload.segments 必须是数组")
    if any(not isinstance(segment, dict) for segment in segments):
        raise HTTPException(status_code=422, detail="每个片段必须是对象")
    previous_end = -1
    for segment in sorted(segments, key=lambda item: item.get("start_frame", -1)):
        try:
            start, end = int(segment["start_frame"]), int(segment["end_frame"])
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="片段必须包含整数帧范围") from exc
        if start < 0 or end > length or start >= end or start < previous_end:
            raise HTTPException(status_code=422, detail="片段帧范围非法或存在重叠")
        if require_text and not str(segment.get("text", "")).strip():
            raise HTTPException(status_code=422, detail="提交审核时每个片段都必须填写文字")
        previous_end = end
    if require_text and not segments:
        raise HTTPException(status_code=422, detail="至少需要一个标注片段")


def _revision_document(
    item: TaskItem, episode: DatasetEpisode, fps: float, payload: dict[str, Any]
) -> dict[str, Any]:
    return {
        "schema_version": "segments.v1",
        "task_item_id": item.id,
        "episode_index": episode.episode_index,
        "fps": fps,
        "segments": payload.get("segments", []),
    }


def work_context(item_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item, _, episode, dataset = _item_access(db, item_id, user)
    if (
        user.role != Role.DEVELOPER_ADMIN
        and user.id not in (item.annotator_id, item.reviewer_id)
        and user.role != Role.ANNOTATION_MANAGER
    ):
        raise HTTPException(status_code=403, detail="该任务未分配给你")
    revision = _latest_revision(db, item.id)
    fps = float((dataset.info or {}).get("fps", 30))
    latest = (
        {
            "id": revision.id,
            "version": revision.version,
            "schema_version": revision.schema_version,
            "payload": revision.payload,
            "stage": revision.stage,
            "file_path": revision.file_path,
            "file_hash": revision.file_hash,
        }
        if revision
        else {
            "id": None,
            "version": 0,
            "schema_version": "segments.v1",
            "payload": _initial_segments(episode, fps),
            "stage": "imported",
            "file_path": None,
            "file_hash": None,
        }
    )
    return WorkContext(
        item=TaskItemOut.model_validate(item),
        episode_index=episode.episode_index,
        length=episode.length,
        fps=fps,
        tasks=episode.tasks,
        data_url=f"{API}/work-items/{item.id}/data",
        video_urls={key: f"{API}/work-items/{item.id}/media/{key}" for key in episode.video_paths},
        latest_revision=latest,
    )


def save_draft(
    item_id: str,
    payload: RevisionInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    item, _, episode, dataset = _item_access(db, item_id, user)
    if item.annotator_id != user.id or item.status not in (
        ItemStatus.ANNOTATION_ASSIGNED,
        ItemStatus.ANNOTATING,
        ItemStatus.CHANGES_REQUESTED,
    ):
        raise HTTPException(status_code=403, detail="不能编辑该标注任务")
    _validate_segments(payload, episode.length)
    previous = _latest_revision(db, item.id)
    if payload.base_revision_id and (not previous or payload.base_revision_id != previous.id):
        raise HTTPException(status_code=409, detail="标注已被其他操作更新，请重新加载")
    version = previous.version + 1 if previous else 1
    prepared = annotation_storage.prepare_revision(
        resolve_dataset_root(dataset.root_path),
        item.id,
        version,
        _revision_document(
            item, episode, float((dataset.info or {}).get("fps", 30)), payload.payload
        ),
    )
    revision = AnnotationRevision(
        task_item_id=item.id,
        version=version,
        schema_version=payload.schema_version,
        payload=payload.payload,
        stage="draft",
        created_by_id=user.id,
        source_revision_id=previous.id if previous else None,
        file_path=prepared.relative_path,
        file_hash=prepared.file_hash,
    )
    item.status = ItemStatus.ANNOTATING
    audit(db, user.id, "save_draft", "task_item", item.id)
    commit_prepared_revision(db, annotation_storage, prepared, revision)
    return item


def submit_annotation(
    item_id: str,
    payload: RevisionInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    item, _, episode, dataset = _item_access(db, item_id, user)
    if item.annotator_id != user.id or item.status not in (
        ItemStatus.ANNOTATION_ASSIGNED,
        ItemStatus.ANNOTATING,
        ItemStatus.CHANGES_REQUESTED,
    ):
        raise HTTPException(status_code=403, detail="不能提交该标注任务")
    _validate_segments(payload, episode.length, require_text=True)
    previous = _latest_revision(db, item.id)
    if payload.base_revision_id and (not previous or payload.base_revision_id != previous.id):
        raise HTTPException(status_code=409, detail="标注已被其他操作更新，请重新加载")
    version = previous.version + 1 if previous else 1
    try:
        state_machine.submit_annotation(item, user.id)
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    prepared = annotation_storage.prepare_revision(
        resolve_dataset_root(dataset.root_path),
        item.id,
        version,
        _revision_document(
            item, episode, float((dataset.info or {}).get("fps", 30)), payload.payload
        ),
    )
    revision = AnnotationRevision(
        task_item_id=item.id,
        version=version,
        schema_version=payload.schema_version,
        payload=payload.payload,
        stage="submitted",
        created_by_id=user.id,
        source_revision_id=previous.id if previous else None,
        file_path=prepared.relative_path,
        file_hash=prepared.file_hash,
    )
    audit(db, user.id, "submit_annotation", "task_item", item.id)
    commit_prepared_revision(db, annotation_storage, prepared, revision)
    return item


def review_item(
    item_id: str,
    payload: ReviewInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    item, _, episode, dataset = _item_access(db, item_id, user)
    if (
        item.reviewer_id != user.id
        or item.annotator_id == user.id
        or item.status not in (ItemStatus.REVIEW_ASSIGNED, ItemStatus.REVIEWING)
    ):
        raise HTTPException(status_code=403, detail="不能审核该任务")
    previous = _latest_revision(db, item.id)
    review_data = payload.payload or (previous.payload if previous else {"segments": []})
    review_payload = RevisionInput(schema_version="segments.v1", payload=review_data)
    _validate_segments(review_payload, episode.length, require_text=payload.decision == "approve")
    version = previous.version + 1 if previous else 1
    try:
        if payload.decision == "approve":
            state_machine.approve(item, user.id)
        else:
            state_machine.request_changes(item, user.id)
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    prepared = annotation_storage.prepare_revision(
        resolve_dataset_root(dataset.root_path),
        item.id,
        version,
        _revision_document(item, episode, float((dataset.info or {}).get("fps", 30)), review_data),
    )
    revision = AnnotationRevision(
        task_item_id=item.id,
        version=version,
        schema_version="segments.v1",
        payload=review_data,
        stage="reviewed",
        created_by_id=user.id,
        source_revision_id=previous.id if previous else None,
        file_path=prepared.relative_path,
        file_hash=prepared.file_hash,
    )
    audit(db, user.id, f"review_{payload.decision}", "task_item", item.id, comment=payload.comment)
    commit_prepared_revision(db, annotation_storage, prepared, revision)
    return item


def clear_annotations(
    item_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    item, _, episode, dataset = _item_access(db, item_id, user)
    if item.annotator_id != user.id or item.status not in (
        ItemStatus.ANNOTATION_ASSIGNED,
        ItemStatus.ANNOTATING,
        ItemStatus.CHANGES_REQUESTED,
    ):
        raise HTTPException(status_code=403, detail="不能清空该标注任务")
    previous = _latest_revision(db, item.id)
    version = previous.version + 1 if previous else 1
    payload = {"schema_version": "segments.v1", "segments": []}
    prepared = annotation_storage.prepare_revision(
        resolve_dataset_root(dataset.root_path),
        item.id,
        version,
        _revision_document(item, episode, float((dataset.info or {}).get("fps", 30)), payload),
    )
    revision = AnnotationRevision(
        task_item_id=item.id,
        version=version,
        schema_version="segments.v1",
        payload=payload,
        stage="draft",
        created_by_id=user.id,
        source_revision_id=previous.id if previous else None,
        file_path=prepared.relative_path,
        file_hash=prepared.file_hash,
    )
    item.status = ItemStatus.ANNOTATING
    audit(db, user.id, "clear_annotations", "task_item", item.id)
    commit_prepared_revision(db, annotation_storage, prepared, revision)
    return item


def quality_check(
    item_id: str,
    payload: QualityInput,
    user: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
):
    item, _, _, _ = _item_access(db, item_id, user)
    if item.status != ItemStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="只能抽检已完成任务")
    if payload.result == QaStatus.UNCHECKED:
        raise HTTPException(status_code=400, detail="抽检结果必须为通过或不通过")
    db.add(
        QualityCheck(
            task_item_id=item.id,
            reviewer_id=user.id,
            result=payload.result,
            comment=payload.comment,
        )
    )
    try:
        state_machine.quality_check(item, payload.result)
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    audit(
        db,
        user.id,
        "quality_check",
        "task_item",
        item.id,
        result=payload.result.value,
        comment=payload.comment,
    )
    db.commit()
    return item


def _authorized_file(item_id: str, user: User, db: Session, media_key: str | None = None) -> Path:
    item, _, episode, dataset = _item_access(db, item_id, user)
    if user.role not in (Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER) and user.id not in (
        item.annotator_id,
        item.reviewer_id,
    ):
        raise HTTPException(status_code=403, detail="无权访问任务数据")
    relative = episode.video_paths.get(media_key) if media_key else episode.data_path
    if not relative:
        raise HTTPException(status_code=404, detail="媒体不存在")
    root = resolve_dataset_root(dataset.root_path)
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    return path


def item_data(item_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return FileResponse(
        _authorized_file(item_id, user, db), media_type="application/vnd.apache.parquet"
    )


def item_media(
    item_id: str, media_key: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    return FileResponse(_authorized_file(item_id, user, db, media_key), media_type="video/mp4")


def _stats(db: Session, project_id: str) -> StatsOut:
    rows = db.execute(
        select(TaskItem.status, func.count(TaskItem.id))
        .join(TaskPackage)
        .where(TaskPackage.project_id == project_id)
        .group_by(TaskItem.status)
    ).all()
    by_status = {status.value: count for status, count in rows}
    total = sum(by_status.values())
    people = db.execute(
        select(User.id, User.display_name, func.count(TaskItem.id))
        .join(TaskItem, TaskItem.annotator_id == User.id)
        .join(TaskPackage, TaskPackage.id == TaskItem.package_id)
        .where(TaskPackage.project_id == project_id, TaskItem.status == ItemStatus.COMPLETED)
        .group_by(User.id, User.display_name)
    ).all()
    return StatsOut(
        project_id=project_id,
        total=total,
        by_status=by_status,
        completion_rate=(by_status.get(ItemStatus.COMPLETED.value, 0) / total if total else 0),
        by_person=[
            {"user_id": row[0], "display_name": row[1], "completed": row[2]} for row in people
        ],
    )


def project_stats(
    project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    ensure_project_access(db, user, project_id)
    if user.role not in (Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER):
        raise HTTPException(status_code=403, detail="无权查看统计")
    return _stats(db, project_id)


def task_report(project_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    ensure_project_access(db, user, project_id, manager=user.role != Role.DEVELOPER_ADMIN)
    rows = db.execute(
        select(
            TaskPackage.title,
            DatasetEpisode.episode_index,
            TaskItem.status,
            TaskItem.annotator_id,
            TaskItem.reviewer_id,
            TaskItem.qa_status,
            TaskItem.updated_at,
        )
        .join(TaskItem, TaskItem.package_id == TaskPackage.id)
        .join(DatasetEpisode, DatasetEpisode.id == TaskItem.episode_id)
        .where(TaskPackage.project_id == project_id)
        .order_by(TaskPackage.title, DatasetEpisode.episode_index)
    ).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["任务包", "episode_index", "状态", "标注员ID", "审核员ID", "抽检状态", "更新时间(UTC)"]
    )
    for row in rows:
        writer.writerow(
            [
                row[0],
                row[1],
                row[2].value,
                row[3] or "",
                row[4] or "",
                row[5].value,
                row[6].isoformat(),
            ]
        )
    content = "\ufeff" + output.getvalue()
    return StreamingResponse(
        iter([content.encode("utf-8")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="task-report.csv"'},
    )
