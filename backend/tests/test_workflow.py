from hashlib import sha256
from pathlib import Path

import pytest
from app.features.quality.service import (
    check as quality_check,
)
from app.features.quality.service import (
    create_batch,
    get_batch,
)
from app.features.quality.service import (
    history as quality_history,
)
from app.features.task_packages.service import claim, create_package, list_items, list_packages
from app.features.users.service import delete_user
from app.features.work_items.service import (
    clear_annotations,
    context,
    initial_segments,
    review_item,
    save_draft,
    save_review_draft,
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
    QualityCheck,
    QualitySample,
    Role,
    TaskItem,
    TaskPackage,
    TaskPackageMember,
    User,
)
from app.schemas import PackageCreate, QualityBatchCreate, QualityInput, ReviewInput, RevisionInput
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
    claimed_context = context(item.id, annotator, db)
    assert claimed_context.annotator is None
    assert claimed_context.reviewer is None
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
    submitted_context = context(item.id, annotator, db)
    assert submitted_context.annotator is not None
    assert submitted_context.annotator.username == annotator.username
    assert submitted_context.reviewer is None
    item = claim(package.id, reviewer, True, db)
    assert item.status == ItemStatus.REVIEW_ASSIGNED
    assigned_review_context = context(item.id, reviewer, db)
    assert assigned_review_context.annotator is not None
    assert assigned_review_context.annotator.username == annotator.username
    assert assigned_review_context.reviewer is None
    item = save_review_draft(
        item.id,
        RevisionInput(
            payload={
                "segments": [
                    {
                        "id": "segment-1",
                        "start_frame": 0,
                        "end_frame": 10,
                        "text": "pick reviewed",
                    }
                ]
            }
        ),
        reviewer,
        db,
    )
    assert item.status == ItemStatus.REVIEWING
    latest_revision = db.scalar(
        select(AnnotationRevision)
        .where(AnnotationRevision.task_item_id == item.id)
        .order_by(AnnotationRevision.version.desc())
        .limit(1)
    )
    assert latest_revision is not None
    assert latest_revision.stage == "review_draft"
    item = review_item(item.id, ReviewInput(decision="approve"), reviewer, db)
    assert item.status == ItemStatus.COMPLETED
    reviewed_context = context(item.id, reviewer, db)
    assert reviewed_context.annotator is not None
    assert reviewed_context.annotator.username == annotator.username
    assert reviewed_context.reviewer is not None
    assert reviewed_context.reviewer.username == reviewer.username
    item = quality_check(
        item.id, QualityInput(result=QaStatus.REJECTED, comment="抽检不通过"), admin, db
    )
    assert item.status == ItemStatus.CHANGES_REQUESTED
    assert item.annotator_id == annotator.id
    assert item.reviewer_id is None
    rework_context = context(item.id, annotator, db)
    assert rework_context.reviewer is not None
    assert rework_context.reviewer.username == reviewer.username
    assert sha256(source_path.read_bytes()).hexdigest() == source_hash


def test_quality_batch_persists_sample_and_checked_revision(db, tmp_path, monkeypatch):
    admin, annotator, reviewer, package, original = setup_item(db, tmp_path, monkeypatch)
    item = claim(package.id, annotator, False, db)
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
    claim(package.id, reviewer, True, db)
    review_item(item.id, ReviewInput(decision="approve"), reviewer, db)

    created = create_batch(
        QualityBatchCreate(package_id=package.id, mode="all", seed="traceable"),
        admin,
        db,
        include_samples=False,
    )
    assert created.total_samples == 1
    assert created.samples == []

    batch = get_batch(created.id, admin, db)
    assert batch.total_samples == 1
    assert batch.samples[0].task_item_id == original.id
    assert db.scalar(select(QualitySample).where(QualitySample.batch_id == batch.id))

    quality_check(
        item.id,
        QualityInput(result=QaStatus.PASSED, batch_id=batch.id),
        admin,
        db,
    )
    checked = db.scalar(
        select(QualityCheck).where(
            QualityCheck.batch_id == batch.id,
            QualityCheck.task_item_id == item.id,
        )
    )
    assert checked is not None
    assert checked.revision_id is not None
    assert checked.revision_version == 2
    assert get_batch(batch.id, admin, db).status == "completed"
    assert quality_history(item.id, admin, db)[0].batch_id == batch.id


