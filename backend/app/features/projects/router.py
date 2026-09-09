from fastapi import APIRouter

from app.api.legacy_handlers import add_member, create_project, list_projects
from app.schemas import ProjectOut

router = APIRouter()
router.add_api_route(
    "/api/v1/projects",
    list_projects,
    methods=["GET"],
    response_model=list[ProjectOut],
)
router.add_api_route(
    "/api/v1/projects",
    create_project,
    methods=["POST"],
    response_model=ProjectOut,
    status_code=201,
)
router.add_api_route(
    "/api/v1/projects/{project_id}/members",
    add_member,
    methods=["POST"],
    status_code=201,
)
