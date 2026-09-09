from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database import Base
from app.models.common import ClaimPolicy, ItemStatus, PackageStatus, QaStatus, new_id, utcnow


class TaskPackage(Base):
    __tablename__ = "task_packages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    dataset_id: Mapped[str] = mapped_column(ForeignKey("datasets.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[PackageStatus] = mapped_column(
        Enum(PackageStatus, native_enum=False),
        default=PackageStatus.DRAFT,
    )
    claim_policy: Mapped[ClaimPolicy] = mapped_column(Enum(ClaimPolicy, native_enum=False))
    random_seed: Mapped[int | None] = mapped_column(Integer)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TaskPackageMember(Base):
    __tablename__ = "task_package_members"
    __table_args__ = (UniqueConstraint("package_id", "user_id", name="uq_task_package_member"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    package_id: Mapped[str] = mapped_column(
        ForeignKey("task_packages.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class TaskItem(Base):
    __tablename__ = "task_items"
    __table_args__ = (
        UniqueConstraint("package_id", "episode_id", name="uq_package_episode"),
        Index("ix_task_claim", "package_id", "status", "claim_order"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    package_id: Mapped[str] = mapped_column(
        ForeignKey("task_packages.id", ondelete="CASCADE"), index=True
    )
    episode_id: Mapped[str] = mapped_column(ForeignKey("dataset_episodes.id"), index=True)
    claim_order: Mapped[int] = mapped_column(Integer)
    status: Mapped[ItemStatus] = mapped_column(
        Enum(ItemStatus, native_enum=False),
        default=ItemStatus.AVAILABLE,
    )
    annotator_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), index=True)
    qa_status: Mapped[QaStatus] = mapped_column(
        Enum(QaStatus, native_enum=False),
        default=QaStatus.UNCHECKED,
    )
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
