import random

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import (
    ensure_project_access,
    ensure_task_package_access,
    task_package_access_condition,
    task_package_manager_scope_condition,
)
from app.features.users.service import manageable_project_ids
from app.features.work_items import state_machine
from app.features.work_items.state_machine import InvalidTransition
from app.models import (
    AnnotationRevision,
    AssignmentHistory,
    AuditLog,
    ClaimPolicy,
    Dataset,
    DatasetEpisode,
    DatasetStatus,
    ItemStatus,
    PackageStatus,
    Role,
    TaskItem,
    TaskPackage,
    TaskPackageGroup,
    User,
    UserGroup,
    UserGroupMember,
    audit,
)
from app.schemas import (
    AssignmentRequest,
    PackageCreate,
    ReclaimRequest,
    TaskPackageGroupCreate,
    UserGroupSummaryOut,
)


def _package_or_404(package_id: str, db: Session) -> TaskPackage:
    package = db.get(TaskPackage, package_id)
    if not package:
        raise HTTPException(status_code=404, detail="任务包不存在")
    return package


def _group_summaries(db: Session, package_id: str) -> list[UserGroupSummaryOut]:
    rows = db.execute(
        select(
            UserGroup.id,
            UserGroup.name,
            func.count(UserGroupMember.id),
        )
        .join(TaskPackageGroup, TaskPackageGroup.group_id == UserGroup.id)
        .outerjoin(UserGroupMember, UserGroupMember.group_id == UserGroup.id)
        .where(TaskPackageGroup.package_id == package_id)
        .group_by(UserGroup.id, UserGroup.name)
        .order_by(UserGroup.name)
    ).all()
    return [
        UserGroupSummaryOut(id=group_id, name=name, member_count=member_count)
        for group_id, name, member_count in rows
    ]


def list_packages(project_id: str | None, user: User, db: Session) -> list[dict]:
    stmt = select(TaskPackage).order_by(TaskPackage.created_at.desc())
    if project_id:
        if user.role in (Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER):
            ensure_project_access(db, user, project_id)
        stmt = stmt.where(TaskPackage.project_id == project_id)
    elif user.role == Role.ANNOTATION_MANAGER:
        stmt = stmt.where(TaskPackage.project_id.in_(manageable_project_ids(db, user)))
    if user.role == Role.OUTSOURCING_MANAGER:
        stmt = stmt.where(task_package_manager_scope_condition(user))
    if user.role in (Role.ANNOTATOR, Role.REVIEWER):
        stmt = stmt.where(
            TaskPackage.status == PackageStatus.PUBLISHED,
            task_package_access_condition(user),
        )
    packages = list(db.scalars(stmt).all())
    result = []
    for package in packages:
        items = list(db.scalars(select(TaskItem).where(TaskItem.package_id == package.id)).all())
        result.append(
            {
                **{
                    column.name: getattr(package, column.name)
                    for column in TaskPackage.__table__.columns
                },
                "total_items": len(items),
                "claimed_items": sum(item.status != ItemStatus.AVAILABLE for item in items),
                "annotated_items": sum(
                    item.status
                    in {
                        ItemStatus.REVIEW_PENDING,
                        ItemStatus.REVIEW_ASSIGNED,
                        ItemStatus.REVIEWING,
                        ItemStatus.COMPLETED,
                    }
                    for item in items
                ),
                "reviewed_items": sum(item.status == ItemStatus.COMPLETED for item in items),
                "authorized_groups": _group_summaries(db, package.id),
            }
        )
    return result


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
    assigned_episode_ids = set(
        db.scalars(
            select(TaskItem.episode_id)
            .join(TaskPackage, TaskPackage.id == TaskItem.package_id)
            .where(TaskPackage.dataset_id == dataset.id)
        ).all()
    )
    episodes = [
        episode
        for episode in db.scalars(stmt.order_by(DatasetEpisode.episode_index)).all()
        if episode.id not in assigned_episode_ids
    ]
    if not episodes:
        raise HTTPException(status_code=409, detail="该数据集已没有尚未分配到任务包的 episode")
    requested_count = payload.item_count if payload.item_count is not None else len(episodes)
    if requested_count > len(episodes):
        raise HTTPException(
            status_code=409,
            detail=f"剩余未分配 episode 只有 {len(episodes)} 条，无法创建 {requested_count} 条任务",
        )
    seed = payload.random_seed
    if payload.claim_policy == ClaimPolicy.RANDOM:
        seed = seed if seed is not None else random.SystemRandom().randint(1, 2_147_483_647)
        random.Random(seed).shuffle(episodes)
    episodes = episodes[:requested_count]
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
    # PackageCreate.member_ids is retained for older clients but no longer
    # affects authorization; project membership is the single access source.
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
    package = _package_or_404(package_id, db)
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
    package = _package_or_404(package_id, db)
    ensure_task_package_access(db, user, package)
    stmt = select(TaskItem).where(TaskItem.package_id == package_id)
    if status:
        stmt = stmt.where(TaskItem.status == status)
    return list(db.scalars(stmt.order_by(TaskItem.claim_order).limit(1000)).all())


