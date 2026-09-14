from app.features.task_packages.service import claim, my_tasks
from app.features.work_items.service import review_item, submit_annotation
from app.models import ItemStatus
from app.schemas import ReviewInput, RevisionInput

from test_workflow import setup_item


def annotation_payload() -> RevisionInput:
    return RevisionInput(
        payload={
            "segments": [
                {
                    "id": "segment-1",
                    "start_frame": 0,
                    "end_frame": 10,
                    "text": "完成操作",
                }
            ]
        }
    )


def test_my_tasks_default_to_pending_and_history_uses_event_records(db, tmp_path, monkeypatch):
    _, annotator, reviewer, package, original = setup_item(db, tmp_path, monkeypatch)

    assert my_tasks("annotation", "pending", annotator, db) == []
    assert my_tasks("annotation", "history", annotator, db) == []

    item = claim(package.id, annotator, False, db)
    assert [task.id for task in my_tasks("annotation", "pending", annotator, db)] == [item.id]

    submit_annotation(item.id, annotation_payload(), annotator, db)
    assert my_tasks("annotation", "pending", annotator, db) == []
    assert [task.id for task in my_tasks("annotation", "history", annotator, db)] == [original.id]

    claim(package.id, reviewer, True, db)
    review_item(
        item.id,
        ReviewInput(decision="request_changes", comment="请补充说明"),
        reviewer,
        db,
    )
    db.refresh(item)
    assert item.status == ItemStatus.CHANGES_REQUESTED
    assert item.reviewer_id is None
    assert [task.id for task in my_tasks("annotation", "pending", annotator, db)] == [original.id]
    assert [task.id for task in my_tasks("review", "history", reviewer, db)] == [original.id]

    submit_annotation(item.id, annotation_payload(), annotator, db)
    assert [task.id for task in my_tasks("annotation", "history", annotator, db)] == [original.id]
    claim(package.id, reviewer, True, db)
    review_item(item.id, ReviewInput(decision="approve"), reviewer, db)

    assert my_tasks("review", "pending", reviewer, db) == []
    assert [task.id for task in my_tasks("review", "history", reviewer, db)] == [original.id]
