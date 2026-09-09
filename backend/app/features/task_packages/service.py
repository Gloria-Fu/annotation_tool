import random

from fastapi import HTTPException
from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session

from app.core.permissions import ensure_project_access
from app.features.users.service import manageable_project_ids
from app.features.work_items import state_machine
from app.features.work_items.state_machine import InvalidTransition
from app.models import (
    AssignmentHistory,
    ClaimPolicy,
    Dataset,
    DatasetEpisode,
    DatasetStatus,
    ItemStatus,
    PackageStatus,
    ProjectMember,
    Role,
    TaskItem,
    TaskPackage,
    TaskPackageMember,
    User,
    audit,
)
from app.schemas import AssignmentRequest, PackageCreate, ReclaimRequest


def list_packages(project_id: str | None, user: User, db: Session) -> list[TaskPackage]:
    stmt = select(TaskPackage).order_by(TaskPackage.created_at.desc())
    if project_id:
        ensure_project_access(db, user, project_id)
        stmt = stmt.where(TaskPackage.project_id == project_id)
    elif user.role != Role.DEVELOPER_ADMIN:
        stmt = stmt.where(TaskPackage.project_id.in_(manageable_project_ids(db, user)))
    if user.role in (Role.ANNOTATOR, Role.REVIEWER):
        any_restriction = exists(
            select(TaskPackageMember.id).where(TaskPackageMember.package_id == TaskPackage.id)
        )
        is_allowed = exists(
            select(TaskPackageMember.id).where(
                TaskPackageMember.package_id == TaskPackage.id,
                TaskPackageMember.user_id == user.id,
            )
        )
        stmt = stmt.where(
            TaskPackage.status == PackageStatus.PUBLISHED,
            or_(~any_restriction, is_allowed),
        )
    return list(db.scalars(stmt).all())


def create_package(payload: PackageCreate, actor: User, db: Session) -> TaskPackage:
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
            TaskItem(package_id=package.id, episode_id=episode.id, claim_order=index)
            for index, episode in enumerate(episodes)
        ]
    )
    audit(db, actor.id, "create_task_package", "task_package", package.id, item_count=len(episodes))
    db.commit()
    return package


def publish_package(package_id: str, actor: User, db: Session) -> TaskPackage:
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
    package_id: str, status: ItemStatus | None, user: User, db: Session
) -> list[TaskItem]:
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
                TaskPackageMember.package_id == package.id,
                TaskPackageMember.user_id == user.id,
            )
        ):
            raise HTTPException(status_code=403, detail="你不在该任务包的成员范围内")
    stmt = select(TaskItem).where(TaskItem.package_id == package_id)
    if status:
        stmt = stmt.where(TaskItem.status == status)
    return list(db.scalars(stmt.order_by(TaskItem.claim_order).limit(1000)).all())


def claim(package_id: str, user: User, review: bool, db: Session) -> TaskItem:
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
                TaskPackageMember.package_id == package.id,
                TaskPackageMember.user_id == user.id,
            )
        ):
            raise HTTPException(status_code=403, detail="你不在该任务包的成员范围内")
    stmt = select(TaskItem).where(TaskItem.package_id == package_id)
    if review:
        stmt = stmt.where(
            TaskItem.status == ItemStatus.REVIEW_PENDING,
            TaskItem.annotator_id != user.id,
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
            task_item_id=item.id,
            stage=stage,
            action="claim",
            assignee_id=user.id,
            actor_id=user.id,
        )
    )
    audit(db, user.id, "claim_task", "task_item", item.id, stage=stage)
    db.commit()
    return item


def my_tasks(stage: str, user: User, db: Session) -> list[TaskItem]:
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
    return list(db.scalars(stmt.order_by(TaskItem.updated_at.desc())).all())


def assign_items(
    package_id: str,
    payload: AssignmentRequest,
    actor: User,
    db: Session,
) -> list[TaskItem]:
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


def reclaim_item(item_id: str, payload: ReclaimRequest, actor: User, db: Session) -> TaskItem:
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
