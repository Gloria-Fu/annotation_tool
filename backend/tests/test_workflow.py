from hashlib import sha256
from pathlib import Path

import pytest
from app.core.auth import verify_password
from app.features.projects.service import list_projects
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
from app.features.task_packages.service import (
    add_package_group,
    claim,
    create_package,
    list_items,
    list_packages,
    reclaim_item,
    remove_package_group,
)
from app.features.users.service import create_user, delete_user, list_users, update_user
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
    UserGroup,
    UserGroupMember,
)
from app.schemas import (
    PackageCreate,
    QualityBatchCreate,
    QualityInput,
    ReclaimRequest,
    ReviewInput,
    RevisionInput,
    TaskPackageGroupCreate,
    UserCreate,
    UserUpdate,
)
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


def test_quality_batch_excludes_items_already_sampled_by_any_batch(db, tmp_path, monkeypatch):
    admin, _, _, package, first_item = setup_item(db, tmp_path, monkeypatch)
    items = [first_item]
    for index in range(1, 5):
        episode = DatasetEpisode(
            dataset_id=package.dataset_id,
            episode_index=index,
            length=10,
            data_path=f"data-{index}.parquet",
            video_paths={},
        )
        db.add(episode)
        db.flush()
        item = TaskItem(
            package_id=package.id,
            episode_id=episode.id,
            claim_order=index,
            status=ItemStatus.COMPLETED,
            qa_status=QaStatus.UNCHECKED,
        )
        db.add(item)
        items.append(item)
    first_item.status = ItemStatus.COMPLETED
    first_item.qa_status = QaStatus.UNCHECKED
    db.commit()

    first_batch = create_batch(
        QualityBatchCreate(package_id=package.id, mode="count", count=2, seed="quality"),
        admin,
        db,
    )
    first_sampled_ids = {sample.task_item_id for sample in first_batch.samples}
    assert len(first_sampled_ids) == 2

    second_batch = create_batch(
        QualityBatchCreate(package_id=package.id, mode="all", seed="quality"),
        admin,
        db,
    )
    second_sampled_ids = {sample.task_item_id for sample in second_batch.samples}

    assert first_sampled_ids.isdisjoint(second_sampled_ids)
    assert first_sampled_ids | second_sampled_ids == {item.id for item in items}


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


def test_group_authorized_package_replaces_project_membership_access(db, tmp_path, monkeypatch):
    admin, _, _, package, item = setup_item(db, tmp_path, monkeypatch)
    external = make_user(db, "external-annotator", Role.ANNOTATOR)
    group = UserGroup(name="External team", created_by_id=admin.id)
    db.add(group)
    db.flush()
    db.add(UserGroupMember(group_id=group.id, user_id=external.id))
    db.commit()

    add_package_group(
        package.id,
        TaskPackageGroupCreate(group_id=group.id),
        admin,
        db,
    )

    assert [project.id for project in list_projects(external, db)] == [package.project_id]
    assert [listed["id"] for listed in list_packages(package.project_id, external, db)] == [
        package.id
    ]
    assert [listed.id for listed in list_items(package.id, None, external, db)] == [item.id]
    claimed = claim(package.id, external, False, db)
    assert claimed.id == item.id
    assert context(item.id, external, db).item.id == item.id


