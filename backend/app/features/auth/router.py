from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.permissions import current_user
from app.database import get_db
from app.features.auth import service
from app.models import User
from app.schemas import LoginRequest, PasswordChange, UserOut

router = APIRouter()


@router.get("/health")
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    return service.health(db)


@router.post("/api/v1/auth/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> User:
    result = service.login(payload, db)
    response.set_cookie(service.SESSION_COOKIE, result.token, **service.cookie_options())
    return result.user


@router.post("/api/v1/auth/logout", status_code=204)
def logout(
    response: Response,
    request: Request,
    token: str | None = Query(default=None, include_in_schema=False),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> None:
    service.logout(user, request.cookies.get(service.SESSION_COOKIE) or token, db)
    response.delete_cookie(service.SESSION_COOKIE, path="/")


@router.get("/api/v1/auth/me", response_model=UserOut)
def me(user: User = Depends(current_user)) -> User:
    return user


@router.post("/api/v1/auth/change-password", response_model=UserOut)
def change_password(
    payload: PasswordChange,
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> User:
    result = service.change_password(payload, user, db)
    response.set_cookie(service.SESSION_COOKIE, result.token, **service.cookie_options())
    return result.user
