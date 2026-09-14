from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.permissions import current_user, require_roles
from app.database import get_db
from app.features.quality import service
from app.models import Role, TaskItem, User
from app.schemas import (
    QualityBatchCreate,
    QualityBatchDetailOut,
    QualityBatchOut,
    QualityCheckOut,
    QualityInput,
    TaskItemOut,
)

router = APIRouter()


@router.post(
    "/api/v1/quality-batches",
    response_model=QualityBatchDetailOut,
    status_code=201,
)
def create_quality_batch(
    payload: QualityBatchCreate,
    include_samples: bool = Query(default=True),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> QualityBatchDetailOut:
    return service.create_batch(payload, user, db, include_samples=include_samples)


@router.get("/api/v1/quality-batches", response_model=list[QualityBatchOut])
def list_quality_batches(
    project_id: str | None = Query(default=None),
    package_id: str | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[QualityBatchOut]:
    return service.list_batches(project_id, package_id, user, db)


@router.get("/api/v1/quality-batches/{batch_id}", response_model=QualityBatchDetailOut)
def get_quality_batch(
    batch_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> QualityBatchDetailOut:
    return service.get_batch(batch_id, user, db)


@router.get("/api/v1/work-items/{item_id}/quality-history", response_model=list[QualityCheckOut])
def quality_history(
    item_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[QualityCheckOut]:
    return service.history(item_id, user, db)


@router.post("/api/v1/work-items/{item_id}/quality-check", response_model=TaskItemOut)
def quality_check(
    item_id: str,
    payload: QualityInput,
    user: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> TaskItem:
    return service.check(item_id, payload, user, db)


@router.post(
    "/api/v1/quality-batches/{batch_id}/items/{item_id}/check",
    response_model=TaskItemOut,
)
def check_quality_batch_item(
    batch_id: str,
    item_id: str,
    payload: QualityInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TaskItem:
    if payload.batch_id and payload.batch_id != batch_id:
        raise HTTPException(status_code=400, detail="请求中的抽检批次不匹配")
    payload.batch_id = batch_id
    return service.check(item_id, payload, user, db)
