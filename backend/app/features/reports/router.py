from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.permissions import current_user
from app.database import get_db
from app.features.reports import service
from app.models import User
from app.schemas import StatsOut

router = APIRouter()


@router.get("/api/v1/stats", response_model=StatsOut)
def project_stats(
    project_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> StatsOut:
    return service.stats(project_id, user, db)


@router.get("/api/v1/reports/tasks.csv")
def task_report(
    project_id: str,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    return service.task_report(project_id, user, db)
