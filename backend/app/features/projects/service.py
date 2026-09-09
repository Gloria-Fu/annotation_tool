from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import ensure_project_access
from app.models import Project, ProjectMember, Role, User, audit
from app.schemas import MemberCreate, ProjectCreate


def list_projects(user: User, db: Session) -> list[Project]:
    stmt = select(Project).where(Project.is_active.is_(True)).order_by(Project.name)
    if user.role != Role.DEVELOPER_ADMIN:
        stmt = stmt.join(ProjectMember).where(ProjectMember.user_id == user.id)
    return list(db.scalars(stmt).all())


def create_project(payload: ProjectCreate, actor: User, db: Session) -> Project:
    project = Project(name=payload.name, description=payload.description, created_by_id=actor.id)
    db.add(project)
    try:
        db.flush()
        audit(db, actor.id, "create_project", "project", project.id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="项目名称已存在") from exc
    return project


def add_member(project_id: str, payload: MemberCreate, actor: User, db: Session) -> dict[str, str]:
    ensure_project_access(db, actor, project_id, manager=True)
    target = db.get(User, payload.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="账号不存在")
    if actor.role == Role.ANNOTATION_MANAGER and target.role not in (
        Role.ANNOTATOR,
        Role.REVIEWER,
    ):
        raise HTTPException(status_code=403, detail="只能添加标注员或审核员")
    member = ProjectMember(project_id=project_id, user_id=target.id)
    db.add(member)
    try:
        db.flush()
        audit(db, actor.id, "add_project_member", "project", project_id, user_id=target.id)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户已在项目中") from exc
    return {"id": member.id}
