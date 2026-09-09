import enum
import uuid
from datetime import UTC, datetime


def utcnow() -> datetime:
    return datetime.now(UTC)


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