def claim(
    package_id: str,
    user: User,
    review: bool,
    db: Session,
    claim_policy: ClaimPolicy | None = None,
) -> TaskItem:
    package = db.get(TaskPackage, package_id)
    stage_label = "审核" if review else "标注"
    if not package:
        raise HTTPException(status_code=404, detail=f"领取{stage_label}失败：任务包不存在。")
    if package.status != PackageStatus.PUBLISHED:
        raise HTTPException(
            status_code=409,
            detail=f"领取{stage_label}失败：任务包尚未发布，暂不可领取。",
        )
    ensure_task_package_access(db, user, package)
    allowed = (
        (Role.REVIEWER, Role.ANNOTATION_MANAGER)
        if review
        else (Role.ANNOTATOR, Role.ANNOTATION_MANAGER)
    )
    if user.role not in allowed:
        raise HTTPException(
            status_code=403,
            detail=f"领取{stage_label}失败：当前账号角色不能领取{stage_label}任务。",
        )
    effective_policy = claim_policy or package.claim_policy
    stmt = select(TaskItem).where(TaskItem.package_id == package_id)
    if review:
        stmt = stmt.where(
            TaskItem.status == ItemStatus.REVIEW_PENDING,
            TaskItem.annotator_id != user.id,
        )
    else:
        stmt = stmt.where(TaskItem.status == ItemStatus.AVAILABLE)
    locked_stmt = stmt.with_for_update(skip_locked=True)
    if effective_policy == ClaimPolicy.RANDOM:
        candidates = list(db.scalars(locked_stmt.order_by(TaskItem.claim_order)).all())
        item = random.choice(candidates) if candidates else None
    else:
        item = db.scalar(locked_stmt.order_by(TaskItem.claim_order).limit(1))
    if not item:
        if review:
            raise HTTPException(
                status_code=409,
                detail="暂无可领取审核任务：任务包中没有待审核条目，或待审核条目已被其他审核员领取。",
            )
        raise HTTPException(
            status_code=409,
            detail="暂无可领取标注任务：任务包中的条目已被领取，或当前没有可领取条目。",
        )
    try:
        if review:
            state_machine.claim_review(item, user.id)
            stage = "review"
        else:
            state_machine.claim_annotation(item, user.id)
            stage = "annotation"
    except InvalidTransition as exc:
        raise HTTPException(
            status_code=409,
            detail=f"领取{stage_label}失败：{exc}",
        ) from exc
    db.add(
        AssignmentHistory(
            task_item_id=item.id,
            stage=stage,
            action="claim",
            assignee_id=user.id,
            actor_id=user.id,
        )
    )
    audit(
        db,
        user.id,
        "claim_task",
        "task_item",
        item.id,
        stage=stage,
        claim_policy=effective_policy.value,
    )
    db.commit()
    return item


