from fastapi import APIRouter, Depends, Header
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.core.permissions import current_user
from app.database import get_db
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


@router.get("/api/v1/work-items/{item_id}/data")
def item_data(
    item_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> FileResponse:
    return service.item_data(item_id, user, db)


@router.get(
    "/api/v1/work-items/{item_id}/media/{media_key:path}",
    responses={
        206: {"description": "Partial video content"},
        304: {"description": "Video has not changed"},
        416: {"description": "Requested byte range cannot be satisfied"},
    },
)
def item_media(
    item_id: str,
    media_key: str,
    range_header: str | None = Header(default=None, alias="Range"),
    if_none_match: str | None = Header(default=None, alias="If-None-Match"),
    if_modified_since: str | None = Header(default=None, alias="If-Modified-Since"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> Response:
    return service.item_media(
        item_id,
        media_key,
        user,
        db,
        range_header=range_header,
        if_none_match=if_none_match,
        if_modified_since=if_modified_since,
    )
