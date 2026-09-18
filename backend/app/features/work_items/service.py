from collections.abc import Iterator
from datetime import UTC, datetime
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.permissions import ensure_task_package_access
from app.features.work_items import state_machine
from app.features.work_items.state_machine import InvalidTransition
from app.infrastructure.annotation_storage import AnnotationStorage, PreparedRevision
from app.models import (
    AnnotationRevision,
    AssignmentHistory,
    Dataset,
    DatasetEpisode,
    ItemStatus,
    QaStatus,
    QualityCheck,
    Role,
    TaskItem,
    TaskPackage,
    User,
    audit,
)
from app.schemas import ReviewInput, RevisionInput, TaskItemOut, WorkContext, WorkContextUser
from app.services.importer import resolve_dataset_root

annotation_storage = AnnotationStorage()


def commit_prepared_revision(
    db: Session,
    storage: AnnotationStorage,
    prepared: PreparedRevision,
    revision: AnnotationRevision,
) -> None:
    """Flush the revision row, publish its file, and commit as one workflow."""
    db.add(revision)
    try:
        db.flush()
        storage.finalize(prepared)
        db.commit()
    except Exception:
        db.rollback()
        storage.cleanup(prepared)
        raise


def item_access(
    db: Session, item_id: str, user: User
) -> tuple[TaskItem, TaskPackage, DatasetEpisode, Dataset]:
    item = db.get(TaskItem, item_id)
    package = db.get(TaskPackage, item.package_id) if item else None
    if not item or not package:
        raise HTTPException(status_code=404, detail="任务不存在")
    ensure_task_package_access(db, user, package)
    episode = db.get(DatasetEpisode, item.episode_id)
    dataset = db.get(Dataset, package.dataset_id)
    if not episode or not dataset:
        raise HTTPException(status_code=404, detail="任务关联的数据不存在")
    return item, package, episode, dataset


def latest_revision(db: Session, item_id: str) -> AnnotationRevision | None:
    return db.scalar(
        select(AnnotationRevision)
        .where(AnnotationRevision.task_item_id == item_id)
        .order_by(AnnotationRevision.version.desc())
        .limit(1)
    )


def blank_segment(length: int) -> dict[str, Any]:
    return {
        "id": "segment-1",
        "start_frame": 0,
        "end_frame": length,
        "text": "",
        "source": "user",
    }


def initial_segments(episode: DatasetEpisode, fps: float) -> dict[str, Any]:
    annotations = (episode.episode_metadata or {}).get("language_annotations", [])
    subtasks = [
        annotation
        for annotation in annotations
        if annotation.get("style") == "subtask" and annotation.get("timestamp") is not None
    ]
    starts = [
        max(0, min(episode.length, round(float(item["timestamp"]) * fps))) for item in subtasks
    ]
    segments: list[dict[str, Any]] = []
    for index, annotation in enumerate(subtasks):
        start = 0 if index == 0 else starts[index]
        end = starts[index + 1] if index + 1 < len(starts) else episode.length
        if end <= start:
            continue
        skill = next(
            (
                item.get("content")
                for item in annotations
                if item.get("style") == "skill"
                and item.get("timestamp") == annotation.get("timestamp")
            ),
            None,
        )
        segments.append(
            {
                "id": f"imported-{index + 1}",
                "start_frame": start,
                "end_frame": end,
                "text": str(annotation.get("content", "")).strip(),
                "source": "imported",
                "skill": skill,
            }
        )
    if not segments:
        segments = [blank_segment(episode.length)]
    return {"schema_version": "segments.v1", "segments": segments}


def validate_segments(
    payload: RevisionInput,
    length: int,
    require_text: bool = False,
    require_complete: bool = False,
) -> None:
    if payload.schema_version != "segments.v1":
        raise HTTPException(status_code=422, detail="仅支持 segments.v1 标注格式")
    segments = payload.payload.get("segments")
    if not isinstance(segments, list):
        raise HTTPException(status_code=422, detail="payload.segments 必须是数组")
    if any(not isinstance(segment, dict) for segment in segments):
        raise HTTPException(status_code=422, detail="每个片段必须是对象")
    ordered_segments = sorted(segments, key=lambda item: item.get("start_frame", -1))
    previous_end = 0 if require_complete else -1
    for segment in ordered_segments:
        try:
            start, end = int(segment["start_frame"]), int(segment["end_frame"])
        except (KeyError, TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="片段必须包含整数帧范围") from exc
        if start < 0 or end > length or start >= end or start < previous_end:
            raise HTTPException(status_code=422, detail="片段帧范围非法或存在重叠")
        if require_complete and start != previous_end:
            raise HTTPException(status_code=422, detail="提交审核时片段必须连续覆盖完整视频")
        if require_text and not str(segment.get("text", "")).strip():
            raise HTTPException(status_code=422, detail="提交审核时每个片段都必须填写文字")
        previous_end = end
    if require_text and not segments:
        raise HTTPException(status_code=422, detail="至少需要一个标注片段")
    if require_complete and (not ordered_segments or previous_end != length):
        raise HTTPException(status_code=422, detail="提交审核时片段必须连续覆盖完整视频")


