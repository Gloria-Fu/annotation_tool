import csv
import io

from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.permissions import ensure_project_access
from app.models import (
    DatasetEpisode,
    ItemStatus,
    Role,
    TaskItem,
    TaskPackage,
    User,
)
from app.schemas import StatsOut


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
    people = db.execute(
        select(User.id, User.display_name, func.count(TaskItem.id))
        .join(TaskItem, TaskItem.annotator_id == User.id)
        .join(TaskPackage, TaskPackage.id == TaskItem.package_id)
        .where(TaskPackage.project_id == project_id, TaskItem.status == ItemStatus.COMPLETED)
        .group_by(User.id, User.display_name)
    ).all()
    return StatsOut(
        project_id=project_id,
        total=total,
        by_status=by_status,
        completion_rate=(by_status.get(ItemStatus.COMPLETED.value, 0) / total if total else 0),
        by_person=[
            {"user_id": row[0], "display_name": row[1], "completed": row[2]} for row in people
        ],
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
