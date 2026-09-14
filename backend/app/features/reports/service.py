import csv
import io
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from statistics import fmean
from typing import Literal

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import false, func, select
from sqlalchemy.orm import Session

from app.core.permissions import ensure_project_access, managed_group_ids, managed_user_ids
from app.features.users.service import manageable_project_ids
from app.models import (
    AnnotationRevision,
    AssignmentHistory,
    AuditLog,
    Dataset,
    DatasetEpisode,
    ItemStatus,
    ProjectMember,
    Role,
    TaskItem,
    TaskPackage,
    TaskPackageGroup,
    User,
)
from app.schemas import (
    PeopleWorkStatisticsOut,
    PersonalWorkStatisticsOut,
    StatsOut,
    WorkMetricOut,
)


def stats(project_id: str, user: User, db: Session) -> StatsOut:
    ensure_project_access(db, user, project_id)
    if user.role not in (Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER):
        raise HTTPException(status_code=403, detail="无权查看统计")
    rows = db.execute(
        select(TaskItem.status, func.count(TaskItem.id))
        .join(TaskPackage)
        .where(TaskPackage.project_id == project_id)
        .group_by(TaskItem.status)
    ).all()
    by_status = {status.value: count for status, count in rows}
    total = sum(by_status.values())
    completed_rows = db.execute(
        select(
            User.id,
            User.display_name,
            DatasetEpisode.id,
            DatasetEpisode.length,
            Dataset.info,
        )
        .join(TaskItem, TaskItem.annotator_id == User.id)
        .join(TaskPackage, TaskPackage.id == TaskItem.package_id)
        .join(DatasetEpisode, DatasetEpisode.id == TaskItem.episode_id)
        .join(Dataset, Dataset.id == TaskPackage.dataset_id)
        .where(TaskPackage.project_id == project_id, TaskItem.status == ItemStatus.COMPLETED)
    ).all()
    completed_video_durations: dict[str, float] = {}
    person_names: dict[str, str] = {}
    person_completed_counts: dict[str, int] = defaultdict(int)
    person_video_ids: dict[str, set[str]] = defaultdict(set)
    for user_id, display_name, episode_id, length, dataset_info in completed_rows:
        duration = _video_duration_seconds(length, dataset_info)
        completed_video_durations.setdefault(episode_id, duration)
        person_names[user_id] = display_name
        person_completed_counts[user_id] += 1
        person_video_ids[user_id].add(episode_id)

    by_person = []
    for user_id, video_ids in person_video_ids.items():
        effective_seconds = sum(
            completed_video_durations[episode_id]
            for episode_id in video_ids
            if episode_id in completed_video_durations
        )
        by_person.append(
            {
                "user_id": user_id,
                "display_name": person_names[user_id],
                "completed": person_completed_counts[user_id],
                "effective_video_seconds": effective_seconds,
            }
        )
    return StatsOut(
        project_id=project_id,
        total=total,
        by_status=by_status,
        completion_rate=(by_status.get(ItemStatus.COMPLETED.value, 0) / total if total else 0),
        effective_video_seconds=sum(completed_video_durations.values()),
        by_person=by_person,
    )