def test_outsourcing_manager_is_scoped_to_managed_groups_and_can_view_items(
    db, tmp_path, monkeypatch
):
    monkeypatch.setattr("app.features.users.service.delete_user_sessions", lambda _user_id: None)
    admin, _, _, package, item = setup_item(db, tmp_path, monkeypatch)
    manager = make_user(db, "outsourcing-manager", Role.OUTSOURCING_MANAGER)
    other_manager = make_user(db, "other-outsourcing-manager", Role.OUTSOURCING_MANAGER)
    worker = create_user(
        UserCreate(
            username="managed-worker",
            display_name="Managed Worker",
            password="password-1234",
            role=Role.ANNOTATOR,
            group_ids=[],
        ),
        admin,
        db,
    )
    own_group = UserGroup(
        name="Managed team",
        created_by_id=admin.id,
        manager_id=manager.id,
    )
    other_group = UserGroup(
        name="Other team",
        created_by_id=admin.id,
        manager_id=other_manager.id,
    )
    db.add_all([own_group, other_group])
    db.flush()
    db.add(UserGroupMember(group_id=own_group.id, user_id=worker.id))
    other_package = TaskPackage(
        project_id=package.project_id,
        dataset_id=package.dataset_id,
        title="Other package",
        status=PackageStatus.PUBLISHED,
        claim_policy=ClaimPolicy.SEQUENTIAL,
        created_by_id=admin.id,
    )
    db.add(other_package)
    db.flush()
    db.commit()
    add_package_group(package.id, TaskPackageGroupCreate(group_id=own_group.id), admin, db)
    add_package_group(
        other_package.id,
        TaskPackageGroupCreate(group_id=other_group.id),
        admin,
        db,
    )

    assert [project.id for project in list_projects(manager, db)] == [package.project_id]
    assert [row["id"] for row in list_packages(package.project_id, manager, db)] == [package.id]
    assert [row["id"] for row in list_packages(None, manager, db)] == [package.id]
    assert [listed.id for listed in list_items(package.id, None, manager, db)] == [item.id]
    assert context(item.id, manager, db).item.id == item.id
    with pytest.raises(HTTPException) as hidden:
        list_items(other_package.id, None, manager, db)
    assert hidden.value.status_code == 403

    assert [listed.id for listed in list_users(db, manager)] == [worker.id]
    with pytest.raises(HTTPException, match="只能创建标注员或审核员"):
        create_user(
            UserCreate(
                username="forbidden-manager",
                display_name="Forbidden Manager",
                password="password-1234",
                role=Role.ANNOTATION_MANAGER,
                group_ids=[own_group.id],
            ),
            manager,
            db,
        )
    with pytest.raises(HTTPException, match="只能将账号加入自己负责的群组"):
        create_user(
            UserCreate(
                username="wrong-group-worker",
                display_name="Wrong Group Worker",
                password="password-1234",
                role=Role.ANNOTATOR,
                group_ids=[other_group.id],
            ),
            manager,
            db,
        )
    with pytest.raises(HTTPException, match="群组只能加入标注员或审核员"):
        create_user(
            UserCreate(
                username="manager-in-group",
                display_name="Manager In Group",
                password="password-1234",
                role=Role.OUTSOURCING_MANAGER,
                group_ids=[own_group.id],
            ),
            admin,
            db,
        )
    update_user(worker.id, UserUpdate(display_name="Managed Worker Updated"), manager, db)
    assert db.get(User, worker.id).display_name == "Managed Worker Updated"
    update_user(worker.id, UserUpdate(reset_password="new-password-1234"), manager, db)
    db.refresh(worker)
    assert worker.must_change_password is True
    assert verify_password(worker.password_hash, "new-password-1234")
    with pytest.raises(HTTPException) as self_reset:
        update_user(manager.id, UserUpdate(reset_password="self-password-1234"), manager, db)
    assert self_reset.value.status_code == 400


def test_outsourcing_manager_can_reclaim_managed_group_assignments(db, tmp_path, monkeypatch):
    admin, _, _, package, item = setup_item(db, tmp_path, monkeypatch)
    manager = make_user(db, "outsourcing-reclaim-manager", Role.OUTSOURCING_MANAGER)
    annotator = make_user(db, "managed-reclaim-annotator", Role.ANNOTATOR)
    reviewer = make_user(db, "managed-reclaim-reviewer", Role.REVIEWER)
    group = UserGroup(name="Reclaim team", created_by_id=admin.id, manager_id=manager.id)
    db.add(group)
    db.flush()
    db.add_all(
        [
            UserGroupMember(group_id=group.id, user_id=annotator.id),
            UserGroupMember(group_id=group.id, user_id=reviewer.id),
        ]
    )
    db.commit()
    add_package_group(package.id, TaskPackageGroupCreate(group_id=group.id), admin, db)

    claimed = claim(package.id, annotator, False, db)
    reclaimed = reclaim_item(
        claimed.id,
        ReclaimRequest(reason="合作方负责人回收标注任务"),
        manager,
        db,
    )
    assert reclaimed.id == item.id
    assert reclaimed.status == ItemStatus.AVAILABLE
    assert reclaimed.annotator_id is None

    item.annotator_id = annotator.id
    item.reviewer_id = reviewer.id
    item.status = ItemStatus.REVIEW_ASSIGNED
    db.commit()
    reclaimed_review = reclaim_item(
        item.id,
        ReclaimRequest(reason="合作方负责人回收审核任务"),
        manager,
        db,
    )
    assert reclaimed_review.status == ItemStatus.REVIEW_PENDING
    assert reclaimed_review.reviewer_id is None
    assert reclaimed_review.annotator_id == annotator.id


