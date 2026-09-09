from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.models import ClaimPolicy, DatasetStatus, ItemStatus, PackageStatus, QaStatus, Role


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    username: str
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10)


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9_.-]+$")
    display_name: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=10)
    role: Role
    project_ids: list[str] = []


class UserUpdate(BaseModel):
    display_name: str | None = None
    is_active: bool | None = None
    reset_password: str | None = Field(default=None, min_length=10)


class UserOut(ORMModel):
    id: str
    username: str
    display_name: str
    role: Role
    is_active: bool
    must_change_password: bool


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = None


class ProjectOut(ORMModel):
    id: str
    name: str
    description: str | None
    is_active: bool


class MemberCreate(BaseModel):
    user_id: str


class DatasetCreate(BaseModel):
    project_id: str
    name: str = Field(min_length=1, max_length=128)
    root_path: str


class DatasetOut(ORMModel):
    id: str
    project_id: str
    name: str
    root_path: str
    status: DatasetStatus
    episode_count: int
    warning_count: int
    error_message: str | None
    created_at: datetime


class ImportJobOut(ORMModel):
    id: str
    dataset_id: str
    status: DatasetStatus
    processed_count: int
    warning_count: int
    warnings: list[dict[str, Any]]
    error_message: str | None


class PackageCreate(BaseModel):
    project_id: str
    dataset_id: str
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    claim_policy: ClaimPolicy = ClaimPolicy.SEQUENTIAL
    random_seed: int | None = None
    episode_indices: list[int] | None = None
    episode_start: int | None = None
    episode_end: int | None = None
    member_ids: list[str] | None = None


class PackageOut(ORMModel):
    id: str
    project_id: str
    dataset_id: str
    title: str
    description: str | None
    status: PackageStatus
    claim_policy: ClaimPolicy
    random_seed: int | None
    created_at: datetime


class AssignmentRequest(BaseModel):
    item_ids: list[str]
    assignee_id: str
    stage: str = Field(pattern="^(annotation|review)$")


class ReclaimRequest(BaseModel):
    reason: str = Field(min_length=1)


class RevisionInput(BaseModel):
    schema_version: str = "segments.v1"
    payload: dict[str, Any]
    base_revision_id: str | None = None


class ReviewInput(BaseModel):
    decision: str = Field(pattern="^(approve|request_changes)$")
    comment: str | None = None
    payload: dict[str, Any] | None = None


class QualityInput(BaseModel):
    result: QaStatus
    comment: str | None = None


class TaskItemOut(ORMModel):
    id: str
    package_id: str
    episode_id: str
    claim_order: int
    status: ItemStatus
    annotator_id: str | None
    reviewer_id: str | None
    qa_status: QaStatus
    updated_at: datetime


class WorkContext(BaseModel):
    item: TaskItemOut
    episode_index: int
    length: int
    fps: float
    tasks: list[str]
    data_url: str
    video_urls: dict[str, str]
    latest_revision: dict[str, Any] | None


class StatsOut(BaseModel):
    project_id: str
    total: int
    by_status: dict[str, int]
    completion_rate: float
    by_person: list[dict[str, Any]]
