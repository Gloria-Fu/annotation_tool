import json

from app.models import Dataset, DatasetStatus, ImportJob, Project, Role, User
from app.services import importer


def test_imports_lerobot_v21_and_warns_on_aggregate_mismatch(tmp_path, db, monkeypatch):
    root = tmp_path / "dataset"
    (root / "meta").mkdir(parents=True)
    (root / "data/chunk-000").mkdir(parents=True)
    (root / "videos/chunk-000/cam.head").mkdir(parents=True)
    (root / "data/chunk-000/episode_000000.parquet").touch()
    (root / "videos/chunk-000/cam.head/episode_000000.mp4").touch()
    info = {
        "codebase_version": "v2.1",
        "total_episodes": 1,
        "total_videos": 999,
        "data_path": "data/chunk-{episode_chunk:03d}/episode_{episode_index:06d}.parquet",
        "video_path": "videos/chunk-{episode_chunk:03d}/{video_key}/episode_{episode_index:06d}.mp4",
        "features": {"cam.head": {"dtype": "video"}},
    }
    (root / "meta/info.json").write_text(json.dumps(info), encoding="utf-8")
    (root / "meta/episodes.jsonl").write_text(json.dumps({"episode_index": 0, "length": 12, "tasks": ["pick"]}) + "\n", encoding="utf-8")
    (root / "meta/tasks.jsonl").write_text(json.dumps({"task_index": 0, "task": "pick"}) + "\n", encoding="utf-8")
    monkeypatch.setattr(importer.settings, "dataset_mount_root", tmp_path)

    user = User(username="admin", display_name="Admin", password_hash="x", role=Role.DEVELOPER_ADMIN)
    db.add(user); db.flush()
    project = Project(name="P", created_by_id=user.id)
    db.add(project); db.flush()
    _, _, digest = importer.inspect_dataset(str(root))
    dataset = Dataset(project_id=project.id, name="D", root_path=str(root), metadata_hash=digest, created_by_id=user.id)
    db.add(dataset); db.flush()
    job = ImportJob(dataset_id=dataset.id)
    db.add(job); db.commit()

    importer.run_import(job.id)
    db.expire_all()
    assert db.get(Dataset, dataset.id).status == DatasetStatus.READY
    assert db.get(Dataset, dataset.id).episode_count == 1
    refreshed_job = db.get(ImportJob, job.id)
    assert refreshed_job.processed_count == 1
    assert refreshed_job.warning_count == 1
    assert refreshed_job.warnings[0]["code"] == "video_count_mismatch"


def test_rejects_path_outside_mount(tmp_path, monkeypatch):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    monkeypatch.setattr(importer.settings, "dataset_mount_root", allowed)
    try:
        importer.resolve_dataset_root(str(tmp_path))
        assert False, "expected validation error"
    except importer.ImportValidationError:
        pass

