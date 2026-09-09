from celery import Celery

from app.config import settings
from app.services.importer import run_import


celery = Celery("annotate_tool", broker=settings.redis_url, backend=settings.redis_url)
celery.conf.update(task_track_started=True, timezone="UTC")


@celery.task(name="import_dataset")
def import_dataset(job_id: str) -> None:
    run_import(job_id)
