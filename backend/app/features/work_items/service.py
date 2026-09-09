from sqlalchemy.orm import Session

from app.infrastructure.annotation_storage import AnnotationStorage, PreparedRevision
from app.models import AnnotationRevision


def commit_prepared_revision(
    db: Session,
    storage: AnnotationStorage,
    prepared: PreparedRevision,
    revision: AnnotationRevision,
) -> None:
    """Flush the revision row, publish its file, and commit as one workflow."""
    db.add(revision)
    try:
        db.flush()
        storage.finalize(prepared)
        db.commit()
    except Exception:
        db.rollback()
        storage.cleanup(prepared)
        raise
