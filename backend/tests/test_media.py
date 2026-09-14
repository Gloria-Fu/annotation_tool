import asyncio

from app.features.work_items.service import item_media
from app.models import (
    ClaimPolicy,
    Dataset,
    DatasetEpisode,
    DatasetStatus,
    ItemStatus,
    PackageStatus,
    Project,
    ProjectMember,
    Role,
    TaskItem,
    TaskPackage,
    User,
)
from fastapi import HTTPException


async def _read_response(response):
    return b"".join([chunk async for chunk in response.body_iterator])


def _setup_media_item(db, tmp_path, monkeypatch):
    admin = User(
        username="admin",
        display_name="admin",
        password_hash="x",
        role=Role.DEVELOPER_ADMIN,
        must_change_password=False,
    )
    annotator = User(
        username="annotator",
        display_name="annotator",
        password_hash="x",
        role=Role.ANNOTATOR,
        must_change_password=False,
    )
    db.add_all([admin, annotator])
    db.flush()
    project = Project(name="Project", created_by_id=admin.id)
    db.add(project)
    db.flush()
    db.add(ProjectMember(project_id=project.id, user_id=annotator.id))
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
        dataset_id=dataset.id,
        episode_index=0,
        length=10,
        data_path="data.parquet",
        video_paths={},
    )
    package = TaskPackage(
        project_id=project.id,
        dataset_id=dataset.id,
        title="Pack",
        status=PackageStatus.PUBLISHED,
        claim_policy=ClaimPolicy.SEQUENTIAL,
        created_by_id=admin.id,
    )
    db.add_all([episode, package])
    db.flush()
    item = TaskItem(package_id=package.id, episode_id=episode.id, claim_order=0)
    db.add(item)
    db.commit()
    return annotator, package, item


def test_media_supports_single_byte_range(db, tmp_path, monkeypatch):
    annotator, package, item = _setup_media_item(db, tmp_path, monkeypatch)
    dataset = db.get(Dataset, package.dataset_id)
    episode = db.get(DatasetEpisode, item.episode_id)
    assert dataset is not None and episode is not None
    video = tmp_path / "dataset" / "video.mp4"
    video.write_bytes(b"0123456789")
    episode.video_paths = {"head": "video.mp4"}
    item.annotator_id = annotator.id
    item.status = ItemStatus.ANNOTATION_ASSIGNED
    db.commit()

    response = item_media(item.id, "head", annotator, db, range_header="bytes=2-5")

    assert response.status_code == 206
    assert response.headers["content-range"] == "bytes 2-5/10"
    assert response.headers["content-length"] == "4"
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["cache-control"] == "private, max-age=3600"
    assert response.headers["last-modified"]
    assert asyncio.run(_read_response(response)) == b"2345"


def test_media_returns_not_modified_for_matching_etag(db, tmp_path, monkeypatch):
    annotator, package, item = _setup_media_item(db, tmp_path, monkeypatch)
    dataset = db.get(Dataset, package.dataset_id)
    episode = db.get(DatasetEpisode, item.episode_id)
    assert dataset is not None and episode is not None
    video = tmp_path / "dataset" / "video.mp4"
    video.write_bytes(b"video")
    episode.video_paths = {"head": "video.mp4"}
    item.annotator_id = annotator.id
    item.status = ItemStatus.ANNOTATION_ASSIGNED
    db.commit()

    first = item_media(item.id, "head", annotator, db)
    second = item_media(
        item.id,
        "head",
        annotator,
        db,
        if_none_match=first.headers["etag"],
    )

    assert second.status_code == 304
    assert second.body == b""


def test_media_returns_not_modified_for_matching_last_modified(db, tmp_path, monkeypatch):
    annotator, package, item = _setup_media_item(db, tmp_path, monkeypatch)
    dataset = db.get(Dataset, package.dataset_id)
    episode = db.get(DatasetEpisode, item.episode_id)
    assert dataset is not None and episode is not None
    video = tmp_path / "dataset" / "video.mp4"
    video.write_bytes(b"video")
    episode.video_paths = {"head": "video.mp4"}
    item.annotator_id = annotator.id
    item.status = ItemStatus.ANNOTATION_ASSIGNED
    db.commit()

    first = item_media(item.id, "head", annotator, db)
    second = item_media(
        item.id,
        "head",
        annotator,
        db,
        if_modified_since=first.headers["last-modified"],
    )

    assert second.status_code == 304
    assert second.body == b""


def test_media_rejects_unsatisfiable_range(db, tmp_path, monkeypatch):
    annotator, package, item = _setup_media_item(db, tmp_path, monkeypatch)
    dataset = db.get(Dataset, package.dataset_id)
    episode = db.get(DatasetEpisode, item.episode_id)
    assert dataset is not None and episode is not None
    video = tmp_path / "dataset" / "video.mp4"
    video.write_bytes(b"video")
    episode.video_paths = {"head": "video.mp4"}
    item.annotator_id = annotator.id
    item.status = ItemStatus.ANNOTATION_ASSIGNED
    db.commit()

    try:
        item_media(item.id, "head", annotator, db, range_header="bytes=99-100")
    except HTTPException as exc:
        assert exc.status_code == 416
        assert exc.headers is not None
        assert exc.headers["Content-Range"] == "bytes */5"
    else:
        raise AssertionError("expected an unsatisfiable range")