def test_outsourcing_manager_cannot_reclaim_other_group_assignments(db, tmp_path, monkeypatch):
    admin, _, _, package, item = setup_item(db, tmp_path, monkeypatch)
    manager = make_user(db, "scoped-reclaim-manager", Role.OUTSOURCING_MANAGER)
    other_manager = make_user(db, "other-scoped-reclaim-manager", Role.OUTSOURCING_MANAGER)
    managed_worker = make_user(db, "scoped-reclaim-worker", Role.ANNOTATOR)
    other_worker = make_user(db, "other-scoped-reclaim-worker", Role.ANNOTATOR)
    own_group = UserGroup(name="Scoped reclaim team", created_by_id=admin.id, manager_id=manager.id)
    other_group = UserGroup(
        name="Other scoped reclaim team",
        created_by_id=admin.id,
        manager_id=other_manager.id,
    )
    db.add_all([own_group, other_group])
    db.flush()
    db.add_all(
        [
            UserGroupMember(group_id=own_group.id, user_id=managed_worker.id),
            UserGroupMember(group_id=other_group.id, user_id=other_worker.id),
        ]
    )
    db.commit()
    add_package_group(package.id, TaskPackageGroupCreate(group_id=own_group.id), admin, db)

    item.annotator_id = other_worker.id
    item.status = ItemStatus.ANNOTATING
    db.commit()

    with pytest.raises(HTTPException) as forbidden:
        reclaim_item(
            item.id,
            ReclaimRequest(reason="不能回收非本组任务"),
            manager,
            db,
        )
    assert forbidden.value.status_code == 403
    assert forbidden.value.detail == "只能回收自己负责群组成员领取的任务"


def test_developer_admin_can_reset_password_but_annotation_manager_cannot(
    db, tmp_path, monkeypatch
):
    monkeypatch.setattr("app.features.users.service.delete_user_sessions", lambda _user_id: None)
    admin, _, _, package, _ = setup_item(db, tmp_path, monkeypatch)
    manager = make_user(db, "annotation-manager-reset", Role.ANNOTATION_MANAGER)
    target = make_user(db, "reset-target", Role.ANNOTATOR)
    db.add_all(
        [
            ProjectMember(project_id=package.project_id, user_id=manager.id),
            ProjectMember(project_id=package.project_id, user_id=target.id),
        ]
    )
    db.commit()

    with pytest.raises(HTTPException) as forbidden:
        update_user(target.id, UserUpdate(reset_password="manager-password-1234"), manager, db)
    assert forbidden.value.status_code == 403

    update_user(target.id, UserUpdate(reset_password="admin-password-1234"), admin, db)
    db.refresh(target)
    assert target.must_change_password is True
    assert verify_password(target.password_hash, "admin-password-1234")

    with pytest.raises(HTTPException) as self_reset:
        update_user(admin.id, UserUpdate(reset_password="self-password-1234"), admin, db)
    assert self_reset.value.status_code == 400


