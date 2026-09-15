from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import delete_user_sessions, hash_password
from app.core.permissions import managed_group_ids, managed_user_ids
from app.models import Project, ProjectMember, Role, User, UserGroup, UserGroupMember, audit
from app.schemas import UserCreate, UserUpdate


def manageable_project_ids(db: Session, user: User) -> set[str]:
    if user.role == Role.DEVELOPER_ADMIN:
        return set()
    return set(
        db.scalars(select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)).all()
    )


def list_users(db: Session, user: User) -> list[User]:
    if user.role == Role.DEVELOPER_ADMIN:
        return list(
            db.scalars(
                select(User).where(User.is_deleted.is_(False)).order_by(User.created_at.desc())
            ).all()
        )
    if user.role == Role.OUTSOURCING_MANAGER:
        user_ids = managed_user_ids(db, user)
        if not user_ids:
            return []
        return list(
            db.scalars(
                select(User)
                .where(User.id.in_(user_ids), User.is_deleted.is_(False))
                .order_by(User.username)
            ).all()
        )
    project_ids = manageable_project_ids(db, user)
    return list(
        db.scalars(
            select(User)
            .join(ProjectMember)
            .where(ProjectMember.project_id.in_(project_ids), User.is_deleted.is_(False))
            .distinct()
            .order_by(User.username)
        ).all()
    )


def create_user(payload: UserCreate, actor: User, db: Session) -> User:
    if actor.role == Role.ANNOTATION_MANAGER:
        if payload.role not in (Role.ANNOTATOR, Role.REVIEWER):
            raise HTTPException(status_code=403, detail="标注管理员只能创建标注员或审核员")
        manageable = manageable_project_ids(db, actor)
        if not payload.project_ids or not set(payload.project_ids).issubset(manageable):
            raise HTTPException(status_code=403, detail="只能将账号加入自己管理的项目")
    if actor.role == Role.OUTSOURCING_MANAGER:
        if payload.role not in (Role.ANNOTATOR, Role.REVIEWER):
            raise HTTPException(status_code=403, detail="合作方负责人只能创建标注员或审核员")
        if payload.project_ids:
            raise HTTPException(
                status_code=403, detail="合作方账号通过人员群组授权，不直接加入项目"
            )
        if not payload.group_ids or not set(payload.group_ids).issubset(
            managed_group_ids(db, actor)
        ):
            raise HTTPException(status_code=403, detail="只能将账号加入自己负责的群组")
    if payload.group_ids and payload.role not in (Role.ANNOTATOR, Role.REVIEWER):
        raise HTTPException(status_code=400, detail="群组只能加入标注员或审核员")
    new_user = User(
        username=payload.username,
        display_name=payload.display_name,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(new_user)
    try:
        db.flush()
        for project_id in set(payload.project_ids):
            if not db.get(Project, project_id):
                raise HTTPException(status_code=404, detail="项目不存在")
            db.add(ProjectMember(project_id=project_id, user_id=new_user.id))
        for group_id in set(payload.group_ids):
            group = db.get(UserGroup, group_id)
            if not group:
                raise HTTPException(status_code=404, detail="群组不存在")
            if actor.role != Role.DEVELOPER_ADMIN and group.manager_id != actor.id:
                raise HTTPException(status_code=403, detail="无权使用该人员群组")
            db.add(UserGroupMember(group_id=group.id, user_id=new_user.id))
        audit(db, actor.id, "create_user", "user", new_user.id, role=payload.role.value)
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="用户名已存在") from exc
    return new_user


def update_user(user_id: str, payload: UserUpdate, actor: User, db: Session) -> User:
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="账号不存在")
    if actor.role == Role.ANNOTATION_MANAGER:
        manageable = manageable_project_ids(db, actor)
        target_projects = set(
            db.scalars(
                select(ProjectMember.project_id).where(ProjectMember.user_id == target.id)
            ).all()
        )
        if target.role not in (Role.ANNOTATOR, Role.REVIEWER) or not target_projects.intersection(
            manageable
        ):
            raise HTTPException(status_code=403, detail="无权管理该账号")
    if actor.role == Role.OUTSOURCING_MANAGER and (
        target.role not in (Role.ANNOTATOR, Role.REVIEWER)
        or target.id not in managed_user_ids(db, actor)
    ):
        raise HTTPException(status_code=403, detail="无权管理该账号")
    if payload.display_name is not None:
        target.display_name = payload.display_name
    if payload.is_active is not None:
        target.is_active = payload.is_active
        if not payload.is_active:
            delete_user_sessions(target.id)
    if payload.reset_password:
        target.password_hash = hash_password(payload.reset_password)
        target.must_change_password = True
        delete_user_sessions(target.id)
    audit(
        db,
        actor.id,
        "update_user",
        "user",
        target.id,
        fields=list(payload.model_dump(exclude_none=True)),
    )
    db.commit()
    return target


def delete_user(user_id: str, actor: User, db: Session) -> None:
    target = db.get(User, user_id)
    if not target or target.is_deleted:
        raise HTTPException(status_code=404, detail="账号不存在")
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="不能删除当前登录账号")
    if actor.role == Role.ANNOTATION_MANAGER:
        manageable = manageable_project_ids(db, actor)
        target_projects = set(
            db.scalars(
                select(ProjectMember.project_id).where(ProjectMember.user_id == target.id)
            ).all()
        )
        if target.role not in (Role.ANNOTATOR, Role.REVIEWER) or not target_projects.intersection(
            manageable
        ):
            raise HTTPException(status_code=403, detail="无权删除该账号")
    if actor.role == Role.OUTSOURCING_MANAGER and (
        target.role not in (Role.ANNOTATOR, Role.REVIEWER)
        or target.id not in managed_user_ids(db, actor)
    ):
        raise HTTPException(status_code=403, detail="无权删除该账号")
    target.is_active = False
    target.is_deleted = True
    delete_user_sessions(target.id)
    audit(db, actor.id, "delete_user", "user", target.id, deleted_username=target.username)
    db.commit()


__all__ = [
    "create_user",
    "delete_user",
    "list_users",
    "manageable_project_ids",
    "update_user",
]
