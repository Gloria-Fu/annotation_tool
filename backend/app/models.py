import enum
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


class Role(str, enum.Enum):
    DEVELOPER_ADMIN = "developer_admin"
    ANNOTATION_MANAGER = "annotation_manager"
    REVIEWER = "reviewer"
    ANNOTATOR = "annotator"


class DatasetStatus(str, enum.Enum):
    PENDING = "pending"
    IMPORTING = "importing"
    READY = "ready"
    FAILED = "failed"


class PackageStatus(str, enum.Enum):
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class ClaimPolicy(str, enum.Enum):
    SEQUENTIAL = "sequential"
    RANDOM = "random"


class ItemStatus(str, enum.Enum):
    AVAILABLE = "available"
    ANNOTATION_ASSIGNED = "annotation_assigned"
    ANNOTATING = "annotating"
    REVIEW_PENDING = "review_pending"
    REVIEW_ASSIGNED = "review_assigned"
    REVIEWING = "reviewing"
    CHANGES_REQUESTED = "changes_requested"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class QaStatus(str, enum.Enum):
    UNCHECKED = "unchecked"
    PASSED = "passed"
    REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(128))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[Role] = mapped_column(Enum(Role, native_enum=False), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    memberships: Mapped[list["ProjectMember"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id", name="uq_project_member"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="memberships")
    project: Mapped[Project] = relationship()


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = (UniqueConstraint("root_path", "metadata_hash", name="uq_dataset_source_hash"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    root_path: Mapped[str] = mapped_column(String(1024))
    metadata_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus, native_enum=False), default=DatasetStatus.PENDING)
    info: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    episode_count: Mapped[int] = mapped_column(Integer, default=0)
    warning_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    status: Mapped[DatasetStatus] = mapped_column(Enum(DatasetStatus, native_enum=False), default=DatasetStatus.PENDING)
    processed_count: Mapped[int] = mapped_column(Integer, default=0)
    warning_count: Mapped[int] = mapped_column(Integer, default=0)
    warnings: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    error_message: Mapped[str | None] = mapped_column(Text)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DatasetEpisode(Base):
    __tablename__ = "dataset_episodes"
    __table_args__ = (UniqueConstraint("dataset_id", "episode_index", name="uq_dataset_episode"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id", ondelete="CASCADE"), index=True)
    episode_index: Mapped[int] = mapped_column(Integer)
    length: Mapped[int] = mapped_column(Integer)
    tasks: Mapped[list[str]] = mapped_column(JSON, default=list)
    data_path: Mapped[str] = mapped_column(String(1024))
    video_paths: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    source_episode: Mapped[str | None] = mapped_column(String(255))
    episode_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)


class TaskPackage(Base):
    __tablename__ = "task_packages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[PackageStatus] = mapped_column(Enum(PackageStatus, native_enum=False), default=PackageStatus.DRAFT)
    claim_policy: Mapped[ClaimPolicy] = mapped_column(Enum(ClaimPolicy, native_enum=False))
    random_seed: Mapped[int | None] = mapped_column(Integer)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TaskPackageMember(Base):
    __tablename__ = "task_package_members"
    __table_args__ = (UniqueConstraint("package_id", "user_id", name="uq_task_package_member"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    package_id: Mapped[str] = mapped_column(ForeignKey("task_packages.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class TaskItem(Base):
    __tablename__ = "task_items"
    __table_args__ = (
        UniqueConstraint("package_id", "episode_id", name="uq_package_episode"),
        Index("ix_task_claim", "package_id", "status", "claim_order"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    package_id: Mapped[str] = mapped_column(ForeignKey("task_packages.id", ondelete="CASCADE"), index=True)
    episode_id: Mapped[str] = mapped_column(ForeignKey("dataset_episodes.id"), index=True)
    claim_order: Mapped[int] = mapped_column(Integer)
    status: Mapped[ItemStatus] = mapped_column(Enum(ItemStatus, native_enum=False), default=ItemStatus.AVAILABLE)
    annotator_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    qa_status: Mapped[QaStatus] = mapped_column(Enum(QaStatus, native_enum=False), default=QaStatus.UNCHECKED)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class AnnotationRevision(Base):
    __tablename__ = "annotation_revisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    task_item_id: Mapped[str] = mapped_column(ForeignKey("task_items.id", ondelete="CASCADE"), index=True)
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
    task_item_id: Mapped[str] = mapped_column(ForeignKey("task_items.id", ondelete="CASCADE"), index=True)
    stage: Mapped[str] = mapped_column(String(32))
    action: Mapped[str] = mapped_column(String(32))
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QualityCheck(Base):
    __tablename__ = "quality_checks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    task_item_id: Mapped[str] = mapped_column(ForeignKey("task_items.id", ondelete="CASCADE"), index=True)
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
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
    db.add(AuditLog(actor_id=actor_id, action=action, entity_type=entity_type, entity_id=entity_id, details=details))
