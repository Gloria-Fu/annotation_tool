from hashlib import sha256
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.permissions import ensure_project_access
from app.features.users.service import manageable_project_ids
from app.features.work_items import service as work_item_service
from app.features.work_items import state_machine
from app.features.work_items.state_machine import InvalidTransition
from app.models import (
    ItemStatus,
    QaStatus,
    QualityBatch,
    QualityCheck,
    QualitySample,
    Role,
    TaskItem,
    TaskPackage,
    User,
    audit,
    utcnow,
)
from app.schemas import (
    QualityBatchCreate,
    QualityBatchDetailOut,
    QualityBatchOut,
    QualityCheckOut,
    QualityInput,
    QualitySampleOut,
)


def _eligible_items(db: Session, package_id: str, only_unchecked: bool) -> list[TaskItem]:
    statement = select(TaskItem).where(
        TaskItem.package_id == package_id,
        TaskItem.status == ItemStatus.COMPLETED,
    )
    if only_unchecked:
        statement = statement.where(TaskItem.qa_status == QaStatus.UNCHECKED)
    return list(db.scalars(statement.order_by(TaskItem.claim_order, TaskItem.id)).all())


def _sample_items(items: list[TaskItem], payload: QualityBatchCreate) -> list[TaskItem]:
    if payload.mode == "all":
        return items
    if not items:
        return []
    if payload.mode == "ratio":
        size = max(1, (len(items) * payload.percent + 99) // 100)
    else:
        size = min(payload.count, len(items))
    ranked = sorted(
        items,
        key=lambda item: sha256(f"{payload.seed}:{item.id}".encode()).hexdigest(),
    )
    return sorted(ranked[:size], key=lambda item: (item.claim_order, item.id))


def _check_rows(db: Session, batch_id: str) -> list[QualityCheck]:
    return list(
        db.scalars(
            select(QualityCheck)
            .where(QualityCheck.batch_id == batch_id)
            .order_by(QualityCheck.created_at.desc(), QualityCheck.id.desc())
        ).all()
    )


def _latest_checks_by_item(db: Session, batch_id: str) -> dict[str, QualityCheck]:
    latest: dict[str, QualityCheck] = {}
    for check in _check_rows(db, batch_id):
        latest.setdefault(check.task_item_id, check)
    return latest


def _batch_summary(db: Session, batch: QualityBatch) -> dict[str, Any]:
    samples = list(
        db.scalars(
            select(QualitySample)
            .where(QualitySample.batch_id == batch.id)
            .order_by(QualitySample.sample_order)
        ).all()
    )
    checks = _latest_checks_by_item(db, batch.id)
    checked = [check for sample in samples if (check := checks.get(sample.task_item_id))]
    return {
        "id": batch.id,
        "project_id": batch.project_id,
        "package_id": batch.package_id,
        "created_by_id": batch.created_by_id,
        "assignee_id": batch.assignee_id,
        "mode": batch.mode,
        "sample_percent": batch.sample_percent,
        "sample_count": batch.sample_count,
        "seed": batch.seed,
        "only_unchecked": batch.only_unchecked,
        "status": batch.status,
        "created_at": batch.created_at,
        "completed_at": batch.completed_at,
        "total_samples": len(samples),
        "checked_samples": len(checked),
        "passed_samples": sum(check.result == QaStatus.PASSED for check in checked),
        "rejected_samples": sum(check.result == QaStatus.REJECTED for check in checked),
    }


def _batch_detail(db: Session, batch: QualityBatch) -> QualityBatchDetailOut:
    samples = list(
        db.scalars(
            select(QualitySample)
            .where(QualitySample.batch_id == batch.id)
            .order_by(QualitySample.sample_order)
        ).all()
    )
    checks = _latest_checks_by_item(db, batch.id)
    sample_outputs: list[QualitySampleOut] = []
    for sample in samples:
        item = db.get(TaskItem, sample.task_item_id)
        if item:
            sample_outputs.append(
                QualitySampleOut.model_validate(
                    {
                        "id": sample.id,
                        "batch_id": sample.batch_id,
                        "task_item_id": sample.task_item_id,
                        "sample_order": sample.sample_order,
                        "item": item,
                        "latest_check": checks.get(sample.task_item_id),
                    }
                )
            )
    return QualityBatchDetailOut(
        **_batch_summary(db, batch),
        samples=sample_outputs,
    )


def _ensure_batch_access(batch: QualityBatch, user: User, db: Session) -> None:
    if user.role not in (Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER):
        raise HTTPException(status_code=403, detail="当前账号无权访问质量抽检")
    ensure_project_access(db, user, batch.project_id, manager=True)


def create_batch(payload: QualityBatchCreate, actor: User, db: Session) -> QualityBatchDetailOut:
    if actor.role not in (Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER):
        raise HTTPException(status_code=403, detail="只有管理员可以创建抽检批次")
    package = db.get(TaskPackage, payload.package_id)
    if not package:
        raise HTTPException(status_code=404, detail="任务包不存在")
    ensure_project_access(db, actor, package.project_id, manager=True)
    eligible = _eligible_items(db, package.id, payload.only_unchecked)
    selected = _sample_items(eligible, payload)
    if not selected:
        raise HTTPException(status_code=409, detail="没有符合条件的已完成任务可供抽检")
    assignee_id = payload.assignee_id or actor.id
    assignee = db.get(User, assignee_id)
    if not assignee or assignee.is_deleted or not assignee.is_active:
        raise HTTPException(status_code=400, detail="抽检负责人不存在或已停用")
    if assignee.role not in (Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER):
        raise HTTPException(status_code=400, detail="抽检负责人必须是研发管理员或标注管理员")
    ensure_project_access(db, assignee, package.project_id)

    batch = QualityBatch(
        project_id=package.project_id,
        package_id=package.id,
        created_by_id=actor.id,
        assignee_id=assignee.id,
        mode=payload.mode,
        sample_percent=payload.percent if payload.mode == "ratio" else None,
        sample_count=payload.count if payload.mode == "count" else None,
        seed=payload.seed.strip(),
        only_unchecked=payload.only_unchecked,
    )
    db.add(batch)
    db.flush()
    db.add_all(
        [
            QualitySample(batch_id=batch.id, task_item_id=item.id, sample_order=index)
            for index, item in enumerate(selected)
        ]
    )
    audit(
        db,
        actor.id,
        "create_quality_batch",
        "quality_batch",
        batch.id,
        package_id=package.id,
        mode=payload.mode,
        sample_percent=batch.sample_percent,
        sample_count=batch.sample_count,
        seed=batch.seed,
        only_unchecked=payload.only_unchecked,
        item_count=len(selected),
        assignee_id=assignee.id,
    )
    db.commit()
    return _batch_detail(db, batch)


def list_batches(
    project_id: str | None, package_id: str | None, user: User, db: Session
) -> list[QualityBatchOut]:
    if user.role not in (Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER):
        raise HTTPException(status_code=403, detail="当前账号无权访问质量抽检")
    statement = select(QualityBatch).order_by(QualityBatch.created_at.desc())
    if project_id:
        ensure_project_access(db, user, project_id, manager=True)
        statement = statement.where(QualityBatch.project_id == project_id)
    elif user.role != Role.DEVELOPER_ADMIN:
        statement = statement.where(QualityBatch.project_id.in_(manageable_project_ids(db, user)))
    if package_id:
        statement = statement.where(QualityBatch.package_id == package_id)
    batches = list(db.scalars(statement).all())
    return [QualityBatchOut(**_batch_summary(db, batch)) for batch in batches]


def get_batch(batch_id: str, user: User, db: Session) -> QualityBatchDetailOut:
    batch = db.get(QualityBatch, batch_id)
    if not batch:
        raise HTTPException(status_code=404, detail="抽检批次不存在")
    _ensure_batch_access(batch, user, db)
    return _batch_detail(db, batch)


def history(item_id: str, user: User, db: Session) -> list[QualityCheckOut]:
    if user.role not in (Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER):
        raise HTTPException(status_code=403, detail="当前账号无权访问质量抽检")
    item, _, _, _ = work_item_service.item_access(db, item_id, user)
    checks = db.scalars(
        select(QualityCheck)
        .where(QualityCheck.task_item_id == item.id)
        .order_by(QualityCheck.created_at.desc(), QualityCheck.id.desc())
    ).all()
    return [QualityCheckOut.model_validate(check) for check in checks]


def check(item_id: str, payload: QualityInput, user: User, db: Session) -> TaskItem:
    item, _, _, _ = work_item_service.item_access(db, item_id, user)
    batch = db.get(QualityBatch, payload.batch_id) if payload.batch_id else None
    if payload.batch_id:
        if not batch:
            raise HTTPException(status_code=404, detail="抽检批次不存在")
        _ensure_batch_access(batch, user, db)
        if batch.package_id != item.package_id:
            raise HTTPException(status_code=409, detail="抽检批次与任务不匹配")
        sample = db.scalar(
            select(QualitySample).where(
                QualitySample.batch_id == batch.id,
                QualitySample.task_item_id == item.id,
            )
        )
        if not sample:
            raise HTTPException(status_code=409, detail="该任务不在抽检批次清单中")
        if db.scalar(
            select(QualityCheck.id).where(
                QualityCheck.batch_id == batch.id,
                QualityCheck.task_item_id == item.id,
            )
        ):
            raise HTTPException(status_code=409, detail="该任务已在本批次完成抽检")
    if item.status != ItemStatus.COMPLETED:
        raise HTTPException(status_code=409, detail="只能抽检已完成任务")
    if payload.result == QaStatus.UNCHECKED:
        raise HTTPException(status_code=400, detail="抽检结果必须为通过或不通过")
    revision = work_item_service.latest_revision(db, item.id)
    try:
        state_machine.quality_check(item, payload.result)
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.add(
        QualityCheck(
            task_item_id=item.id,
            batch_id=batch.id if batch else None,
            reviewer_id=user.id,
            revision_id=revision.id if revision else None,
            revision_version=revision.version if revision else None,
            revision_hash=revision.file_hash if revision else None,
            result=payload.result,
            comment=(payload.comment or "").strip() or None,
        )
    )
    if batch:
        db.flush()
        sample_count = (
            db.scalar(
                select(func.count(QualitySample.id)).where(QualitySample.batch_id == batch.id)
            )
            or 0
        )
        checked_count = (
            db.scalar(
                select(func.count(func.distinct(QualityCheck.task_item_id))).where(
                    QualityCheck.batch_id == batch.id
                )
            )
            or 0
        )
        if checked_count >= sample_count:
            batch.status = "completed"
            batch.completed_at = batch.completed_at or utcnow()
    audit(
        db,
        user.id,
        "quality_check",
        "task_item",
        item.id,
        result=payload.result.value,
        comment=payload.comment,
        batch_id=batch.id if batch else None,
        revision_id=revision.id if revision else None,
        revision_version=revision.version if revision else None,
        revision_hash=revision.file_hash if revision else None,
    )
    db.commit()
    return item
