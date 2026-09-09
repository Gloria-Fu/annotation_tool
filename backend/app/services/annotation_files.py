import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any


def write_annotation_file(dataset_root: Path, task_item_id: str, version: int, document: dict[str, Any]) -> tuple[str, str]:
    """Write one immutable annotation revision below the dataset annotations directory."""
    root = dataset_root.resolve()
    output_dir = (root / "annotations" / task_item_id).resolve()
    if not output_dir.is_relative_to(root / "annotations"):
        raise ValueError("标注文件路径非法")
    output_dir.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
    digest = hashlib.sha256(payload).hexdigest()
    filename = f"v{version:04d}.json"
    target = output_dir / filename
    if target.exists():
        raise FileExistsError(f"标注版本已存在: {filename}")
    with tempfile.NamedTemporaryFile(dir=output_dir, prefix=f".{filename}.", suffix=".tmp", delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, target)
    return str(target.relative_to(root)), digest
