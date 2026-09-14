from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.permissions import require_roles
from app.database import get_db
from app.features.user_groups import service
from app.models import Role, User
from app.schemas import (
    UserGroupCreate,
    UserGroupMemberCreate,
    UserGroupOut,
    UserGroupUpdate,
)

router = APIRouter()


@router.get("/api/v1/user-groups", response_model=list[UserGroupOut])
def list_groups(
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.OUTSOURCING_MANAGER)),
    db: Session = Depends(get_db),
) -> list[UserGroupOut]:
    return service.list_groups(db, actor)


@router.post("/api/v1/user-groups", response_model=UserGroupOut, status_code=201)
def create_group(
    payload: UserGroupCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
) -> UserGroupOut:
    return service.create_group(payload, actor, db)


@router.patch("/api/v1/user-groups/{group_id}", response_model=UserGroupOut)
def update_group(
    group_id: str,
    payload: UserGroupUpdate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
) -> UserGroupOut:
    return service.update_group(group_id, payload, actor, db)


@router.delete("/api/v1/user-groups/{group_id}", status_code=204)
def delete_group(
    group_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
) -> None:
    service.delete_group(group_id, actor, db)


@router.post("/api/v1/user-groups/{group_id}/members", response_model=UserGroupOut)
def add_member(
    group_id: str,
    payload: UserGroupMemberCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.OUTSOURCING_MANAGER)),
    db: Session = Depends(get_db),
) -> UserGroupOut:
    return service.add_member(group_id, payload, actor, db)


@router.delete(
    "/api/v1/user-groups/{group_id}/members/{user_id}",
    response_model=UserGroupOut,
)
def remove_member(
    group_id: str,
    user_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.OUTSOURCING_MANAGER)),
    db: Session = Depends(get_db),
) -> UserGroupOut:
    return service.remove_member(group_id, user_id, actor, db)
