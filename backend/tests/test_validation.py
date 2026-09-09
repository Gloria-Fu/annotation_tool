import pytest
from fastapi import HTTPException

from app.main import _validate_segments
from app.schemas import RevisionInput
from app.services.importer import ImportValidationError, _safe_relative, resolve_dataset_root


def test_submit_rejects_empty_segments():
    with pytest.raises(HTTPException) as error:
        _validate_segments(RevisionInput(payload={"segments": []}), length=10, require_text=True)
    assert error.value.status_code == 422


def test_submit_rejects_blank_text():
    with pytest.raises(HTTPException) as error:
        _validate_segments(
            RevisionInput(payload={"segments": [{"start_frame": 0, "end_frame": 2, "text": "  "}]}),
            length=10,
            require_text=True,
        )
    assert error.value.status_code == 422


def test_segment_ranges_must_not_overlap():
    with pytest.raises(HTTPException) as error:
        _validate_segments(
            RevisionInput(
                payload={
                    "segments": [
                        {"start_frame": 0, "end_frame": 4, "text": "a"},
                        {"start_frame": 3, "end_frame": 6, "text": "b"},
                    ]
                }
            ),
            length=10,
        )
    assert error.value.status_code == 422


def test_dataset_paths_stay_inside_mount(tmp_path, monkeypatch):
    allowed = tmp_path / "allowed"
    allowed.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    monkeypatch.setattr("app.services.importer.settings.dataset_mount_root", allowed)

    with pytest.raises(ImportValidationError):
        resolve_dataset_root(str(outside))
    with pytest.raises(ImportValidationError):
        _safe_relative(allowed, "../outside/file.parquet")