def test_quality_batch_manager_can_check_and_reviewer_cannot(db, tmp_path, monkeypatch):
    admin, annotator, reviewer, package, item = setup_item(db, tmp_path, monkeypatch)
    manager = make_user(db, "quality-manager", Role.ANNOTATION_MANAGER)
    db.add(ProjectMember(project_id=package.project_id, user_id=manager.id))
    db.commit()

    claim(package.id, annotator, False, db)
    submit_annotation(
        item.id,
        RevisionInput(
            payload={
                "segments": [{"id": "segment-1", "start_frame": 0, "end_frame": 10, "text": "pick"}]
            }
        ),
        annotator,
        db,
    )
    claim(package.id, reviewer, True, db)
    review_item(item.id, ReviewInput(decision="approve"), reviewer, db)
    batch = create_batch(
        QualityBatchCreate(
            package_id=package.id,
            assignee_id=manager.id,
            mode="all",
            seed="assigned-manager",
        ),
        admin,
        db,
    )

    assert get_batch(batch.id, manager, db).id == batch.id
    with pytest.raises(HTTPException) as forbidden:
        get_batch(batch.id, reviewer, db)
    assert forbidden.value.status_code == 403

    quality_check(
        item.id,
        QualityInput(result=QaStatus.PASSED, batch_id=batch.id),
        manager,
        db,
    )
    assert get_batch(batch.id, manager, db).checked_samples == 1


def test_reviewer_can_choose_sequential_or_random_claim_order(db, tmp_path, monkeypatch):
    _, annotator, reviewer, package, first_item = setup_item(db, tmp_path, monkeypatch)
    first_item.annotator_id = annotator.id
    first_item.status = ItemStatus.REVIEW_PENDING
    second_episode = DatasetEpisode(
        dataset_id=package.dataset_id,
        episode_index=1,
        length=10,
        data_path="data-1.parquet",
        video_paths={},
    )
    third_episode = DatasetEpisode(
        dataset_id=package.dataset_id,
        episode_index=2,
        length=10,
        data_path="data-2.parquet",
        video_paths={},
    )
    db.add_all([second_episode, third_episode])
    db.flush()
    second_item = TaskItem(
        package_id=package.id,
        episode_id=second_episode.id,
        claim_order=1,
        status=ItemStatus.REVIEW_PENDING,
        annotator_id=annotator.id,
    )
    third_item = TaskItem(
        package_id=package.id,
        episode_id=third_episode.id,
        claim_order=2,
        status=ItemStatus.REVIEW_PENDING,
        annotator_id=annotator.id,
    )
    db.add_all([second_item, third_item])
    db.commit()

    sequential = claim(package.id, reviewer, True, db, ClaimPolicy.SEQUENTIAL)
    assert sequential.claim_order == 0

    monkeypatch.setattr(
        "app.features.task_packages.service.random.choice",
        lambda candidates: candidates[-1],
    )
    random_item = claim(package.id, reviewer, True, db, ClaimPolicy.RANDOM)
    assert random_item.claim_order == 2


def test_project_members_can_access_legacy_restricted_package(db, tmp_path, monkeypatch):
    _, annotator, reviewer, package, item = setup_item(db, tmp_path, monkeypatch)
    db.add(TaskPackageMember(package_id=package.id, user_id=annotator.id))
    item.annotator_id = annotator.id
    item.status = ItemStatus.REVIEW_PENDING
    db.commit()

    packages = list_packages(package.project_id, reviewer, db)
    assert [listed["id"] for listed in packages] == [package.id]
    assert [listed.id for listed in list_items(package.id, None, reviewer, db)] == [item.id]
    assert claim(package.id, reviewer, True, db).id == item.id


def test_deprecated_package_member_ids_do_not_create_package_restrictions(
    db, tmp_path, monkeypatch
):
    admin, annotator, _, package, _ = setup_item(db, tmp_path, monkeypatch)

    created = create_package(
        PackageCreate(
            project_id=package.project_id,
            dataset_id=package.dataset_id,
            title="New package",
            member_ids=[annotator.id],
        ),
        admin,
        db,
    )

    assert (
        db.scalars(
            select(TaskPackageMember).where(TaskPackageMember.package_id == created.id)
        ).all()
        == []
    )


