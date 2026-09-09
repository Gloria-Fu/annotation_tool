from pathlib import Path
from typing import Any

from app.infrastructure.annotation_storage import AnnotationStorage

_storage = AnnotationStorage()


def write_annotation_file(
    dataset_root: Path,
    task_item_id: str,
    version: int,
    document: dict[str, Any],
) -> tuple[str, str]:
    return _storage.write_revision(dataset_root, task_item_id, version, document)