def task_report(project_id: str, user: User, db: Session) -> StreamingResponse:
    ensure_project_access(db, user, project_id, manager=user.role != Role.DEVELOPER_ADMIN)
    rows = db.execute(
        select(
            TaskPackage.title,
            DatasetEpisode.episode_index,
            TaskItem.status,
            TaskItem.annotator_id,
            TaskItem.reviewer_id,
            TaskItem.qa_status,
            TaskItem.updated_at,
        )
        .join(TaskItem, TaskItem.package_id == TaskPackage.id)
        .join(DatasetEpisode, DatasetEpisode.id == TaskItem.episode_id)
        .where(TaskPackage.project_id == project_id)
        .order_by(TaskPackage.title, DatasetEpisode.episode_index)
    ).all()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(
        ["任务包", "episode_index", "状态", "标注员ID", "审核员ID", "抽检状态", "更新时间(UTC)"]
    )
    for row in rows:
        writer.writerow(
            [
                row[0],
                row[1],
                row[2].value,
                row[3] or "",
                row[4] or "",
                row[5].value,
                row[6].isoformat(),
            ]
        )
    content = "\ufeff" + output.getvalue()
    return StreamingResponse(
        iter([content.encode("utf-8")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="task-report.csv"'},
    )


@dataclass(frozen=True)
class AssignmentEvent:
    item_id: str
    stage: str
    action: str
    assignee_id: str | None
    created_at: datetime


@dataclass(frozen=True)
class SubmissionEvent:
    item_id: str
    user_id: str
    created_at: datetime


@dataclass(frozen=True)
class ReviewEvent:
    item_id: str
    user_id: str
    decision: str
    created_at: datetime


@dataclass(frozen=True)
class VideoInfo:
    video_id: str
    duration_seconds: float


@dataclass(frozen=True)
class WorkEvents:
    assignments: tuple[AssignmentEvent, ...]
    submissions: tuple[SubmissionEvent, ...]
    reviews: tuple[ReviewEvent, ...]
    returns: tuple[AssignmentEvent, ...]
    video_by_item: dict[str, VideoInfo]


WorkGranularity = Literal["day", "week", "month"]


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _video_duration_seconds(length: int, dataset_info: object) -> float:
    fps = 30.0
    if isinstance(dataset_info, dict):
        raw_fps = dataset_info.get("fps")
        try:
            parsed_fps = float(raw_fps) if raw_fps is not None else fps
        except (TypeError, ValueError):
            parsed_fps = fps
        if parsed_fps > 0:
            fps = parsed_fps
    return max(0, length) / fps


def _scope_project_ids(db: Session, user: User, project_id: str | None) -> set[str] | None:
    if user.role == Role.OUTSOURCING_MANAGER:
        managed_projects = set(
            db.scalars(
                select(TaskPackage.project_id)
                .join(TaskPackageGroup, TaskPackageGroup.package_id == TaskPackage.id)
                .where(TaskPackageGroup.group_id.in_(managed_group_ids(db, user)))
            ).all()
        )
        if project_id:
            if project_id not in managed_projects:
                raise HTTPException(status_code=403, detail="无权查看该项目统计")
            return {project_id}
        return managed_projects
    if project_id:
        ensure_project_access(db, user, project_id)
        return {project_id}
    if user.role == Role.DEVELOPER_ADMIN:
        return None
    return manageable_project_ids(db, user)


def _project_scoped(statement, project_ids: set[str] | None):
    if project_ids is None:
        return statement
    if not project_ids:
        return statement.where(false())
    return statement.where(TaskPackage.project_id.in_(project_ids))


def _load_work_events(db: Session, project_ids: set[str] | None) -> WorkEvents:
    video_rows = db.execute(
        _project_scoped(
            select(
                TaskItem.id,
                DatasetEpisode.id,
                DatasetEpisode.length,
                Dataset.info,
            )
            .join(DatasetEpisode, TaskItem.episode_id == DatasetEpisode.id)
            .join(TaskPackage, TaskItem.package_id == TaskPackage.id)
            .join(Dataset, TaskPackage.dataset_id == Dataset.id),
            project_ids,
        )
    ).all()
    video_by_item = {
        row[0]: VideoInfo(
            video_id=row[1],
            duration_seconds=_video_duration_seconds(row[2], row[3]),
        )
        for row in video_rows
    }

    assignment_rows = db.execute(
        _project_scoped(
            select(
                AssignmentHistory.task_item_id,
                AssignmentHistory.stage,
                AssignmentHistory.action,
                AssignmentHistory.assignee_id,
                AssignmentHistory.created_at,
            )
            .join(TaskItem, AssignmentHistory.task_item_id == TaskItem.id)
            .join(TaskPackage, TaskItem.package_id == TaskPackage.id),
            project_ids,
        )
    ).all()
    assignments = tuple(
        AssignmentEvent(
            item_id=row[0],
            stage=row[1],
            action=row[2],
            assignee_id=row[3],
            created_at=_as_utc(row[4]),
        )
        for row in assignment_rows
    )

    submission_rows = db.execute(
        _project_scoped(
            select(
                AnnotationRevision.task_item_id,
                AnnotationRevision.created_by_id,
                AnnotationRevision.created_at,
            )
            .join(TaskItem, AnnotationRevision.task_item_id == TaskItem.id)
            .join(TaskPackage, TaskItem.package_id == TaskPackage.id)
            .where(AnnotationRevision.stage == "submitted"),
            project_ids,
        )
    ).all()
    submissions = tuple(
        SubmissionEvent(item_id=row[0], user_id=row[1], created_at=_as_utc(row[2]))
        for row in submission_rows
    )

    review_rows = db.execute(
        _project_scoped(
            select(AuditLog.entity_id, AuditLog.actor_id, AuditLog.action, AuditLog.created_at)
            .join(TaskItem, AuditLog.entity_id == TaskItem.id)
            .join(TaskPackage, TaskItem.package_id == TaskPackage.id)
            .where(
                AuditLog.entity_type == "task_item",
                AuditLog.action.in_(("review_approve", "review_request_changes")),
            ),
            project_ids,
        )
    ).all()
    reviews = tuple(
        ReviewEvent(
            item_id=row[0],
            user_id=row[1],
            decision="approve" if row[2] == "review_approve" else "request_changes",
            created_at=_as_utc(row[3]),
        )
        for row in review_rows
    )
    returns = tuple(event for event in assignments if event.action == "request_changes")
    return WorkEvents(
        assignments=tuple(sorted(assignments, key=lambda event: event.created_at)),
        submissions=tuple(sorted(submissions, key=lambda event: event.created_at)),
        reviews=tuple(sorted(reviews, key=lambda event: event.created_at)),
        returns=returns,
        video_by_item=video_by_item,
    )


def _in_range(value: datetime, start_date: date, end_date: date) -> bool:
    timestamp = _as_utc(value)
    return start_date <= timestamp.date() <= end_date


def _latest_review_by_item(reviews: tuple[ReviewEvent, ...]) -> dict[str, ReviewEvent]:
    latest: dict[str, ReviewEvent] = {}
    for event in reviews:
        if event.item_id not in latest or event.created_at > latest[event.item_id].created_at:
            latest[event.item_id] = event
    return latest


def _average_or_none(values: list[float]) -> float | None:
    return fmean(values) if values else None


def _effective_video_seconds(
    user: User,
    events: WorkEvents,
    period_start: date,
    period_end: date,
    video_ids: set[str] | None = None,
) -> float:
    if video_ids is None:
        video_ids = {
            video_id
            for video_id, _ in _user_activity_video_events(user, events, period_start, period_end)
        }
    duration_by_video_id = {
        info.video_id: info.duration_seconds for info in events.video_by_item.values()
    }
    return sum(
        duration_by_video_id[video_id] for video_id in video_ids if video_id in duration_by_video_id
    )


def _user_activity_video_events(
    user: User,
    events: WorkEvents,
    period_start: date,
    period_end: date,
) -> list[tuple[str, datetime]]:
    activity: list[tuple[str, datetime]] = []
    for assignment_event in events.assignments:
        if (
            assignment_event.assignee_id == user.id
            and assignment_event.action in ("claim", "assign", "request_changes")
            and _in_range(assignment_event.created_at, period_start, period_end)
        ):
            video = events.video_by_item.get(assignment_event.item_id)
            if video:
                activity.append((video.video_id, assignment_event.created_at))
    for submission_event in events.submissions:
        if submission_event.user_id == user.id and _in_range(
            submission_event.created_at, period_start, period_end
        ):
            video = events.video_by_item.get(submission_event.item_id)
            if video:
                activity.append((video.video_id, submission_event.created_at))
    for review_event in events.reviews:
        if review_event.user_id == user.id and _in_range(
            review_event.created_at, period_start, period_end
        ):
            video = events.video_by_item.get(review_event.item_id)
            if video:
                activity.append((video.video_id, review_event.created_at))
    return sorted(activity, key=lambda item: item[1])


def _effective_video_ids_by_period(
    user: User,
    events: WorkEvents,
    period_windows: list[tuple[date, date]],
) -> list[set[str]]:
    first_period_by_video: dict[str, int] = {}
    for video_id, created_at in _user_activity_video_events(
        user, events, period_windows[0][0], period_windows[-1][1]
    ):
        if video_id in first_period_by_video:
            continue
        for index, (period_start, period_end) in enumerate(period_windows):
            if _in_range(created_at, period_start, period_end):
                first_period_by_video[video_id] = index
                break
    result: list[set[str]] = [set() for _ in period_windows]
    for video_id, period_index in first_period_by_video.items():
        result[period_index].add(video_id)
    return result


def _metric(
    user: User,
    events: WorkEvents,
    period_start: date,
    period_end: date,
    effective_video_ids: set[str] | None = None,
) -> WorkMetricOut:
    assignments = [
        event
        for event in events.assignments
        if event.assignee_id == user.id
        and event.action in ("claim", "assign")
        and _in_range(event.created_at, period_start, period_end)
    ]
    annotation_claims = [event for event in assignments if event.stage == "annotation"]
    review_claims = [event for event in assignments if event.stage == "review"]

    user_submissions = sorted(
        (event for event in events.submissions if event.user_id == user.id),
        key=lambda event: event.created_at,
    )
    first_submissions_by_item: dict[str, SubmissionEvent] = {}
    for event in user_submissions:
        first_submissions_by_item.setdefault(event.item_id, event)
    first_submissions = [
        event
        for event in first_submissions_by_item.values()
        if _in_range(event.created_at, period_start, period_end)
    ]
    resubmissions = [
        event
        for event in user_submissions
        if event != first_submissions_by_item[event.item_id]
        and _in_range(event.created_at, period_start, period_end)
    ]

    submissions_by_item: dict[str, list[SubmissionEvent]] = defaultdict(list)
    for event in events.submissions:
        submissions_by_item[event.item_id].append(event)
    reviews_by_item: dict[str, list[ReviewEvent]] = defaultdict(list)
    for review_event in events.reviews:
        reviews_by_item[review_event.item_id].append(review_event)
    claims_by_item: dict[str, list[AssignmentEvent]] = defaultdict(list)
    for assignment_event in events.assignments:
        if assignment_event.stage == "annotation" and assignment_event.assignee_id == user.id:
            claims_by_item[assignment_event.item_id].append(assignment_event)

    completion_seconds: list[float] = []
    first_pass_count = 0
    rework_count = 0
    for first_submission in first_submissions:
        claim_times = [
            event.created_at
            for event in claims_by_item[first_submission.item_id]
            if event.action in ("claim", "assign")
            and event.created_at <= first_submission.created_at
        ]
        if claim_times:
            completion_seconds.append(
                (first_submission.created_at - max(claim_times)).total_seconds()
            )
        first_decision = next(
            (
                event
                for event in reviews_by_item[first_submission.item_id]
                if event.created_at > first_submission.created_at
            ),
            None,
        )
        if first_decision:
            if first_decision.decision == "approve":
                first_pass_count += 1
            elif first_decision.decision == "request_changes":
                rework_count += 1

    returned_items = {
        event.item_id
        for event in events.returns
        if event.assignee_id == user.id
        and event.stage == "review"
        and _in_range(event.created_at, period_start, period_end)
    }
    latest_reviews = _latest_review_by_item(events.reviews)
    final_approved_items = {
        item_id
        for item_id, event in latest_reviews.items()
        if event.decision == "approve"
        and _in_range(event.created_at, period_start, period_end)
        and any(
            submission.user_id == user.id
            for submission in submissions_by_item[item_id]
            if submission.created_at <= event.created_at
        )
    }

    user_reviews = [
        event
        for event in events.reviews
        if event.user_id == user.id and _in_range(event.created_at, period_start, period_end)
    ]
    review_seconds: list[float] = []
    all_submissions_by_item: dict[str, list[SubmissionEvent]] = defaultdict(list)
    for event in events.submissions:
        all_submissions_by_item[event.item_id].append(event)
    for review in user_reviews:
        submitted_times = [
            submission.created_at
            for submission in all_submissions_by_item[review.item_id]
            if submission.created_at <= review.created_at
        ]
        if submitted_times:
            review_seconds.append((review.created_at - max(submitted_times)).total_seconds())

    approved_count = sum(event.decision == "approve" for event in user_reviews)
    rejected_count = sum(event.decision == "request_changes" for event in user_reviews)
    first_submission_count = len(first_submissions)
    review_count = len(user_reviews)
    return WorkMetricOut(
        period_start=period_start,
        period_end=period_end,
        user_id=user.id,
        display_name=user.display_name,
        role=user.role,
        claimed_count=len(annotation_claims),
        first_submissions=first_submission_count,
        resubmissions=len(resubmissions),
        returned_count=len(returned_items),
        final_approved_count=len(final_approved_items),
        effective_video_seconds=_effective_video_seconds(
            user, events, period_start, period_end, effective_video_ids
        ),
        average_completion_seconds=_average_or_none(completion_seconds),
        first_pass_rate=(
            first_pass_count / first_submission_count if first_submission_count else 0
        ),
        rework_rate=rework_count / first_submission_count if first_submission_count else 0,
        review_claimed_count=len(review_claims),
        review_count=review_count,
        approved_count=approved_count,
        rejected_count=rejected_count,
        review_pass_rate=approved_count / review_count if review_count else 0,
        review_return_rate=rejected_count / review_count if review_count else 0,
        average_review_seconds=_average_or_none(review_seconds),
    )


def _default_date_range() -> tuple[date, date]:
    today = datetime.now(UTC).date()
    return today.replace(day=1), today


def _date_range(start_date: date | None, end_date: date | None) -> tuple[date, date]:
    default_start, default_end = _default_date_range()
    start = start_date or default_start
    end = end_date or default_end
    if start > end:
        raise HTTPException(status_code=400, detail="开始日期不能晚于结束日期")
    return start, end


def _validate_granularity(value: str) -> WorkGranularity:
    if value == "day":
        return "day"
    if value == "week":
        return "week"
    if value == "month":
        return "month"
    raise HTTPException(status_code=400, detail="统计粒度必须是 day、week 或 month")


def _period_windows(
    start_date: date, end_date: date, granularity: WorkGranularity
) -> list[tuple[date, date]]:
    if granularity == "day":
        cursor = start_date
    elif granularity == "week":
        cursor = start_date - timedelta(days=start_date.weekday())
    else:
        cursor = start_date.replace(day=1)

    windows: list[tuple[date, date]] = []
    while cursor <= end_date:
        if granularity == "day":
            next_cursor = cursor + timedelta(days=1)
        elif granularity == "week":
            next_cursor = cursor + timedelta(days=7)
        else:
            next_cursor = (
                cursor.replace(year=cursor.year + 1, month=1, day=1)
                if cursor.month == 12
                else cursor.replace(month=cursor.month + 1, day=1)
            )
        bucket_end = next_cursor - timedelta(days=1)
        windows.append((max(cursor, start_date), min(bucket_end, end_date)))
        cursor = next_cursor
    return windows


def personal_work_statistics(
    user: User,
    db: Session,
    project_id: str | None,
    start_date: date | None,
    end_date: date | None,
    granularity: str,
) -> PersonalWorkStatisticsOut:
    start, end = _date_range(start_date, end_date)
    normalized_granularity = _validate_granularity(granularity)
    project_ids = _scope_project_ids(db, user, project_id)
    events = _load_work_events(db, project_ids)
    period_windows = _period_windows(start, end, normalized_granularity)
    period_video_ids = _effective_video_ids_by_period(user, events, period_windows)
    summary = _metric(user, events, start, end)
    periods = [
        _metric(user, events, period_start, period_end, period_video_ids[index])
        for index, (period_start, period_end) in enumerate(period_windows)
    ]
    return PersonalWorkStatisticsOut(
        start_date=start,
        end_date=end,
        granularity=normalized_granularity,
        summary=summary,
        periods=periods,
    )


def _visible_people(
    db: Session,
    project_ids: set[str] | None,
    role: Role | None,
    user_ids: set[str] | None = None,
) -> list[User]:
    statement = select(User).order_by(User.display_name, User.username)
    if project_ids is not None and user_ids is None:
        if not project_ids:
            return []
        member_ids = select(ProjectMember.user_id).where(ProjectMember.project_id.in_(project_ids))
        statement = statement.where(User.id.in_(member_ids))
    if user_ids is not None:
        if not user_ids:
            return []
        statement = statement.where(User.id.in_(user_ids))
    if role:
        statement = statement.where(User.role == role)
    return list(db.scalars(statement).all())


def people_work_statistics(
    user: User,
    db: Session,
    project_id: str | None,
    start_date: date | None,
    end_date: date | None,
    role: Role | None,
) -> PeopleWorkStatisticsOut:
    if user.role not in (
        Role.DEVELOPER_ADMIN,
        Role.ANNOTATION_MANAGER,
        Role.OUTSOURCING_MANAGER,
    ):
        raise HTTPException(status_code=403, detail="无权查看人员工作量统计")
    start, end = _date_range(start_date, end_date)
    project_ids = _scope_project_ids(db, user, project_id)
    events = _load_work_events(db, project_ids)
    people = _visible_people(
        db,
        project_ids,
        role,
        managed_user_ids(db, user) if user.role == Role.OUTSOURCING_MANAGER else None,
    )
    return PeopleWorkStatisticsOut(
        start_date=start,
        end_date=end,
        people=[_metric(person, events, start, end) for person in people],
    )


def _csv_response(rows: Sequence[Sequence[object]], filename: str) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerows(rows)
    content = "\ufeff" + output.getvalue()
    return StreamingResponse(
        iter([content.encode("utf-8")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _metric_csv_row(metric: WorkMetricOut) -> list[object]:
    return [
        metric.period_start.isoformat(),
        metric.period_end.isoformat(),
        metric.user_id,
        metric.display_name,
        metric.role.value,
        metric.claimed_count,
        metric.first_submissions,
        metric.resubmissions,
        metric.returned_count,
        metric.final_approved_count,
        metric.effective_video_seconds,
        metric.first_pass_rate,
        metric.rework_rate,
        metric.review_claimed_count,
        metric.review_count,
        metric.approved_count,
        metric.rejected_count,
        metric.average_review_seconds,
        metric.review_pass_rate,
        metric.review_return_rate,
    ]


def personal_work_csv(
    user: User,
    db: Session,
    project_id: str | None,
    start_date: date | None,
    end_date: date | None,
    granularity: str,
) -> StreamingResponse:
    data = personal_work_statistics(user, db, project_id, start_date, end_date, granularity)
    headers = [
        "周期开始",
        "周期结束",
        "人员ID",
        "姓名",
        "角色",
        "领取标注数",
        "首次提交数",
        "重新提交数",
        "被退回数",
        "最终通过数",
        "去重有效视频时长(秒)",
        "一次通过率",
        "返工率",
        "领取审核数",
        "审核总数",
        "通过数",
        "退回数",
        "平均审核时长(秒)",
        "审核通过率",
        "审核退回率",
    ]
    return _csv_response([headers, *[_metric_csv_row(row) for row in data.periods]], "my-work.csv")


def people_work_csv(
    user: User,
    db: Session,
    project_id: str | None,
    start_date: date | None,
    end_date: date | None,
    role: Role | None,
) -> StreamingResponse:
    data = people_work_statistics(user, db, project_id, start_date, end_date, role)
    headers = [
        "统计开始",
        "统计结束",
        "人员ID",
        "姓名",
        "角色",
        "领取标注数",
        "首次提交数",
        "重新提交数",
        "被退回数",
        "最终通过数",
        "去重有效视频时长(秒)",
        "一次通过率",
        "返工率",
        "领取审核数",
        "审核总数",
        "通过数",
        "退回数",
        "平均审核时长(秒)",
        "审核通过率",
        "审核退回率",
    ]
    return _csv_response(
        [headers, *[_metric_csv_row(row) for row in data.people]], "people-work.csv"
    )
