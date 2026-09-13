from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database import Base
from app.models.common import QaStatus, new_id, utcnow


class AnnotationRevision(Base):
    __tablename__ = "annotation_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    task_item_id: Mapped[str] = mapped_column(
        ForeignKey("task_items.id", ondelete="CASCADE"), index=True
    )
    version: Mapped[int] = mapped_column(Integer)
    schema_version: Mapped[str] = mapped_column(String(32), default="segments.v1")
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    stage: Mapped[str] = mapped_column(String(32))
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    source_revision_id: Mapped[str | None] = mapped_column(ForeignKey("annotation_revisions.id"))
    file_path: Mapped[str | None] = mapped_column(String(1024))
    file_hash: Mapped[str | None] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AssignmentHistory(Base):
    __tablename__ = "assignment_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    task_item_id: Mapped[str] = mapped_column(
        ForeignKey("task_items.id", ondelete="CASCADE"), index=True
    )
    stage: Mapped[str] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(32))
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QualityBatch(Base):
    __tablename__ = "quality_batches"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    package_id: Mapped[str] = mapped_column(ForeignKey("task_packages.id"), index=True)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    mode: Mapped[str] = mapped_column(String(16))
    sample_percent: Mapped[int | None] = mapped_column(Integer)
    sample_count: Mapped[int | None] = mapped_column(Integer)
    seed: Mapped[str] = mapped_column(String(128))
    only_unchecked: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(16), default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class QualitySample(Base):
    __tablename__ = "quality_samples"
    __table_args__ = (UniqueConstraint("batch_id", "task_item_id", name="uq_quality_sample_item"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    batch_id: Mapped[str] = mapped_column(
        ForeignKey("quality_batches.id", ondelete="CASCADE"), index=True
    )
    task_item_id: Mapped[str] = mapped_column(
        ForeignKey("task_items.id", ondelete="CASCADE"), index=True
    )
    sample_order: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QualityCheck(Base):
    __tablename__ = "quality_checks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    task_item_id: Mapped[str] = mapped_column(
        ForeignKey("task_items.id", ondelete="CASCADE"), index=True
    )
    batch_id: Mapped[str | None] = mapped_column(
        ForeignKey("quality_batches.id", ondelete="SET NULL"), index=True
    )
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    revision_id: Mapped[str | None] = mapped_column(
        ForeignKey("annotation_revisions.id", ondelete="SET NULL"), index=True
    )
    revision_version: Mapped[int | None] = mapped_column(Integer)
    revision_hash: Mapped[str | None] = mapped_column(String(64))
    result: Mapped[QaStatus] = mapped_column(Enum(QaStatus, native_enum=False))
    comment: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(64), index=True)
    entity_type: Mapped[str] = mapped_column(String(64))
    entity_id: Mapped[str] = mapped_column(String(36), index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


def audit(db, actor_id: str, action: str, entity_type: str, entity_id: str, **details: Any) -> None:
    db.add(
        AuditLog(
            actor_id=actor_id,
            action=action,
            entity_type=entity_type,
            entity_id=entity_id,
            details=details,
        )
    )
