from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.permissions import current_user, require_roles
from app.database import get_db
from app.features.task_packages import service
from app.models import ClaimPolicy, ItemStatus, Role, TaskItem, TaskPackage, User
from app.schemas import (
    AssignmentRequest,
    PackageCreate,
    PackageOut,
    ReclaimRequest,
    TaskItemOut,
    TaskPackageGroupCreate,
    UserGroupSummaryOut,
)

router = APIRouter()


@router.get("/api/v1/task-packages", response_model=list[PackageOut])
def list_packages(
    project_id: str | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    return service.list_packages(project_id, user, db)


@router.post("/api/v1/task-packages", response_model=PackageOut, status_code=201)
def create_package(
    payload: PackageCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> TaskPackage:
    return service.create_package(payload, actor, db)


@router.post("/api/v1/task-packages/{package_id}/publish", response_model=PackageOut)
def publish_package(
    package_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> TaskPackage:
    return service.publish_package(package_id, actor, db)


@router.get(
    "/api/v1/task-packages/{package_id}/groups",
    response_model=list[UserGroupSummaryOut],
)
def list_package_groups(
    package_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> list[UserGroupSummaryOut]:
    return service.list_package_groups(package_id, actor, db)


@router.get(
    "/api/v1/task-packages/{package_id}/group-options",
    response_model=list[UserGroupSummaryOut],
)
def list_group_options(
    package_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> list[UserGroupSummaryOut]:
    return service.list_group_options(package_id, actor, db)


@router.post(
    "/api/v1/task-packages/{package_id}/groups",
    response_model=UserGroupSummaryOut,
    status_code=201,
)
def add_package_group(
    package_id: str,
    payload: TaskPackageGroupCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> UserGroupSummaryOut:
    return service.add_package_group(package_id, payload, actor, db)


@router.delete("/api/v1/task-packages/{package_id}/groups/{group_id}", status_code=204)
def remove_package_group(
    package_id: str,
    group_id: str,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> None:
    service.remove_package_group(package_id, group_id, actor, db)


@router.get("/api/v1/task-packages/{package_id}/items", response_model=list[TaskItemOut])
def list_items(
    package_id: str,
    status: ItemStatus | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[TaskItem]:
    return service.list_items(package_id, status, user, db)


@router.post("/api/v1/annotation-tasks/claim", response_model=TaskItemOut)
def claim_annotation(
    package_id: str = Query(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TaskItem:
    return service.claim(package_id, user, False, db)


@router.post("/api/v1/review-tasks/claim", response_model=TaskItemOut)
def claim_review(
    package_id: str = Query(...),
    claim_policy: ClaimPolicy | None = Query(default=None),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> TaskItem:
    return service.claim(package_id, user, True, db, claim_policy)


@router.get("/api/v1/my-tasks", response_model=list[TaskItemOut])
def my_tasks(
    stage: str = Query(default="annotation", pattern="^(annotation|review)$"),
    view: str = Query(default="pending", pattern="^(pending|history)$"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> list[TaskItem]:
    return service.my_tasks(stage, view, user, db)


@router.post("/api/v1/task-packages/{package_id}/assign", response_model=list[TaskItemOut])
def assign_items(
    package_id: str,
    payload: AssignmentRequest,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> list[TaskItem]:
    return service.assign_items(package_id, payload, actor, db)


@router.post("/api/v1/task-items/{item_id}/reclaim", response_model=TaskItemOut)
def reclaim_item(
    item_id: str,
    payload: ReclaimRequest,
    actor: User = Depends(
        require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER, Role.OUTSOURCING_MANAGER)
    ),
    db: Session = Depends(get_db),
) -> TaskItem:
    return service.reclaim_item(item_id, payload, actor, db)
