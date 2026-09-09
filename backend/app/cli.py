import argparse
import json

from sqlalchemy import select

from app.auth import hash_password
from app.config import settings
from app.database import SessionLocal
from app.infrastructure.annotation_storage import AnnotationStorage
from app.models import AnnotationRevision, Dataset, Role, TaskItem, TaskPackage, User
from app.services.importer import resolve_dataset_root


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


def check_annotation_orphans() -> int:
    storage = AnnotationStorage()
    orphan_paths: list[str] = []
    with SessionLocal() as db:
        datasets = db.scalars(select(Dataset)).all()
        for dataset in datasets:
            root = resolve_dataset_root(dataset.root_path)
            known = {
                path
                for path in db.scalars(
                    select(AnnotationRevision.file_path)
                    .join(TaskItem, AnnotationRevision.task_item_id == TaskItem.id)
                    .join(TaskPackage, TaskItem.package_id == TaskPackage.id)
                    .where(TaskPackage.dataset_id == dataset.id)
                ).all()
                if path
            }
            orphan_paths.extend(str(path) for path in storage.find_orphans(root, known))
    print(json.dumps({"orphans": orphan_paths}, ensure_ascii=False, indent=2))
    return 1 if orphan_paths else 0


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["bootstrap-admin", "check-annotation-orphans"])
    args = parser.parse_args()
    if args.command == "bootstrap-admin":
        bootstrap_admin()
    elif args.command == "check-annotation-orphans":
        raise SystemExit(check_annotation_orphans())


if __name__ == "__main__":
    main()