def test_quality_rejection_exposes_reason_and_rework_reopens_qa(db, tmp_path, monkeypatch):
    admin, annotator, reviewer, package, item = setup_item(db, tmp_path, monkeypatch)
    claim(package.id, annotator, False, db)
    submit_annotation(
        item.id,
        RevisionInput(
            payload={
                "segments": [{"id": "segment-1", "start_frame": 0, "end_frame": 10, "text": "pick"}]
            }
        ),
        annotator,
        db,
    )
    claim(package.id, reviewer, True, db)
    review_item(item.id, ReviewInput(decision="approve"), reviewer, db)
    batch = create_batch(
        QualityBatchCreate(package_id=package.id, mode="all", seed="rework"),
        admin,
        db,
    )
    quality_check(
        item.id,
        QualityInput(
            result=QaStatus.REJECTED,
            comment="动作边界不准确",
            batch_id=batch.id,
        ),
        admin,
        db,
    )
    work_context = context(item.id, annotator, db)
    assert work_context.quality_comment == "动作边界不准确"
    assert item.qa_status == QaStatus.REJECTED

    submit_annotation(
        item.id,
        RevisionInput(
            payload={
                "segments": [
                    {"id": "segment-1", "start_frame": 0, "end_frame": 10, "text": "corrected"}
                ]
            }
        ),
        annotator,
        db,
    )
    assert item.qa_status == QaStatus.UNCHECKED
    claim(package.id, reviewer, True, db)
    review_item(item.id, ReviewInput(decision="approve"), reviewer, db)
    second_batch = create_batch(
        QualityBatchCreate(package_id=package.id, mode="all", seed="recheck"),
        admin,
        db,
    )
    assert [sample.task_item_id for sample in second_batch.samples] == [item.id]


def test_claim_failure_explains_annotation_and_review_reasons(db, tmp_path, monkeypatch):
    _, annotator, _, package, _ = setup_item(db, tmp_path, monkeypatch)
    claim(package.id, annotator, False, db)

    with pytest.raises(HTTPException) as annotation_error:
        claim(package.id, annotator, False, db)
    assert annotation_error.value.status_code == 409
    assert "暂无可领取标注任务" in annotation_error.value.detail


def test_review_claim_failure_explains_review_reason(db, tmp_path, monkeypatch):
    _, _, reviewer, package, _ = setup_item(db, tmp_path, monkeypatch)
    with pytest.raises(HTTPException) as review_error:
        claim(package.id, reviewer, True, db)
    assert review_error.value.status_code == 409
    assert "暂无可领取审核任务" in review_error.value.detail


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


def test_clear_annotations_persists_one_blank_full_episode_segment(db, tmp_path, monkeypatch):
    _, annotator, _, package, original = setup_item(db, tmp_path, monkeypatch)
    item = claim(package.id, annotator, False, db)
    clear_annotations(item.id, annotator, db)
    db.expire_all()
    revision = db.scalar(
        select(AnnotationRevision).where(AnnotationRevision.task_item_id == original.id)
    )
    assert revision.payload == {
        "schema_version": "segments.v1",
        "segments": [
            {
                "id": "segment-1",
                "start_frame": 0,
                "end_frame": 10,
                "text": "",
                "source": "user",
            }
        ],
    }
    with pytest.raises(HTTPException) as conflict:
        submit_annotation(
            item.id,
            RevisionInput(
                payload={
                    "schema_version": "segments.v1",
                    "segments": [
                        {
                            "id": "segment-1",
                            "start_frame": 0,
                            "end_frame": 10,
                            "text": "",
                            "source": "user",
                        }
                    ],
                }
            ),
            annotator,
            db,
        )
    assert conflict.value.status_code == 422


def test_initial_segments_uses_one_blank_segment_without_subtasks(db, tmp_path, monkeypatch):
    _, _, _, package, original = setup_item(db, tmp_path, monkeypatch)
    episode = db.get(DatasetEpisode, original.episode_id)

    assert initial_segments(episode, fps=30) == {
        "schema_version": "segments.v1",
        "segments": [
            {
                "id": "segment-1",
                "start_frame": 0,
                "end_frame": 10,
                "text": "",
                "source": "user",
            }
        ],
    }


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
