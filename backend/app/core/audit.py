from typing import Any

from sqlalchemy.orm import Session

from app.models import audit as record_audit


def audit(
    db: Session, actor_id: str, action: str, entity_type: str, entity_id: str, **details: Any
) -> None:
    record_audit(db, actor_id, action, entity_type, entity_id, **details)
