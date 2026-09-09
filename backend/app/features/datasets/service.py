from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import ensure_project_access
from app.features.users.service import manageable_project_ids
from app.models import Dataset, DatasetStatus, ImportJob, Role, User, audit
from app.schemas import DatasetCreate
from app.services.importer import ImportValidationError, inspect_dataset
from app.worker import import_dataset


def list_datasets(project_id: str | None, user: User, db: Session) -> list[Dataset]:
    from sqlalchemy import select

    stmt = select(Dataset).order_by(Dataset.created_at.desc())
    if project_id:
        ensure_project_access(db, user, project_id)
        stmt = stmt.where(Dataset.project_id == project_id)
    elif user.role != Role.DEVELOPER_ADMIN:
        stmt = stmt.where(Dataset.project_id.in_(manageable_project_ids(db, user)))
    return list(db.scalars(stmt).all())


def create_dataset(payload: DatasetCreate, actor: User, db: Session) -> Dataset:
    ensure_project_access(db, actor, payload.project_id)
    try:
        root, info, digest = inspect_dataset(payload.root_path)
    except ImportValidationError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    dataset = Dataset(
        project_id=payload.project_id,
        name=payload.name,
        root_path=str(root),
        metadata_hash=digest,
        info=info,
        created_by_id=actor.id,
    )
    db.add(dataset)
    try:
        db.flush()
        job = ImportJob(dataset_id=dataset.id)
        db.add(job)
        db.flush()
        audit(
            db,
            actor.id,
            "create_dataset",
            "dataset",
            dataset.id,
            root_path=str(root),
            import_job_id=job.id,
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="该目录和元数据版本已导入") from exc
    import_dataset.delay(job.id)
    return dataset


def get_import_job(job_id: str, user: User, db: Session) -> ImportJob:
    job = db.get(ImportJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    dataset = db.get(Dataset, job.dataset_id)
    if not dataset:
        raise HTTPException(status_code=404, detail="数据集不存在")
    ensure_project_access(db, user, dataset.project_id)
    return job


def retry_import(job_id: str, actor: User, db: Session) -> ImportJob:
    old = db.get(ImportJob, job_id)
    if not old:
        raise HTTPException(status_code=404, detail="导入任务不存在")
    if old.status not in (DatasetStatus.FAILED, DatasetStatus.READY):
        raise HTTPException(status_code=409, detail="当前状态不可重试")
    job = ImportJob(dataset_id=old.dataset_id)
    db.add(job)
    db.flush()
    audit(db, actor.id, "retry_import", "dataset", old.dataset_id, import_job_id=job.id)
    db.commit()
    import_dataset.delay(job.id)
    return job
