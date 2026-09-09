from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.features.work_items import service as work_item_service
from app.features.work_items import state_machine
from app.features.work_items.state_machine import InvalidTransition
from app.models import ItemStatus, QaStatus, QualityCheck, TaskItem, User, audit
from app.schemas import QualityInput


def check(item_id: str, payload: QualityInput, user: User, db: Session) -> TaskItem:
    item, _, _, _ = work_item_service.item_access(db, item_id, user)
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
