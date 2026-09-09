from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.permissions import require_roles
from app.database import get_db
from app.features.quality import service
from app.models import Role, TaskItem, User
from app.schemas import QualityInput, TaskItemOut

router = APIRouter()


@router.post("/api/v1/work-items/{item_id}/quality-check", response_model=TaskItemOut)
def quality_check(
    item_id: str,
    payload: QualityInput,
    user: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
) -> TaskItem:
    return service.check(item_id, payload, user, db)
