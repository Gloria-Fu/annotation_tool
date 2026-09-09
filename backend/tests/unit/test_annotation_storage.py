import json

import pytest
from app.features.work_items.service import commit_prepared_revision
from app.infrastructure.annotation_storage import AnnotationStorage


def test_storage_writes_only_inside_annotations(tmp_path):
    storage = AnnotationStorage()
    relative, digest = storage.write_revision(
        tmp_path,
        "item-1",
        1,
        {"segments": []},
    )
    target = tmp_path / relative
    assert target == tmp_path / "annotations/item-1/v0001.json"
    assert json.loads(target.read_text(encoding="utf-8")) == {"segments": []}
    assert len(digest) == 64


def test_storage_cleans_temporary_file_when_finalize_fails(tmp_path, monkeypatch):
    storage = AnnotationStorage()
    prepared = storage.prepare_revision(tmp_path, "item-1", 1, {"segments": []})
    monkeypatch.setattr("os.replace", lambda *_args: (_ for _ in ()).throw(OSError("disk full")))
    with pytest.raises(OSError):
        try:
            storage.finalize(prepared)
        except OSError:
            storage.cleanup(prepared)
            raise
    assert not prepared.temporary_path.exists()


def test_revision_commit_cleans_published_file_when_database_commit_fails(tmp_path):
    storage = AnnotationStorage()
    prepared = storage.prepare_revision(tmp_path, "item-1", 1, {"segments": []})

    class FailingSession:
        rolled_back = False

        def add(self, _revision):
            return None

        def flush(self):
            return None

        def commit(self):
            raise RuntimeError("database unavailable")

        def rollback(self):
            self.rolled_back = True

    session = FailingSession()
    with pytest.raises(RuntimeError):
        commit_prepared_revision(session, storage, prepared, object())

    assert session.rolled_back is True
    assert not prepared.temporary_path.exists()
    assert not prepared.target_path.exists()
