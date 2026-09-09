from fastapi import APIRouter

from app.api.legacy_handlers import create_user, delete_user, list_users, update_user
from app.schemas import UserOut

router = APIRouter()
router.add_api_route("/api/v1/users", list_users, methods=["GET"], response_model=list[UserOut])
router.add_api_route(
    "/api/v1/users",
    create_user,
    methods=["POST"],
    response_model=UserOut,
    status_code=201,
)
router.add_api_route(
    "/api/v1/users/{user_id}",
    update_user,
    methods=["PATCH"],
    response_model=UserOut,
)
router.add_api_route("/api/v1/users/{user_id}", delete_user, methods=["DELETE"], status_code=204)
