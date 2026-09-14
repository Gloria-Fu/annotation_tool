from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.core.auth import SESSION_COOKIE, get_session_user_id
from app.infrastructure.database import get_db
from app.models import (
    ProjectMember,
    Role,
    TaskPackage,
    TaskPackageGroup,
    User,
    UserGroup,
    UserGroupMember,
)


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
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    if not membership:
        raise HTTPException(status_code=403, detail="无权访问该项目")


def managed_group_ids(db: Session, user: User) -> set[str]:
    if user.role != Role.OUTSOURCING_MANAGER:
        return set()
    return set(db.scalars(select(UserGroup.id).where(UserGroup.manager_id == user.id)).all())


def managed_user_ids(db: Session, user: User) -> set[str]:
    group_ids = managed_group_ids(db, user)
    if not group_ids:
        return set()
    return set(
        db.scalars(
            select(UserGroupMember.user_id).where(UserGroupMember.group_id.in_(group_ids))
        ).all()
    )


def ensure_group_management(db: Session, user: User, group_id: str) -> None:
    if user.role == Role.DEVELOPER_ADMIN:
        return
    if user.role == Role.OUTSOURCING_MANAGER and db.scalar(
        select(UserGroup.id).where(UserGroup.id == group_id, UserGroup.manager_id == user.id)
    ):
        return
    raise HTTPException(status_code=403, detail="无权管理该人员群组")


def task_package_access_condition(user: User):
    """Return the package visibility predicate for a non-manager user."""
    project_member = exists(
        select(ProjectMember.id).where(
            ProjectMember.project_id == TaskPackage.project_id,
            ProjectMember.user_id == user.id,
        )
    )
    group_member = exists(
        select(UserGroupMember.id)
        .join(TaskPackageGroup, TaskPackageGroup.group_id == UserGroupMember.group_id)
        .where(
            TaskPackageGroup.package_id == TaskPackage.id,
            UserGroupMember.user_id == user.id,
        )
    )
    return or_(
        (~TaskPackage.group_access_configured) & project_member,
        TaskPackage.group_access_configured & group_member,
    )


def task_package_manager_scope_condition(user: User):
    return exists(
        select(TaskPackageGroup.id)
        .join(UserGroup, UserGroup.id == TaskPackageGroup.group_id)
        .where(
            TaskPackageGroup.package_id == TaskPackage.id,
            UserGroup.manager_id == user.id,
        )
    )


def ensure_task_package_access(
    db: Session, user: User, package: TaskPackage, manager: bool = False
) -> None:
    if user.role == Role.DEVELOPER_ADMIN:
        return
    if manager:
        ensure_project_access(db, user, package.project_id, manager=True)
        return
    if user.role == Role.OUTSOURCING_MANAGER:
        allowed = db.scalar(
            select(TaskPackageGroup.id)
            .join(UserGroup, UserGroup.id == TaskPackageGroup.group_id)
            .where(
                TaskPackageGroup.package_id == package.id,
                UserGroup.manager_id == user.id,
            )
            .limit(1)
        )
        if not allowed:
            raise HTTPException(status_code=403, detail="无权访问该任务包")
        return
    if user.role == Role.ANNOTATION_MANAGER:
        ensure_project_access(db, user, package.project_id)
        return
    if package.group_access_configured:
        allowed = db.scalar(
            select(UserGroupMember.id)
            .join(TaskPackageGroup, TaskPackageGroup.group_id == UserGroupMember.group_id)
            .where(
                TaskPackageGroup.package_id == package.id,
                UserGroupMember.user_id == user.id,
            )
            .limit(1)
        )
    else:
        allowed = db.scalar(
            select(ProjectMember.id).where(
                ProjectMember.project_id == package.project_id,
                ProjectMember.user_id == user.id,
            )
        )
    if not allowed:
        raise HTTPException(status_code=403, detail="无权访问该任务包")
