from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import SESSION_COOKIE, get_session_user_id
from app.database import get_db
from app.models import ProjectMember, Role, User


def current_user(
    token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> User:
    user_id = get_session_user_id(token) if token else None
    user = db.get(User, user_id) if user_id else None
    if not user or not user.is_active or user.is_deleted:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="未登录或会话已失效")
    return user


def require_roles(*roles: Role):
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
        return user

    return dependency


def ensure_project_access(db: Session, user: User, project_id: str, manager: bool = False) -> None:
    if user.role == Role.DEVELOPER_ADMIN:
        return
    if manager and user.role != Role.ANNOTATION_MANAGER:
        raise HTTPException(status_code=403, detail="需要项目管理员权限")
    membership = db.scalar(
        select(ProjectMember).where(ProjectMember.project_id == project_id, ProjectMember.user_id == user.id)
    )
    if not membership:
        raise HTTPException(status_code=403, detail="无权访问该项目")
