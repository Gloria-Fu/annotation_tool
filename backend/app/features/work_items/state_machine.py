from datetime import datetime

from app.models import ItemStatus, QaStatus, TaskItem, utcnow


class InvalidTransition(ValueError):
    """Raised when a task item cannot perform a requested lifecycle transition."""


def _require(item: TaskItem, statuses: tuple[ItemStatus, ...], action: str) -> None:
    if item.status not in statuses:
        allowed = ", ".join(status.value for status in statuses)
        raise InvalidTransition(f"{action} requires one of: {allowed}")


def claim_annotation(item: TaskItem, assignee_id: str) -> None:
    _require(item, (ItemStatus.AVAILABLE,), "claim annotation")
    item.annotator_id = assignee_id
    item.status = ItemStatus.ANNOTATION_ASSIGNED


def claim_review(item: TaskItem, assignee_id: str) -> None:
    _require(item, (ItemStatus.REVIEW_PENDING,), "claim review")
    if item.annotator_id == assignee_id:
        raise InvalidTransition("annotator cannot review their own task")
    item.reviewer_id = assignee_id
    item.status = ItemStatus.REVIEW_ASSIGNED


def assign_annotation(item: TaskItem, assignee_id: str) -> None:
    claim_annotation(item, assignee_id)


def assign_review(item: TaskItem, assignee_id: str) -> None:
    claim_review(item, assignee_id)


def start_annotation(item: TaskItem, assignee_id: str) -> None:
    _require(
        item, (ItemStatus.ANNOTATION_ASSIGNED, ItemStatus.CHANGES_REQUESTED), "start annotation"
    )
    if item.annotator_id != assignee_id:
        raise InvalidTransition("task is assigned to another annotator")
    item.status = ItemStatus.ANNOTATING


def submit_annotation(
    item: TaskItem, assignee_id: str, submitted_at: datetime | None = None
) -> None:
    _require(
        item,
        (ItemStatus.ANNOTATION_ASSIGNED, ItemStatus.ANNOTATING, ItemStatus.CHANGES_REQUESTED),
        "submit annotation",
    )
    if item.annotator_id != assignee_id:
        raise InvalidTransition("task is assigned to another annotator")
    item.status = ItemStatus.REVIEW_PENDING
    item.reviewer_id = None
    item.submitted_at = submitted_at or utcnow()


def start_review(item: TaskItem, reviewer_id: str) -> None:
    _require(item, (ItemStatus.REVIEW_ASSIGNED,), "start review")
    if item.reviewer_id != reviewer_id:
        raise InvalidTransition("task is assigned to another reviewer")
    if item.annotator_id == reviewer_id:
        raise InvalidTransition("annotator cannot review their own task")
    item.status = ItemStatus.REVIEWING


def approve(item: TaskItem, reviewer_id: str, completed_at: datetime | None = None) -> None:
    _require(item, (ItemStatus.REVIEW_ASSIGNED, ItemStatus.REVIEWING), "approve review")
    if item.reviewer_id != reviewer_id or item.annotator_id == reviewer_id:
        raise InvalidTransition("reviewer cannot approve this task")
    item.status = ItemStatus.COMPLETED
    item.completed_at = completed_at or utcnow()


def request_changes(item: TaskItem, reviewer_id: str) -> None:
    _require(item, (ItemStatus.REVIEW_ASSIGNED, ItemStatus.REVIEWING), "request changes")
    if item.reviewer_id != reviewer_id or item.annotator_id == reviewer_id:
        raise InvalidTransition("reviewer cannot return this task")
    item.status = ItemStatus.CHANGES_REQUESTED
    item.reviewer_id = None


def reclaim_annotation(item: TaskItem) -> str | None:
    _require(
        item,
        (ItemStatus.ANNOTATION_ASSIGNED, ItemStatus.ANNOTATING, ItemStatus.CHANGES_REQUESTED),
        "reclaim annotation",
    )
    old_assignee = item.annotator_id
    item.annotator_id = None
    item.status = ItemStatus.AVAILABLE
    return old_assignee


def reclaim_review(item: TaskItem) -> str | None:
    _require(item, (ItemStatus.REVIEW_ASSIGNED, ItemStatus.REVIEWING), "reclaim review")
    old_assignee = item.reviewer_id
    item.reviewer_id = None
    item.status = ItemStatus.REVIEW_PENDING
    return old_assignee


def quality_check(item: TaskItem, result: QaStatus) -> None:
    _require(item, (ItemStatus.COMPLETED,), "quality check")
    if result == QaStatus.UNCHECKED:
        raise InvalidTransition("quality result must be passed or rejected")
    item.qa_status = result
    if result == QaStatus.REJECTED:
        item.status = ItemStatus.CHANGES_REQUESTED
        item.reviewer_id = None
        item.completed_at = None
