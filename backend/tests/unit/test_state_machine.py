from datetime import UTC, datetime

import pytest
from app.features.work_items import state_machine
from app.features.work_items.state_machine import InvalidTransition
from app.models import ItemStatus, QaStatus, TaskItem


def make_item() -> TaskItem:
    return TaskItem(
        package_id="package",
        episode_id="episode",
        claim_order=0,
        status=ItemStatus.AVAILABLE,
    )


def test_annotation_review_state_flow():
    item = make_item()
    state_machine.claim_annotation(item, "annotator")
    assert item.status == ItemStatus.ANNOTATION_ASSIGNED
    state_machine.start_annotation(item, "annotator")
    state_machine.submit_annotation(item, "annotator", datetime.now(UTC))
    assert item.status == ItemStatus.REVIEW_PENDING
    state_machine.claim_review(item, "reviewer")
    state_machine.start_review(item, "reviewer")
    state_machine.approve(item, "reviewer")
    assert item.status == ItemStatus.COMPLETED


def test_review_cannot_be_assigned_to_annotator():
    item = make_item()
    state_machine.claim_annotation(item, "same-user")
    state_machine.submit_annotation(item, "same-user")
    with pytest.raises(InvalidTransition):
        state_machine.claim_review(item, "same-user")


def test_quality_rejection_returns_to_annotation():
    item = make_item()
    item.status = ItemStatus.COMPLETED
    item.qa_status = QaStatus.PASSED
    state_machine.quality_check(item, QaStatus.REJECTED)
    assert item.status == ItemStatus.CHANGES_REQUESTED
    assert item.qa_status == QaStatus.REJECTED
    assert item.reviewer_id is None
