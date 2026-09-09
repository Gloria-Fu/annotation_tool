import argparse

from sqlalchemy import select

from app.auth import hash_password
from app.config import settings
from app.database import SessionLocal
from app.models import Role, User


def bootstrap_admin() -> None:
    with SessionLocal() as db:
        existing = db.scalar(select(User).where(User.username == settings.bootstrap_admin_username))
        if existing:
            print(f"Bootstrap admin '{existing.username}' already exists")
            return
        user = User(
            username=settings.bootstrap_admin_username,
            display_name=settings.bootstrap_admin_display_name,
            password_hash=hash_password(settings.bootstrap_admin_password),
            role=Role.DEVELOPER_ADMIN,
            must_change_password=True,
        )
        db.add(user)
        db.commit()
        print(f"Created bootstrap developer admin '{user.username}'")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["bootstrap-admin"])
    args = parser.parse_args()
    if args.command == "bootstrap-admin":
        bootstrap_admin()


if __name__ == "__main__":
    main()

