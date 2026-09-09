from hashlib import sha256
from pathlib import Path

import pytest
from app.features.quality.service import check as quality_check
from app.features.task_packages.service import claim
from app.features.users.service import delete_user
from app.features.work_items.service import (
    clear_annotations,
    review_item,
    save_draft,
    submit_annotation,
)
from app.models import (
    AnnotationRevision,
    ClaimPolicy,
    Dataset,
    DatasetEpisode,
    DatasetStatus,
    ItemStatus,
    PackageStatus,
    Project,
    ProjectMember,
    QaStatus,
    Role,
    TaskItem,
    TaskPackage,
    User,
)
from app.schemas import QualityInput, ReviewInput, RevisionInput
from fastapi import HTTPException
from sqlalchemy import select


def make_user(db, username, role):
    user = User(
        username=username,
        display_name=username,
        password_hash="x",
        role=role,
        must_change_password=False,
    )
    db.add(user)
    db.flush()
    return user


def setup_item(db, tmp_path, monkeypatch):
    admin = make_user(db, "admin", Role.DEVELOPER_ADMIN)
    annotator = make_user(db, "annotator", Role.ANNOTATOR)
    reviewer = make_user(db, "reviewer", Role.REVIEWER)
    project = Project(name="Project", created_by_id=admin.id)
    db.add(project)
    db.flush()
    db.add_all(
        [
            ProjectMember(project_id=project.id, user_id=annotator.id),
            ProjectMember(project_id=project.id, user_id=reviewer.id),
        ]
    )
    dataset_root = tmp_path / "dataset"
    dataset_root.mkdir()
    monkeypatch.setattr("app.main.settings.dataset_mount_root", tmp_path)
    dataset = Dataset(
        project_id=project.id,
        name="D",
        root_path=str(dataset_root),
        metadata_hash="a" * 64,
        status=DatasetStatus.READY,
        created_by_id=admin.id,
    )
    db.add(dataset)
    db.flush()
    episode = DatasetEpisode(
        dataset_id=dataset.id, episode_index=0, length=10, data_path="data.parquet", video_paths={}
    )
    db.add(episode)
    db.flush()
    package = TaskPackage(
        project_id=project.id,
        dataset_id=dataset.id,
        title="Pack",
        status=PackageStatus.PUBLISHED,
        claim_policy=ClaimPolicy.SEQUENTIAL,
        created_by_id=admin.id,
    )
    db.add(package)
    db.flush()
    item = TaskItem(package_id=package.id, episode_id=episode.id, claim_order=0)
    db.add(item)
    db.commit()
    return admin, annotator, reviewer, package, item


def test_full_workflow_and_quality_rejection(db, tmp_path, monkeypatch):
    admin, annotator, reviewer, package, original = setup_item(db, tmp_path, monkeypatch)
    dataset = db.get(Dataset, package.dataset_id)
    source_path = Path(dataset.root_path) / "data.parquet"
    source_path.write_bytes(b"immutable source data")
    source_hash = sha256(source_path.read_bytes()).hexdigest()

    item = claim(package.id, annotator, False, db)
    assert item.id == original.id and item.status == ItemStatus.ANNOTATION_ASSIGNED
    with pytest.raises(HTTPException) as conflict:
        claim(package.id, annotator, False, db)
    assert conflict.value.status_code == 409

    item = submit_annotation(
        item.id,
        RevisionInput(
            payload={
                "segments": [{"id": "segment-1", "start_frame": 0, "end_frame": 10, "text": "pick"}]
            }
        ),
        annotator,
        db,
    )
    assert item.status == ItemStatus.REVIEW_PENDING
    item = claim(package.id, reviewer, True, db)
    assert item.status == ItemStatus.REVIEW_ASSIGNED
    item = review_item(item.id, ReviewInput(decision="approve"), reviewer, db)
    assert item.status == ItemStatus.COMPLETED
    item = quality_check(
        item.id, QualityInput(result=QaStatus.REJECTED, comment="抽检不通过"), admin, db
    )
    assert item.status == ItemStatus.CHANGES_REQUESTED
    assert item.annotator_id == annotator.id
    assert item.reviewer_id is None
    assert sha256(source_path.read_bytes()).hexdigest() == source_hash


def test_manager_cannot_review_own_annotation(db, tmp_path, monkeypatch):
    admin, _, _, package, item = setup_item(db, tmp_path, monkeypatch)
    manager = make_user(db, "manager", Role.ANNOTATION_MANAGER)
    project_id = db.get(TaskPackage, package.id).project_id
    db.add(ProjectMember(project_id=project_id, user_id=manager.id))
    db.commit()
    item = claim(package.id, manager, False, db)
    submit_annotation(
        item.id,
        RevisionInput(
            payload={
                "segments": [{"id": "segment-1", "start_frame": 0, "end_frame": 10, "text": "pick"}]
            }
        ),
        manager,
        db,
    )
    with pytest.raises(HTTPException) as conflict:
        claim(package.id, manager, True, db)
    assert conflict.value.status_code == 409


def test_delete_user_preserves_record_but_hides_account(db, monkeypatch):
    monkeypatch.setattr("app.features.users.service.delete_user_sessions", lambda _user_id: None)
    admin = make_user(db, "admin-delete", Role.DEVELOPER_ADMIN)
    target = make_user(db, "target-delete", Role.ANNOTATOR)
    delete_user(target.id, admin, db)
    db.expire_all()
    deleted = db.get(User, target.id)
    assert deleted.is_deleted is True
    assert deleted.is_active is False


def test_clear_annotations_persists_empty_segments(db, tmp_path, monkeypatch):
    _, annotator, _, package, original = setup_item(db, tmp_path, monkeypatch)
    item = claim(package.id, annotator, False, db)
    clear_annotations(item.id, annotator, db)
    db.expire_all()
    revision = db.scalar(
        select(AnnotationRevision).where(AnnotationRevision.task_item_id == original.id)
    )
    assert revision.payload == {"schema_version": "segments.v1", "segments": []}
    with pytest.raises(HTTPException) as conflict:
        submit_annotation(
            item.id,
            RevisionInput(payload={"schema_version": "segments.v1", "segments": []}),
            annotator,
            db,
        )
    assert conflict.value.status_code == 422


def test_draft_operations_use_annotation_state_machine(db, tmp_path, monkeypatch):
    _, annotator, _, package, original = setup_item(db, tmp_path, monkeypatch)
    item = claim(package.id, annotator, False, db)
    payload = RevisionInput(
        payload={
            "segments": [{"id": "segment-1", "start_frame": 0, "end_frame": 5, "text": "pick"}]
        }
    )

    item = save_draft(item.id, payload, annotator, db)
    assert item.status == ItemStatus.ANNOTATING
    item = save_draft(item.id, payload, annotator, db)
    assert item.status == ItemStatus.ANNOTATING
    assert db.scalar(
        select(AnnotationRevision).where(AnnotationRevision.task_item_id == original.id)
    )
