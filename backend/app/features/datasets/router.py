from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.permissions import current_user, require_roles
from app.database import get_db
from app.features.datasets import service
from app.models import Dataset, ImportJob, Role, User
from app.schemas import DatasetCreate, DatasetOut, ImportJobOut

router = APIRouter()


@router.get("/api/v1/datasets", response_model=list[DatasetOut])
def list_datasets(
    project_id: str | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[Dataset]:
    return service.list_datasets(project_id, user, db)


@router.post("/api/v1/datasets", response_model=DatasetOut, status_code=202)
def create_dataset(
    payload: DatasetCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
) -> Dataset:
    return service.create_dataset(payload, actor, db)


@router.get("/api/v1/import-jobs/{job_id}", response_model=ImportJobOut)
def get_import_job(
    job_id: str, user: User = Depends(current_user), db: Session = Depends(get_db)
) -> ImportJob:
    return service.get_import_job(job_id, user, db)


@router.post("/api/v1/import-jobs/{job_id}/retry", response_model=ImportJobOut, status_code=202)
def retry_import(
    job_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
) -> ImportJob:
    return service.retry_import(job_id, actor, db)
