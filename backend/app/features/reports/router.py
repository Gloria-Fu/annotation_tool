from datetime import date

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.permissions import current_user
from app.database import get_db
from app.features.reports import service
from app.models import Role, User
from app.schemas import PeopleWorkStatisticsOut, PersonalWorkStatisticsOut, StatsOut

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


@router.get("/api/v1/work-statistics/me", response_model=PersonalWorkStatisticsOut)
def personal_work_statistics(
    project_id: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    granularity: str = Query(default="day", pattern="^(day|week|month)$"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> PersonalWorkStatisticsOut:
    return service.personal_work_statistics(user, db, project_id, start_date, end_date, granularity)


@router.get("/api/v1/work-statistics/people", response_model=PeopleWorkStatisticsOut)
def people_work_statistics(
    project_id: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    role: Role | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> PeopleWorkStatisticsOut:
    return service.people_work_statistics(user, db, project_id, start_date, end_date, role)


@router.get("/api/v1/work-statistics/me.csv")
def personal_work_csv(
    project_id: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    granularity: str = Query(default="day", pattern="^(day|week|month)$"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    return service.personal_work_csv(user, db, project_id, start_date, end_date, granularity)


@router.get("/api/v1/work-statistics/people.csv")
def people_work_csv(
    project_id: str | None = Query(default=None),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    role: Role | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    return service.people_work_csv(user, db, project_id, start_date, end_date, role)
