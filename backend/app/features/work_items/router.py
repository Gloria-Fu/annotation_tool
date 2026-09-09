from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.permissions import current_user
from app.database import get_db
from app.features.quality.router import router as quality_router
from app.features.work_items import service
from app.models import TaskItem, User
from app.schemas import ReviewInput, RevisionInput, TaskItemOut, WorkContext

router = APIRouter()


@router.get("/api/v1/work-items/{item_id}/context", response_model=WorkContext)
def work_context(
    item_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> WorkContext:
    return service.context(item_id, user, db)


@router.put("/api/v1/work-items/{item_id}/draft", response_model=TaskItemOut)
def save_draft(
    item_id: str,
    payload: RevisionInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TaskItem:
    return service.save_draft(item_id, payload, user, db)


@router.post("/api/v1/work-items/{item_id}/submit", response_model=TaskItemOut)
def submit_annotation(
    item_id: str,
    payload: RevisionInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TaskItem:
    return service.submit_annotation(item_id, payload, user, db)


@router.post("/api/v1/work-items/{item_id}/review", response_model=TaskItemOut)
def review_item(
    item_id: str,
    payload: ReviewInput,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TaskItem:
    return service.review_item(item_id, payload, user, db)


@router.post("/api/v1/work-items/{item_id}/clear", response_model=TaskItemOut)
def clear_annotations(
    item_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> TaskItem:
    return service.clear_annotations(item_id, user, db)


router.include_router(quality_router)


@router.get("/api/v1/work-items/{item_id}/data")
def item_data(
    item_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> FileResponse:
    return service.item_data(item_id, user, db)


@router.get("/api/v1/work-items/{item_id}/media/{media_key:path}")
def item_media(
    item_id: str,
    media_key: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    return service.item_media(item_id, media_key, user, db)