def revision_document(
    item: TaskItem, episode: DatasetEpisode, fps: float, payload: dict[str, Any]
) -> dict[str, Any]:
    return {
        "schema_version": "segments.v1",
        "task_item_id": item.id,
        "episode_index": episode.episode_index,
        "fps": fps,
        "segments": payload.get("segments", []),
    }


def context(item_id: str, user: User, db: Session) -> WorkContext:
    item, _, episode, dataset = item_access(db, item_id, user)
    if (
        user.role != Role.DEVELOPER_ADMIN
        and user.id not in (item.annotator_id, item.reviewer_id)
        and user.role != Role.ANNOTATION_MANAGER
        and user.role != Role.OUTSOURCING_MANAGER
    ):
        raise HTTPException(status_code=403, detail="该任务未分配给你")
    revision = latest_revision(db, item.id)
    fps = float((dataset.info or {}).get("fps", 30))
    latest = (
        {
            "id": revision.id,
            "version": revision.version,
            "schema_version": revision.schema_version,
            "payload": revision.payload,
            "stage": revision.stage,
            "file_path": revision.file_path,
            "file_hash": revision.file_hash,
        }
        if revision
        else {
            "id": None,
            "version": 0,
            "schema_version": "segments.v1",
            "payload": initial_segments(episode, fps),
            "stage": "imported",
            "file_path": None,
            "file_hash": None,
        }
    )
    quality_comment_query = select(QualityCheck.comment).where(
        QualityCheck.task_item_id == item.id,
        QualityCheck.result == QaStatus.REJECTED,
    )
    if revision:
        quality_comment_query = quality_comment_query.where(
            QualityCheck.created_at > revision.created_at
        )
    submitted_annotator_id = db.scalar(
        select(AnnotationRevision.created_by_id)
        .where(
            AnnotationRevision.task_item_id == item.id,
            AnnotationRevision.stage == "submitted",
        )
        .order_by(AnnotationRevision.created_at.desc())
        .limit(1)
    )
    reviewed_reviewer_id = db.scalar(
        select(AnnotationRevision.created_by_id)
        .where(AnnotationRevision.task_item_id == item.id, AnnotationRevision.stage == "reviewed")
        .order_by(AnnotationRevision.created_at.desc())
        .limit(1)
    )
    legacy_annotated_statuses = {
        ItemStatus.REVIEW_PENDING,
        ItemStatus.REVIEW_ASSIGNED,
        ItemStatus.REVIEWING,
        ItemStatus.COMPLETED,
        ItemStatus.CHANGES_REQUESTED,
    }
    annotator_id = submitted_annotator_id or (
        item.annotator_id if item.status in legacy_annotated_statuses else None
    )
    reviewer_id = reviewed_reviewer_id or (
        item.reviewer_id if item.status == ItemStatus.COMPLETED else None
    )
    annotator = db.get(User, annotator_id) if annotator_id else None
    reviewer = db.get(User, reviewer_id) if reviewer_id else None
    return WorkContext(
        item=TaskItemOut.model_validate(item),
        annotator=WorkContextUser.model_validate(annotator) if annotator else None,
        reviewer=WorkContextUser.model_validate(reviewer) if reviewer else None,
        episode_index=episode.episode_index,
        length=episode.length,
        fps=fps,
        tasks=episode.tasks,
        data_url=f"/api/v1/work-items/{item.id}/data",
        video_urls={
            key: f"/api/v1/work-items/{item.id}/media/{key}" for key in episode.video_paths
        },
        preview_speed_factor=settings.annotation_preview_speed_factor,
        latest_revision=latest,
        review_comment=db.scalar(
            select(AssignmentHistory.reason)
            .where(
                AssignmentHistory.task_item_id == item.id,
                AssignmentHistory.stage == "review",
                AssignmentHistory.action == "request_changes",
            )
            .order_by(AssignmentHistory.created_at.desc())
            .limit(1)
        ),
        quality_comment=db.scalar(
            quality_comment_query.order_by(QualityCheck.created_at.desc()).limit(1)
        ),
    )


