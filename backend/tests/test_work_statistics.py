from datetime import UTC, datetime, timedelta

import pytest
from app.features.reports.service import people_work_statistics, personal_work_statistics, stats
from app.models import (
    AnnotationRevision,
    AssignmentHistory,
    AuditLog,
    ClaimPolicy,
    Dataset,
    ItemStatus,
    PackageStatus,
    ProjectMember,
    Role,
    TaskItem,
    TaskPackage,
)
from fastapi import HTTPException

from test_workflow import make_user, setup_item


def add_event_data(db, item, annotator, reviewer, start):
    db.add_all(
        [
            AssignmentHistory(
                task_item_id=item.id,
                stage="annotation",
                action="claim",
                assignee_id=annotator.id,
                actor_id=annotator.id,
                created_at=start,
            ),
            AnnotationRevision(
                task_item_id=item.id,
                version=1,
                schema_version="segments.v1",
                payload={"segments": []},
                stage="submitted",
                created_by_id=annotator.id,
                created_at=start + timedelta(minutes=30),
            ),
            AssignmentHistory(
                task_item_id=item.id,
                stage="review",
                action="claim",
                assignee_id=reviewer.id,
                actor_id=reviewer.id,
                created_at=start + timedelta(minutes=35),
            ),
            AuditLog(
                actor_id=reviewer.id,
                action="review_request_changes",
                entity_type="task_item",
                entity_id=item.id,
                details={},
                created_at=start + timedelta(minutes=50),
            ),
            AssignmentHistory(
                task_item_id=item.id,
                stage="review",
                action="request_changes",
                assignee_id=annotator.id,
                actor_id=reviewer.id,
                reason="请补充说明",
                created_at=start + timedelta(minutes=50),
            ),
            AnnotationRevision(
                task_item_id=item.id,
                version=2,
                schema_version="segments.v1",
                payload={"segments": []},
                stage="submitted",
                created_by_id=annotator.id,
                created_at=start + timedelta(hours=2),
            ),
            AssignmentHistory(
                task_item_id=item.id,
                stage="review",
                action="assign",
                assignee_id=reviewer.id,
                actor_id=reviewer.id,
                created_at=start + timedelta(hours=2, minutes=5),
            ),
            AuditLog(
                actor_id=reviewer.id,
                action="review_approve",
                entity_type="task_item",
                entity_id=item.id,
                details={},
                created_at=start + timedelta(hours=2, minutes=20),
            ),
        ]
    )
    db.commit()


def test_personal_statistics_use_history_and_revision_timeline(db, tmp_path, monkeypatch):
    _, annotator, reviewer, package, item = setup_item(db, tmp_path, monkeypatch)
    dataset = db.get(Dataset, package.dataset_id)
    dataset.info = {"fps": 20}
    db.commit()
    start = datetime(2026, 9, 10, 1, 0, tzinfo=UTC)
    add_event_data(db, item, annotator, reviewer, start)

    result = personal_work_statistics(
        annotator,
        db,
        package.project_id,
        start.date(),
        (start + timedelta(days=1)).date(),
        "day",
    )

    assert result.summary.claimed_count == 1
    assert result.summary.first_submissions == 1
    assert result.summary.resubmissions == 1
    assert result.summary.returned_count == 1
    assert result.summary.final_approved_count == 1
    assert result.summary.first_pass_rate == 0
    assert result.summary.rework_rate == 1
    assert result.summary.effective_video_seconds == 10 / 20
    assert result.summary.average_completion_seconds == 1800
    assert result.periods[0].period_start.isoformat() == "2026-09-10"
    assert result.periods[0].effective_video_seconds == 10 / 20
    assert result.periods[1].effective_video_seconds == 0

    reviewer_result = personal_work_statistics(
        reviewer,
        db,
        package.project_id,
        start.date(),
        (start + timedelta(days=1)).date(),
        "day",
    )
    assert reviewer_result.summary.review_claimed_count == 2
    assert reviewer_result.summary.review_count == 2
    assert reviewer_result.summary.approved_count == 1
    assert reviewer_result.summary.rejected_count == 1
    assert reviewer_result.summary.review_pass_rate == 0.5
    assert reviewer_result.summary.review_return_rate == 0.5
    assert reviewer_result.summary.effective_video_seconds == 10 / 20
    assert reviewer_result.summary.average_review_seconds == 1200


def test_project_statistics_deduplicate_completed_episode_duration(db, tmp_path, monkeypatch):
    admin, annotator, reviewer, package, item = setup_item(db, tmp_path, monkeypatch)
    start = datetime(2026, 9, 10, tzinfo=UTC)
    add_event_data(db, item, annotator, reviewer, start)
    item.annotator_id = annotator.id
    item.status = ItemStatus.COMPLETED
    duplicate_package = TaskPackage(
        project_id=package.project_id,
        dataset_id=package.dataset_id,
        title="Duplicate package",
        status=PackageStatus.PUBLISHED,
        claim_policy=ClaimPolicy.SEQUENTIAL,
        created_by_id=admin.id,
    )
    db.add(duplicate_package)
    db.flush()
    duplicate_item = TaskItem(
        package_id=duplicate_package.id,
        episode_id=item.episode_id,
        claim_order=0,
        status=ItemStatus.COMPLETED,
        annotator_id=annotator.id,
    )
    db.add(duplicate_item)
    db.commit()

    result = stats(package.project_id, admin, db)

    assert result.effective_video_seconds == 10 / 30
    assert result.by_person[0]["completed"] == 2
    assert result.by_person[0]["effective_video_seconds"] == 10 / 30


def test_people_statistics_are_project_scoped_and_manager_protected(db, tmp_path, monkeypatch):
    _, annotator, reviewer, package, item = setup_item(db, tmp_path, monkeypatch)
    manager = make_user(db, "manager-stats", Role.ANNOTATION_MANAGER)
    db.add(ProjectMember(project_id=package.project_id, user_id=manager.id))
    db.commit()
    add_event_data(db, item, annotator, reviewer, datetime(2026, 9, 10, tzinfo=UTC))

    result = people_work_statistics(
        manager,
        db,
        package.project_id,
        datetime(2026, 9, 10, tzinfo=UTC).date(),
        datetime(2026, 9, 10, tzinfo=UTC).date(),
        Role.ANNOTATOR,
    )
    assert [person.user_id for person in result.people] == [annotator.id]
    assert result.people[0].first_submissions == 1

    with pytest.raises(HTTPException) as error:
        people_work_statistics(
            annotator,
            db,
            package.project_id,
            None,
            None,
            None,
        )
    assert error.value.status_code == 403
