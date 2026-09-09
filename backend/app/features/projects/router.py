from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.permissions import current_user, require_roles
from app.database import get_db
from app.features.projects import service
from app.models import Project, Role, User
from app.schemas import MemberCreate, ProjectCreate, ProjectOut

router = APIRouter()


@router.get("/api/v1/projects", response_model=list[ProjectOut])
def list_projects(
    user: User = Depends(current_user), db: Session = Depends(get_db)
) -> list[Project]:
    return service.list_projects(user, db)


@router.post("/api/v1/projects", response_model=ProjectOut, status_code=201)
def create_project(
    payload: ProjectCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN)),
    db: Session = Depends(get_db),
) -> Project:
    return service.create_project(payload, actor, db)


@router.post("/api/v1/projects/{project_id}/members", status_code=201, response_model=None)
def add_member(
    project_id: str,
    payload: MemberCreate,
    actor: User = Depends(require_roles(Role.DEVELOPER_ADMIN, Role.ANNOTATION_MANAGER)),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    return service.add_member(project_id, payload, actor, db)
