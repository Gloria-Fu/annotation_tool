from datetime import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.database import Base
from app.models.common import DatasetStatus, new_id, utcnow


class Dataset(Base):
    __tablename__ = "datasets"
    __table_args__ = (
        UniqueConstraint("root_path", "metadata_hash", name="uq_dataset_source_hash"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    name: Mapped[str] = mapped_column(String(128))
    root_path: Mapped[str] = mapped_column(String(1024))
    metadata_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[DatasetStatus] = mapped_column(
        Enum(DatasetStatus, native_enum=False),
        default=DatasetStatus.PENDING,
    )
    info: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    episode_count: Mapped[int] = mapped_column(Integer, default=0)
    warning_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    status: Mapped[DatasetStatus] = mapped_column(
        Enum(DatasetStatus, native_enum=False),
        default=DatasetStatus.PENDING,
    )
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
    dataset_id: Mapped[str] = mapped_column(
        ForeignKey("datasets.id", ondelete="CASCADE"), index=True
    )
    episode_index: Mapped[int] = mapped_column(Integer)
    length: Mapped[int] = mapped_column(Integer)
    tasks: Mapped[list[str]] = mapped_column(JSON, default=list)
    data_path: Mapped[str] = mapped_column(String(1024))
    video_paths: Mapped[dict[str, str]] = mapped_column(JSON, default=dict)
    source_episode: Mapped[str | None] = mapped_column(String(255))
    episode_metadata: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
