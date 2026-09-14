from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissions import ensure_group_management
from app.models import Role, TaskPackageGroup, User, UserGroup, UserGroupMember, audit
from app.schemas import (
    UserGroupCreate,
    UserGroupMemberCreate,
    UserGroupMemberOut,
    UserGroupOut,
    UserGroupUpdate,
)


def _group_output(db: Session, group: UserGroup) -> UserGroupOut:
    members = list(
        db.scalars(
            select(User)
            .join(UserGroupMember, UserGroupMember.user_id == User.id)
            .where(
                UserGroupMember.group_id == group.id,
                User.is_deleted.is_(False),
            )
            .order_by(User.display_name, User.username)
        ).all()
    )
    return UserGroupOut(
        id=group.id,
        name=group.name,
        description=group.description,
        created_by_id=group.created_by_id,
        manager_id=group.manager_id,
        created_at=group.created_at,
        updated_at=group.updated_at,
        member_count=len(members),
        members=[
            UserGroupMemberOut(
                id=member.id,
                username=member.username,
                display_name=member.display_name,
                role=member.role,
                is_active=member.is_active,
            )
            for member in members
        ],
    )


def list_groups(db: Session, actor: User | None = None) -> list[UserGroupOut]:
    statement = select(UserGroup).order_by(UserGroup.name)
    if actor and actor.role == Role.OUTSOURCING_MANAGER:
        statement = statement.where(UserGroup.manager_id == actor.id)
    groups = list(db.scalars(statement).all())
    return [_group_output(db, group) for group in groups]


def create_group(payload: UserGroupCreate, actor: User, db: Session) -> UserGroupOut:
    if payload.manager_id:
        manager = db.get(User, payload.manager_id)
        if not manager or manager.is_deleted or manager.role != Role.OUTSOURCING_MANAGER:
            raise HTTPException(status_code=400, detail="群组负责人必须是有效的外包负责人账号")
    group = UserGroup(
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        created_by_id=actor.id,
        manager_id=payload.manager_id,
    )
    if not group.name:
        raise HTTPException(status_code=400, detail="群组名称不能为空")
    db.add(group)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="群组名称已存在") from exc
    audit(db, actor.id, "create_user_group", "user_group", group.id, name=group.name)
    db.commit()
    return _group_output(db, group)


def update_group(group_id: str, payload: UserGroupUpdate, actor: User, db: Session) -> UserGroupOut:
    group = db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="群组不存在")
    if payload.name is not None:
        group.name = payload.name.strip()
        if not group.name:
            raise HTTPException(status_code=400, detail="群组名称不能为空")
    if payload.description is not None:
        group.description = payload.description.strip() or None
    if "manager_id" in payload.model_fields_set:
        if payload.manager_id:
            manager = db.get(User, payload.manager_id)
            if not manager or manager.is_deleted or manager.role != Role.OUTSOURCING_MANAGER:
                raise HTTPException(status_code=400, detail="群组负责人必须是有效的外包负责人账号")
        group.manager_id = payload.manager_id
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="群组名称已存在") from exc
    audit(
        db,
        actor.id,
        "update_user_group",
        "user_group",
        group.id,
        fields=list(payload.model_dump(exclude_none=True)),
    )
    db.commit()
    return _group_output(db, group)


def delete_group(group_id: str, actor: User, db: Session) -> None:
    group = db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="群组不存在")
    if db.scalar(select(UserGroupMember.id).where(UserGroupMember.group_id == group.id).limit(1)):
        raise HTTPException(status_code=409, detail="请先移除群组成员后再删除群组")
    if db.scalar(select(TaskPackageGroup.id).where(TaskPackageGroup.group_id == group.id).limit(1)):
        raise HTTPException(status_code=409, detail="请先从任务包移除该群组授权")
    db.delete(group)
    audit(db, actor.id, "delete_user_group", "user_group", group.id, name=group.name)
    db.commit()


def add_member(
    group_id: str, payload: UserGroupMemberCreate, actor: User, db: Session
) -> UserGroupOut:
    group = db.get(UserGroup, group_id)
    user = db.get(User, payload.user_id)
    if not group:
        raise HTTPException(status_code=404, detail="群组不存在")
    ensure_group_management(db, actor, group.id)
    if not user or user.is_deleted:
        raise HTTPException(status_code=404, detail="账号不存在")
    if user.role not in (Role.ANNOTATOR, Role.REVIEWER):
        raise HTTPException(status_code=403, detail="群组只能添加标注员或审核员")
    if not user.is_active:
        raise HTTPException(status_code=409, detail="停用账号不能加入群组")
    membership = UserGroupMember(group_id=group.id, user_id=user.id)
    db.add(membership)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="账号已在该群组中") from exc
    audit(
        db,
        actor.id,
        "add_user_group_member",
        "user_group",
        group.id,
        user_id=user.id,
    )
    db.commit()
    return _group_output(db, group)


def remove_member(group_id: str, user_id: str, actor: User, db: Session) -> UserGroupOut:
    group = db.get(UserGroup, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="群组不存在")
    ensure_group_management(db, actor, group.id)
    membership = db.scalar(
        select(UserGroupMember).where(
            UserGroupMember.group_id == group.id,
            UserGroupMember.user_id == user_id,
        )
    )
    if not membership:
        raise HTTPException(status_code=404, detail="账号不在该群组中")
    db.delete(membership)
    audit(
        db,
        actor.id,
        "remove_user_group_member",
        "user_group",
        group.id,
        user_id=user_id,
    )
    db.commit()
    return _group_output(db, group)