def test_unauthorized_user_cannot_list_or_open_group_package(db, tmp_path, monkeypatch):
    admin, _, _, package, _ = setup_item(db, tmp_path, monkeypatch)
    external = make_user(db, "outside-annotator", Role.ANNOTATOR)
    group = UserGroup(name="Authorized team", created_by_id=admin.id)
    db.add(group)
    db.flush()
    db.add(UserGroupMember(group_id=group.id, user_id=external.id))
    db.commit()
    add_package_group(package.id, TaskPackageGroupCreate(group_id=group.id), admin, db)

    outsider = make_user(db, "unauthorized-annotator", Role.ANNOTATOR)
    assert list_packages(package.project_id, outsider, db) == []
    with pytest.raises(HTTPException) as forbidden:
        list_items(package.id, None, outsider, db)
    assert forbidden.value.status_code == 403


def test_removing_last_package_group_does_not_restore_project_access(db, tmp_path, monkeypatch):
    admin, annotator, _, package, _ = setup_item(db, tmp_path, monkeypatch)
    group = UserGroup(name="Temporary team", created_by_id=admin.id)
    db.add(group)
    db.flush()
    db.commit()
    add_package_group(package.id, TaskPackageGroupCreate(group_id=group.id), admin, db)
    remove_package_group(package.id, group.id, admin, db)
    db.refresh(package)

    assert package.group_access_configured is True
    assert list_packages(package.project_id, annotator, db) == []
    with pytest.raises(HTTPException) as forbidden:
        list_items(package.id, None, annotator, db)
    assert forbidden.value.status_code == 403


def test_deprecated_package_member_ids_do_not_create_package_restrictions(
    db, tmp_path, monkeypatch
):
    admin, annotator, _, package, _ = setup_item(db, tmp_path, monkeypatch)
    db.add(
        DatasetEpisode(
            dataset_id=package.dataset_id,
            episode_index=1,
            length=10,
            data_path="data-1.parquet",
            video_paths={},
        )
    )
    db.commit()

    created = create_package(
        PackageCreate(
            project_id=package.project_id,
            dataset_id=package.dataset_id,
            title="New package",
            item_count=1,
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


def test_create_package_allocates_only_unassigned_episodes(db, tmp_path, monkeypatch):
    admin, _, _, package, _ = setup_item(db, tmp_path, monkeypatch)
    db.add_all(
        [
            DatasetEpisode(
                dataset_id=package.dataset_id,
                episode_index=index,
                length=10,
                data_path=f"data-{index}.parquet",
                video_paths={},
            )
            for index in range(1, 7)
        ]
    )
    db.commit()

    first = create_package(
        PackageCreate(
            project_id=package.project_id,
            dataset_id=package.dataset_id,
            title="Sequential package",
            item_count=2,
            claim_policy=ClaimPolicy.SEQUENTIAL,
        ),
        admin,
        db,
    )
    first_indices = [
        episode.episode_index
        for episode in db.scalars(
            select(DatasetEpisode)
            .join(TaskItem, TaskItem.episode_id == DatasetEpisode.id)
            .where(TaskItem.package_id == first.id)
            .order_by(TaskItem.claim_order)
        ).all()
    ]
    assert first_indices == [1, 2]

    second = create_package(
        PackageCreate(
            project_id=package.project_id,
            dataset_id=package.dataset_id,
            title="Random package",
            item_count=2,
            claim_policy=ClaimPolicy.RANDOM,
            random_seed=7,
        ),
        admin,
        db,
    )
    second_indices = [
        episode.episode_index
        for episode in db.scalars(
            select(DatasetEpisode)
            .join(TaskItem, TaskItem.episode_id == DatasetEpisode.id)
            .where(TaskItem.package_id == second.id)
            .order_by(TaskItem.claim_order)
        ).all()
    ]
    assert len(second_indices) == 2
    assert set(second_indices).issubset({3, 4, 5, 6})
    assert set(first_indices).isdisjoint(second_indices)

    with pytest.raises(HTTPException, match="剩余未分配 episode 只有 2 条"):
        create_package(
            PackageCreate(
                project_id=package.project_id,
                dataset_id=package.dataset_id,
                title="Too large",
                item_count=3,
            ),
            admin,
            db,
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
