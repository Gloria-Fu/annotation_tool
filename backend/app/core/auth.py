import secrets
from typing import cast

import redis
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import settings

SESSION_COOKIE = "annotate_session"
password_hasher = PasswordHasher()
redis_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_session(user_id: str) -> str:
    token = secrets.token_urlsafe(32)
    redis_client.setex(f"session:{token}", settings.session_ttl_seconds, user_id)
    return token


def get_session_user_id(token: str) -> str | None:
    return cast(str | None, redis_client.get(f"session:{token}"))


def delete_session(token: str) -> None:
    redis_client.delete(f"session:{token}")


def delete_user_sessions(user_id: str) -> None:
    for key in redis_client.scan_iter("session:*"):
        if redis_client.get(key) == user_id:
            redis_client.delete(key)
