from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

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
    group_ids: list[str] = []


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


class UserGroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=500)
    manager_id: str | None = None


class UserGroupUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    description: str | None = Field(default=None, max_length=500)
    manager_id: str | None = None


class UserGroupMemberCreate(BaseModel):
    user_id: str


class UserGroupMemberOut(ORMModel):
    id: str
    username: str
    display_name: str
    role: Role
    is_active: bool


class UserGroupOut(ORMModel):
    id: str
    name: str
    description: str | None
    created_by_id: str
    manager_id: str | None
    created_at: datetime
    updated_at: datetime
    member_count: int
    members: list[UserGroupMemberOut]


class UserGroupSummaryOut(BaseModel):
    id: str
    name: str
    member_count: int


class TaskPackageGroupCreate(BaseModel):
    group_id: str


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
    item_count: int | None = Field(
        default=None,
        ge=1,
        le=100000,
        description="本次任务包创建的条目数量；新客户端应始终传入。",
    )
    random_seed: int | None = None
    episode_indices: list[int] | None = Field(
        default=None,
        json_schema_extra={"deprecated": True},
        description="已废弃。旧客户端可继续使用，服务端会从其中排除已分配 episode。",
    )
    episode_start: int | None = Field(
        default=None,
        json_schema_extra={"deprecated": True},
        description="已废弃。新客户端请改用 item_count。",
    )
    episode_end: int | None = Field(
        default=None,
        json_schema_extra={"deprecated": True},
        description="已废弃。新客户端请改用 item_count。",
    )
    member_ids: list[str] | None = Field(
        default=None,
        deprecated=True,
        description="已废弃。任务包权限由项目成员关系决定，此字段仅为兼容旧客户端保留。",
    )


class PackageOut(ORMModel):
    id: str
    project_id: str
    dataset_id: str
    title: str
    description: str | None
    status: PackageStatus
    claim_policy: ClaimPolicy
    random_seed: int | None
    group_access_configured: bool = False
    created_at: datetime
    total_items: int = 0
    claimed_items: int = 0
    annotated_items: int = 0
    reviewed_items: int = 0
    authorized_groups: list[UserGroupSummaryOut] = []


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

    @model_validator(mode="after")
    def require_comment_for_changes(self) -> "ReviewInput":
        if self.decision == "request_changes" and not (self.comment or "").strip():
            raise ValueError("退回修改时必须填写审核原因")
        return self


class QualityInput(BaseModel):
    result: QaStatus
    comment: str | None = None
    batch_id: str | None = None

    @model_validator(mode="after")
    def require_comment_for_rejection(self) -> "QualityInput":
        if self.result == QaStatus.REJECTED and not (self.comment or "").strip():
            raise ValueError("抽检退回时必须填写问题原因")
        return self


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


class WorkContextUser(ORMModel):
    id: str
    username: str
    display_name: str


class WorkContext(BaseModel):
    item: TaskItemOut
    annotator: WorkContextUser | None = None
    reviewer: WorkContextUser | None = None
    episode_index: int
    length: int
    fps: float
    tasks: list[str]
    data_url: str
    video_urls: dict[str, str]
    latest_revision: dict[str, Any] | None
    review_comment: str | None = None
    quality_comment: str | None = None


class QualityBatchCreate(BaseModel):
    package_id: str
    assignee_id: str | None = None
    mode: Literal["all", "ratio", "count"] = "ratio"
    percent: int = Field(default=10, ge=1, le=100)
    count: int = Field(default=20, ge=1)
    seed: str = Field(default="quality", min_length=1, max_length=128)
    only_unchecked: bool = True


class QualityCheckOut(ORMModel):
    id: str
    batch_id: str | None
    task_item_id: str
    reviewer_id: str
    result: QaStatus
    comment: str | None
    revision_id: str | None
    revision_version: int | None
    revision_hash: str | None
    created_at: datetime


class QualityBatchOut(ORMModel):
    id: str
    project_id: str
    package_id: str
    created_by_id: str
    assignee_id: str | None
    mode: str
    sample_percent: int | None
    sample_count: int | None
    seed: str
    only_unchecked: bool
    status: str
    created_at: datetime
    completed_at: datetime | None
    total_samples: int
    checked_samples: int
    passed_samples: int
    rejected_samples: int


class QualitySampleOut(ORMModel):
    id: str
    batch_id: str
    task_item_id: str
    sample_order: int
    item: TaskItemOut
    latest_check: QualityCheckOut | None = None


class QualityBatchDetailOut(QualityBatchOut):
    samples: list[QualitySampleOut]


class StatsOut(BaseModel):
    project_id: str
    total: int
    by_status: dict[str, int]
    completion_rate: float
    effective_video_seconds: float
    by_person: list[dict[str, Any]]


class WorkMetricOut(BaseModel):
    period_start: date
    period_end: date
    user_id: str
    display_name: str
    role: Role
    claimed_count: int
    first_submissions: int
    resubmissions: int
    returned_count: int
    final_approved_count: int
    effective_video_seconds: float
    average_completion_seconds: float | None
    first_pass_rate: float
    rework_rate: float
    review_claimed_count: int
    review_count: int
    approved_count: int
    rejected_count: int
    review_pass_rate: float
    review_return_rate: float
    average_review_seconds: float | None


class PersonalWorkStatisticsOut(BaseModel):
    start_date: date
    end_date: date
    granularity: Literal["day", "week", "month"]
    summary: WorkMetricOut
    periods: list[WorkMetricOut]


class PeopleWorkStatisticsOut(BaseModel):
    start_date: date
    end_date: date
    people: list[WorkMetricOut]
