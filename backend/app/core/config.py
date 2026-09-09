from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_name: str = "Annotate Tool"
    database_url: str = "sqlite:///./annotate_tool.db"
    redis_url: str = "redis://localhost:6379/0"
    session_cookie_secure: bool = False
    session_ttl_seconds: int = 28_800
    dataset_mount_root: Path = Path("/datasets")
    bootstrap_admin_username: str = "admin"
    bootstrap_admin_password: str = "ChangeMe123!"
    bootstrap_admin_display_name: str = "研发管理员"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
