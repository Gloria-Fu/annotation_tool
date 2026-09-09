import hashlib
import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class PreparedRevision:
    temporary_path: Path
    target_path: Path
    relative_path: str
    file_hash: str


class AnnotationStorage:
    """Write immutable revision files below dataset_root/annotations only."""

    def write_revision(
        self,
        dataset_root: Path,
        task_item_id: str,
        version: int,
        document: dict[str, Any],
    ) -> tuple[str, str]:
        prepared = self.prepare_revision(dataset_root, task_item_id, version, document)
        try:
            self.finalize(prepared)
        except Exception:
            self.cleanup(prepared)
            raise
        return prepared.relative_path, prepared.file_hash

    def prepare_revision(
        self,
        dataset_root: Path,
        task_item_id: str,
        version: int,
        document: dict[str, Any],
    ) -> PreparedRevision:
        root = dataset_root.resolve()
        annotations_root = (root / "annotations").resolve()
        output_dir = (annotations_root / task_item_id).resolve()
        if not output_dir.is_relative_to(annotations_root):
            raise ValueError("标注文件路径非法")
        output_dir.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True).encode("utf-8")
        digest = hashlib.sha256(payload).hexdigest()
        filename = f"v{version:04d}.json"
        target = output_dir / filename
        if target.exists():
            raise FileExistsError(f"标注版本已存在: {filename}")
        with tempfile.NamedTemporaryFile(
            dir=output_dir,
            prefix=f".{filename}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
            handle.write(payload)
            handle.flush()
            os.fsync(handle.fileno())
        return PreparedRevision(
            temporary_path=temporary,
            target_path=target,
            relative_path=str(target.relative_to(root)),
            file_hash=digest,
        )

    @staticmethod
    def finalize(prepared: PreparedRevision) -> None:
        os.replace(prepared.temporary_path, prepared.target_path)

    @staticmethod
    def cleanup(prepared: PreparedRevision) -> None:
        prepared.temporary_path.unlink(missing_ok=True)
        prepared.target_path.unlink(missing_ok=True)

    def find_orphans(self, dataset_root: Path, known_paths: set[str]) -> list[Path]:
        root = dataset_root.resolve()
        annotations = root / "annotations"
        if not annotations.exists():
            return []
        return [
            path
            for path in annotations.rglob("*")
            if path.is_file() and str(path.relative_to(root)) not in known_paths
        ]