def _ensure_can_edit(item: TaskItem, user: User, action: str) -> None:
    if item.annotator_id != user.id or item.status not in (
        ItemStatus.ANNOTATION_ASSIGNED,
        ItemStatus.ANNOTATING,
        ItemStatus.CHANGES_REQUESTED,
    ):
        raise HTTPException(status_code=403, detail=f"不能{action}该标注任务")


def _start_annotation(item: TaskItem, user: User) -> None:
    if item.status == ItemStatus.ANNOTATING:
        return
    try:
        state_machine.start_annotation(item, user.id)
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


def save_draft(item_id: str, payload: RevisionInput, user: User, db: Session) -> TaskItem:
    item, _, episode, dataset = item_access(db, item_id, user)
    _ensure_can_edit(item, user, "编辑")
    validate_segments(payload, episode.length)
    previous = latest_revision(db, item.id)
    if payload.base_revision_id and (not previous or payload.base_revision_id != previous.id):
        raise HTTPException(status_code=409, detail="标注已被其他操作更新，请重新加载")
    version = previous.version + 1 if previous else 1
    prepared = annotation_storage.prepare_revision(
        resolve_dataset_root(dataset.root_path),
        item.id,
        version,
        revision_document(
            item, episode, float((dataset.info or {}).get("fps", 30)), payload.payload
        ),
    )
    revision = AnnotationRevision(
        task_item_id=item.id,
        version=version,
        schema_version=payload.schema_version,
        payload=payload.payload,
        stage="draft",
        created_by_id=user.id,
        source_revision_id=previous.id if previous else None,
        file_path=prepared.relative_path,
        file_hash=prepared.file_hash,
    )
    _start_annotation(item, user)
    audit(db, user.id, "save_draft", "task_item", item.id)
    commit_prepared_revision(db, annotation_storage, prepared, revision)
    return item


def submit_annotation(item_id: str, payload: RevisionInput, user: User, db: Session) -> TaskItem:
    item, _, episode, dataset = item_access(db, item_id, user)
    _ensure_can_edit(item, user, "提交")
    validate_segments(payload, episode.length, require_text=True, require_complete=True)
    previous = latest_revision(db, item.id)
    if payload.base_revision_id and (not previous or payload.base_revision_id != previous.id):
        raise HTTPException(status_code=409, detail="标注已被其他操作更新，请重新加载")
    version = previous.version + 1 if previous else 1
    try:
        state_machine.submit_annotation(item, user.id)
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    prepared = annotation_storage.prepare_revision(
        resolve_dataset_root(dataset.root_path),
        item.id,
        version,
        revision_document(
            item, episode, float((dataset.info or {}).get("fps", 30)), payload.payload
        ),
    )
    revision = AnnotationRevision(
        task_item_id=item.id,
        version=version,
        schema_version=payload.schema_version,
        payload=payload.payload,
        stage="submitted",
        created_by_id=user.id,
        source_revision_id=previous.id if previous else None,
        file_path=prepared.relative_path,
        file_hash=prepared.file_hash,
    )
    audit(db, user.id, "submit_annotation", "task_item", item.id)
    commit_prepared_revision(db, annotation_storage, prepared, revision)
    return item


