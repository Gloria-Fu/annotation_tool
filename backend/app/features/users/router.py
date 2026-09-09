from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.permissions import require_roles
from app.database import get_db
from app.features.users import service
from app.models import Role, User
from app.schemas import UserCreate, UserOut, UserUpdate

router = APIRouter()


@router.get("/api/v1/users", response_model=list[UserOut])
def list_users(
    user: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> list[User]:
    return service.list_users(db, user)


@router.post("/api/v1/users", response_model=UserOut, status_code=201)
def create_user(
    payload: UserCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> User:
    return service.create_user(payload, actor, db)


@router.patch("/api/v1/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    payload: UserUpdate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> User:
    return service.update_user(user_id, payload, actor, db)


@router.delete("/api/v1/users/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> None:
    service.delete_user(user_id, actor, db)