def my_tasks(stage: str, view: str, user: User, db: Session) -> list[TaskItem]:
    if view == "history":
        if stage == "review":
            history_item_ids = select(AuditLog.entity_id).where(
                AuditLog.actor_id == user.id,
                AuditLog.entity_type == "task_item",
                AuditLog.action.in_(("review_approve", "review_request_changes")),
            )
        else:
            history_item_ids = select(AnnotationRevision.task_item_id).where(
                AnnotationRevision.created_by_id == user.id,
                AnnotationRevision.stage == "submitted",
            )
        stmt = select(TaskItem).where(TaskItem.id.in_(history_item_ids))
    else:
        assignee_column = TaskItem.reviewer_id if stage == "review" else TaskItem.annotator_id
        stmt = select(TaskItem).where(assignee_column == user.id)
        if stage == "review":
            stmt = stmt.where(
                TaskItem.status.in_((ItemStatus.REVIEW_ASSIGNED, ItemStatus.REVIEWING))
            )
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
    if user.role not in (Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER):
        stmt = stmt.join(TaskPackage).where(task_package_access_condition(user))
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
    ensure_task_package_access(db, actor, package, manager=True)
    ensure_task_package_access(db, assignee, package)
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
    ensure_task_package_access(db, actor, package, manager=True)
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


def list_package_groups(package_id: str, actor: User, db: Session) -> list[UserGroupSummaryOut]:
    package = _package_or_404(package_id, db)
    ensure_task_package_access(db, actor, package, manager=True)
    return _group_summaries(db, package.id)


def list_group_options(package_id: str, actor: User, db: Session) -> list[UserGroupSummaryOut]:
    package = _package_or_404(package_id, db)
    ensure_task_package_access(db, actor, package, manager=True)
    groups = db.scalars(select(UserGroup).order_by(UserGroup.name)).all()
    member_count_rows = db.execute(
        select(UserGroupMember.group_id, func.count(UserGroupMember.id)).group_by(
            UserGroupMember.group_id
        )
    ).all()
    member_counts: dict[str, int] = {
        group_id: int(member_count) for group_id, member_count in member_count_rows
    }
    assigned_ids = {
        group_id
        for (group_id,) in db.execute(
            select(TaskPackageGroup.group_id).where(TaskPackageGroup.package_id == package.id)
        ).all()
    }
    return [
        UserGroupSummaryOut(
            id=group.id,
            name=group.name,
            member_count=member_counts.get(group.id, 0),
        )
        for group in groups
        if group.id not in assigned_ids
    ]


def add_package_group(
    package_id: str,
    payload: TaskPackageGroupCreate,
    actor: User,
    db: Session,
) -> UserGroupSummaryOut:
    package = _package_or_404(package_id, db)
    ensure_task_package_access(db, actor, package, manager=True)
    group = db.get(UserGroup, payload.group_id)
    if not group:
        raise HTTPException(status_code=404, detail="群组不存在")
    relation = TaskPackageGroup(package_id=package.id, group_id=group.id)
    db.add(relation)
    package.group_access_configured = True
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="该群组已授权给任务包") from exc
    audit(
        db,
        actor.id,
        "add_task_package_group",
        "task_package",
        package.id,
        group_id=group.id,
    )
    db.commit()
    member_count = (
        db.scalar(
            select(func.count(UserGroupMember.id)).where(UserGroupMember.group_id == group.id)
        )
        or 0
    )
    return UserGroupSummaryOut(id=group.id, name=group.name, member_count=member_count)


def remove_package_group(package_id: str, group_id: str, actor: User, db: Session) -> None:
    package = _package_or_404(package_id, db)
    ensure_task_package_access(db, actor, package, manager=True)
    relation = db.scalar(
        select(TaskPackageGroup).where(
            TaskPackageGroup.package_id == package.id,
            TaskPackageGroup.group_id == group_id,
        )
    )
    if not relation:
        raise HTTPException(status_code=404, detail="该群组尚未授权给任务包")
    db.delete(relation)
    audit(
        db,
        actor.id,
        "remove_task_package_group",
        "task_package",
        package.id,
        group_id=group_id,
    )
    db.commit()
