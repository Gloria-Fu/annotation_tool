import hashlib
import json
from pathlib import Path
from typing import Any

from sqlalchemy import delete

from app.config import settings
from app.database import SessionLocal
from app.models import Dataset, DatasetEpisode, DatasetStatus, ImportJob, utcnow


class ImportValidationError(ValueError):
    pass


def resolve_dataset_root(raw_path: str) -> Path:
    mount_root = settings.dataset_mount_root.resolve()
    path = Path(raw_path).resolve()
    if not path.is_relative_to(mount_root):
        raise ImportValidationError(f"数据集路径必须位于 {mount_root} 下")
    if not path.is_dir():
        raise ImportValidationError("数据集目录不存在")
    return path


def inspect_dataset(raw_path: str) -> tuple[Path, dict[str, Any], str]:
    root = resolve_dataset_root(raw_path)
    info_path = root / "meta" / "info.json"
    if not info_path.is_file():
        raise ImportValidationError("缺少 meta/info.json")
    raw = info_path.read_bytes()
    try:
        info = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ImportValidationError(f"info.json 格式错误: {exc}") from exc
    if info.get("codebase_version") != "v2.1":
        raise ImportValidationError("仅支持 codebase_version=v2.1")
    for required in ("data_path", "video_path", "features"):
        if required not in info:
            raise ImportValidationError(f"info.json 缺少字段 {required}")
    digest = hashlib.sha256(raw).hexdigest()
    return root, info, digest


def _safe_relative(root: Path, value: str) -> str:
    path = (root / value).resolve()
    if not path.is_relative_to(root):
        raise ImportValidationError(f"非法数据路径: {value}")
    return str(path.relative_to(root))


def _format_path(template: str, episode_index: int, video_key: str = "") -> str:
    return template.format(
        episode_chunk=episode_index // 1000,
        episode_index=episode_index,
        video_key=video_key,
    )


def run_import(job_id: str) -> None:
    with SessionLocal() as db:
        job = db.get(ImportJob, job_id)
        if not job:
            return
        dataset = db.get(Dataset, job.dataset_id)
        job.status = DatasetStatus.IMPORTING
        job.started_at = utcnow()
        dataset.status = DatasetStatus.IMPORTING
        db.commit()
        try:
            root, info, digest = inspect_dataset(dataset.root_path)
            dataset.metadata_hash = digest
            episodes_path = root / "meta" / "episodes.jsonl"
            tasks_path = root / "meta" / "tasks.jsonl"
            if not episodes_path.is_file() or not tasks_path.is_file():
                raise ImportValidationError("缺少 meta/episodes.jsonl 或 meta/tasks.jsonl")

            mappings: dict[int, dict[str, Any]] = {}
            mapping_path = root / "meta" / "episode_source_mapping.jsonl"
            if mapping_path.is_file():
                for line_no, line in enumerate(mapping_path.open(encoding="utf-8"), 1):
                    if line.strip():
                        try:
                            row = json.loads(line)
                            mappings[int(row["episode_index"])] = row
                        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
                            raise ImportValidationError(f"episode_source_mapping.jsonl 第 {line_no} 行错误") from exc

            db.execute(delete(DatasetEpisode).where(DatasetEpisode.dataset_id == dataset.id))
            seen: set[int] = set()
            batch: list[DatasetEpisode] = []
            warnings: list[dict[str, Any]] = []
            video_keys = [key for key, value in info["features"].items() if value.get("dtype") == "video"]
            with episodes_path.open(encoding="utf-8") as handle:
                for line_no, line in enumerate(handle, 1):
                    if not line.strip():
                        continue
                    try:
                        record = json.loads(line)
                        episode_index = int(record["episode_index"])
                    except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
                        raise ImportValidationError(f"episodes.jsonl 第 {line_no} 行错误") from exc
                    if episode_index in seen:
                        raise ImportValidationError(f"episode_index {episode_index} 重复")
                    seen.add(episode_index)
                    mapping = mappings.get(episode_index, {})
                    data_rel = mapping.get("data_path") or _format_path(info["data_path"], episode_index)
                    data_rel = _safe_relative(root, data_rel)
                    if not (root / data_rel).is_file():
                        raise ImportValidationError(f"episode {episode_index} 缺少 Parquet: {data_rel}")
                    mapped_videos = mapping.get("video_paths", {})
                    video_paths: dict[str, str] = {}
                    for video_key in video_keys:
                        rel = mapped_videos.get(video_key) or _format_path(info["video_path"], episode_index, video_key)
                        rel = _safe_relative(root, rel)
                        video_paths[video_key] = rel
                        if not (root / rel).is_file():
                            raise ImportValidationError(f"episode {episode_index} 缺少视频: {rel}")
                    batch.append(
                        DatasetEpisode(
                            dataset_id=dataset.id,
                            episode_index=episode_index,
                            length=int(record.get("length", 0)),
                            tasks=record.get("tasks", []),
                            data_path=data_rel,
                            video_paths=video_paths,
                            source_episode=record.get("source_episode"),
                            episode_metadata={"language_annotations": record.get("language_annotations", [])},
                        )
                    )
                    if len(batch) >= 1000:
                        db.add_all(batch)
                        db.flush()
                        job.processed_count += len(batch)
                        batch.clear()
                        db.commit()
            if batch:
                db.add_all(batch)
                job.processed_count += len(batch)

            declared_episodes = info.get("total_episodes")
            if declared_episodes is not None and declared_episodes != len(seen):
                warnings.append({"code": "episode_count_mismatch", "declared": declared_episodes, "actual": len(seen)})
            declared_videos = info.get("total_videos")
            actual_videos = len(seen) * len(video_keys)
            if declared_videos is not None and declared_videos != actual_videos:
                warnings.append({"code": "video_count_mismatch", "declared": declared_videos, "actual": actual_videos})
            job.warnings = warnings
            job.warning_count = len(warnings)
            job.status = DatasetStatus.READY
            job.finished_at = utcnow()
            dataset.status = DatasetStatus.READY
            dataset.info = info
            dataset.episode_count = len(seen)
            dataset.warning_count = len(warnings)
            dataset.error_message = None
            db.commit()
        except Exception as exc:
            db.rollback()
            job = db.get(ImportJob, job_id)
            dataset = db.get(Dataset, job.dataset_id)
            message = str(exc)[:4000]
            job.status = DatasetStatus.FAILED
            job.error_message = message
            job.finished_at = utcnow()
            dataset.status = DatasetStatus.FAILED
            dataset.error_message = message
            db.commit()