def review_item(item_id: str, payload: ReviewInput, user: User, db: Session) -> TaskItem:
    item, _, episode, dataset = item_access(db, item_id, user)
    if (
        item.reviewer_id != user.id
        or item.annotator_id == user.id
        or item.status not in (ItemStatus.REVIEW_ASSIGNED, ItemStatus.REVIEWING)
    ):
        raise HTTPException(status_code=403, detail="不能审核该任务")
    previous = latest_revision(db, item.id)
    review_data = payload.payload or (previous.payload if previous else {"segments": []})
    review_payload = RevisionInput(schema_version="segments.v1", payload=review_data)
    validate_segments(
        review_payload,
        episode.length,
        require_text=payload.decision == "approve",
        require_complete=payload.decision == "approve",
    )
    version = previous.version + 1 if previous else 1
    try:
        if payload.decision == "approve":
            state_machine.approve(item, user.id)
        else:
            state_machine.request_changes(item, user.id)
    except InvalidTransition as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    prepared = annotation_storage.prepare_revision(
        resolve_dataset_root(dataset.root_path),
        item.id,
        version,
        revision_document(item, episode, float((dataset.info or {}).get("fps", 30)), review_data),
    )
    revision = AnnotationRevision(
        task_item_id=item.id,
        version=version,
        schema_version="segments.v1",
        payload=review_data,
        stage="reviewed",
        created_by_id=user.id,
        source_revision_id=previous.id if previous else None,
        file_path=prepared.relative_path,
        file_hash=prepared.file_hash,
    )
    if payload.decision == "request_changes":
        db.add(
            AssignmentHistory(
                task_item_id=item.id,
                stage="review",
                action="request_changes",
                assignee_id=item.annotator_id,
                actor_id=user.id,
                reason=(payload.comment or "").strip(),
            )
        )
    audit(db, user.id, f"review_{payload.decision}", "task_item", item.id, comment=payload.comment)
    commit_prepared_revision(db, annotation_storage, prepared, revision)
    return item


def save_review_draft(item_id: str, payload: RevisionInput, user: User, db: Session) -> TaskItem:
    item, _, episode, dataset = item_access(db, item_id, user)
    if (
        item.reviewer_id != user.id
        or item.annotator_id == user.id
        or item.status not in (ItemStatus.REVIEW_ASSIGNED, ItemStatus.REVIEWING)
    ):
        raise HTTPException(status_code=403, detail="不能保存该审核任务")
    validate_segments(payload, episode.length)
    previous = latest_revision(db, item.id)
    if payload.base_revision_id and (not previous or payload.base_revision_id != previous.id):
        raise HTTPException(status_code=409, detail="标注已被其他操作更新，请重新加载")
    version = previous.version + 1 if previous else 1
    try:
        state_machine.start_review(item, user.id)
    except InvalidTransition as exc:
        if item.status != ItemStatus.REVIEWING:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
    prepared = annotation_storage.prepare_revision(
        resolve_dataset_root(dataset.root_path),
        item.id,
        version,
        revision_document(
            item, episode, float((dataset.info or {}).get("fps", 30)), payload.payload
        ),
    )
    revision = AnnotationRevision(
        task_item_id=item.id,
        version=version,
        schema_version=payload.schema_version,
        payload=payload.payload,
        stage="review_draft",
        created_by_id=user.id,
        source_revision_id=previous.id if previous else None,
        file_path=prepared.relative_path,
        file_hash=prepared.file_hash,
    )
    audit(db, user.id, "save_review_draft", "task_item", item.id)
    commit_prepared_revision(db, annotation_storage, prepared, revision)
    return item


def clear_annotations(item_id: str, user: User, db: Session) -> TaskItem:
    item, _, episode, dataset = item_access(db, item_id, user)
    _ensure_can_edit(item, user, "清空")
    previous = latest_revision(db, item.id)
    version = previous.version + 1 if previous else 1
    payload = {"schema_version": "segments.v1", "segments": [blank_segment(episode.length)]}
    prepared = annotation_storage.prepare_revision(
        resolve_dataset_root(dataset.root_path),
        item.id,
        version,
        revision_document(item, episode, float((dataset.info or {}).get("fps", 30)), payload),
    )
    revision = AnnotationRevision(
        task_item_id=item.id,
        version=version,
        schema_version="segments.v1",
        payload=payload,
        stage="draft",
        created_by_id=user.id,
        source_revision_id=previous.id if previous else None,
        file_path=prepared.relative_path,
        file_hash=prepared.file_hash,
    )
    _start_annotation(item, user)
    audit(db, user.id, "clear_annotations", "task_item", item.id)
    commit_prepared_revision(db, annotation_storage, prepared, revision)
    return item


