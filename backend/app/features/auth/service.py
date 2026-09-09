from dataclasses import dataclass
from typing import Literal, TypedDict

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import (
    SESSION_COOKIE,
    create_session,
    delete_session,
    delete_user_sessions,
    hash_password,
    verify_password,
)
from app.core.config import settings
from app.models import User, audit
from app.schemas import LoginRequest, PasswordChange


@dataclass(frozen=True)
class AuthResult:
    user: User
    token: str


class CookieOptions(TypedDict):
    httponly: bool
    secure: bool
    samesite: Literal["lax", "strict", "none"]
    max_age: int
    path: str


def health(db: Session) -> dict[str, str]:
    db.execute(select(1))
    return {"status": "ok"}


def login(payload: LoginRequest, db: Session) -> AuthResult:
    user = db.scalar(select(User).where(User.username == payload.username))
    if not user or not user.is_active or not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    token = create_session(user.id)
    audit(db, user.id, "login", "user", user.id)
    db.commit()
    return AuthResult(user=user, token=token)


def logout(user: User, token: str | None, db: Session) -> None:
    if token:
        delete_session(token)
    audit(db, user.id, "logout", "user", user.id)
    db.commit()


def change_password(payload: PasswordChange, user: User, db: Session) -> AuthResult:
    if not verify_password(user.password_hash, payload.current_password):
        raise HTTPException(status_code=400, detail="当前密码错误")
    user.password_hash = hash_password(payload.new_password)
    user.must_change_password = False
    delete_user_sessions(user.id)
    token = create_session(user.id)
    audit(db, user.id, "change_password", "user", user.id)
    db.commit()
    return AuthResult(user=user, token=token)


def cookie_options() -> CookieOptions:
    return {
        "httponly": True,
        "secure": settings.session_cookie_secure,
        "samesite": "strict",
        "max_age": settings.session_ttl_seconds,
        "path": "/",
    }


__all__ = [
    "AuthResult",
    "SESSION_COOKIE",
    "change_password",
    "cookie_options",
    "health",
    "login",
    "logout",
]