def authorized_file(item_id: str, user: User, db: Session, media_key: str | None = None) -> Path:
    item, _, episode, dataset = item_access(db, item_id, user)
    if user.role not in (
        Role.DEVELOPER_ADMIN,
        Role.ANNOTATION_MANAGER,
        Role.OUTSOURCING_MANAGER,
    ) and user.id not in (
        item.annotator_id,
        item.reviewer_id,
    ):
        raise HTTPException(status_code=403, detail="无权访问任务数据")
    relative = episode.video_paths.get(media_key) if media_key else episode.data_path
    if not relative:
        raise HTTPException(status_code=404, detail="媒体不存在")
    root = resolve_dataset_root(dataset.root_path)
    path = (root / relative).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise HTTPException(status_code=404, detail="文件不存在")
    return path


def _cache_headers(path: Path) -> dict[str, str]:
    stat = path.stat()
    modified = datetime.fromtimestamp(stat.st_mtime, UTC)
    return {
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
        "ETag": f'"{stat.st_mtime_ns:x}-{stat.st_size:x}"',
        "Last-Modified": format_datetime(modified, usegmt=True),
        "Vary": "Cookie",
    }


def _parse_range(range_header: str, size: int) -> tuple[int, int]:
    if not range_header.startswith("bytes=") or "," in range_header:
        raise HTTPException(status_code=416, detail="仅支持单个 bytes 范围")
    value = range_header[6:].strip()
    if "-" not in value:
        raise HTTPException(status_code=416, detail="Range 请求格式无效")
    start_text, end_text = value.split("-", 1)
    try:
        if not start_text:
            suffix_length = int(end_text)
            if suffix_length <= 0:
                raise ValueError
            start = max(0, size - suffix_length)
            end = size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else size - 1
            if start < 0 or end < start:
                raise ValueError
            end = min(end, size - 1)
    except ValueError as exc:
        raise HTTPException(status_code=416, detail="Range 请求格式无效") from exc
    if start >= size or end < 0:
        raise HTTPException(status_code=416, detail="请求范围超出文件大小")
    return start, end


def _etag_matches(if_none_match: str, etag: str) -> bool:
    return any(
        candidate.strip() == "*"
        or candidate.strip() == etag
        or candidate.strip().removeprefix("W/") == etag
        for candidate in if_none_match.split(",")
    )


def _modified_since_matches(if_modified_since: str, path: Path) -> bool:
    try:
        requested = parsedate_to_datetime(if_modified_since)
    except (TypeError, ValueError, OverflowError):
        return False
    if requested is None:
        return False
    if requested.tzinfo is None:
        return False
    modified = datetime.fromtimestamp(path.stat().st_mtime, UTC)
    return modified.replace(microsecond=0) <= requested.astimezone(UTC)


def _iter_file(path: Path, start: int, end: int, chunk_size: int = 1024 * 1024) -> Iterator[bytes]:
    with path.open("rb") as handle:
        handle.seek(start)
        remaining = end - start + 1
        while remaining:
            chunk = handle.read(min(chunk_size, remaining))
            if not chunk:
                return
            remaining -= len(chunk)
            yield chunk


def _media_response(
    path: Path,
    media_type: str,
    range_header: str | None,
    if_none_match: str | None,
    if_modified_since: str | None,
) -> Response:
    size = path.stat().st_size
    headers = _cache_headers(path)
    if if_none_match and _etag_matches(if_none_match, headers["ETag"]):
        return Response(status_code=304, headers=headers)
    if not if_none_match and if_modified_since and _modified_since_matches(if_modified_since, path):
        return Response(status_code=304, headers=headers)
    if not range_header:
        return FileResponse(path, media_type=media_type, headers=headers)
    try:
        start, end = _parse_range(range_header, size)
    except HTTPException as exc:
        exc.headers = {**headers, "Content-Range": f"bytes */{size}"}
        raise
    headers.update(
        {
            "Content-Length": str(end - start + 1),
            "Content-Range": f"bytes {start}-{end}/{size}",
        }
    )
    return StreamingResponse(
        _iter_file(path, start, end),
        status_code=206,
        media_type=media_type,
        headers=headers,
    )


def item_data(item_id: str, user: User, db: Session) -> FileResponse:
    return FileResponse(
        authorized_file(item_id, user, db),
        media_type="application/vnd.apache.parquet",
    )


def item_media(
    item_id: str,
    media_key: str,
    user: User,
    db: Session,
    range_header: str | None = None,
    if_none_match: str | None = None,
    if_modified_since: str | None = None,
) -> Response:
    return _media_response(
        authorized_file(item_id, user, db, media_key),
        media_type="video/mp4",
        range_header=range_header,
        if_none_match=if_none_match,
        if_modified_since=if_modified_since,
    )
