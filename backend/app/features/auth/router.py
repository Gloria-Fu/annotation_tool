from fastapi import APIRouter

from app.api.legacy_handlers import change_password, health, login, logout, me
from app.schemas import UserOut

router = APIRouter()
router.add_api_route("/health", health, methods=["GET"])
router.add_api_route("/api/v1/auth/login", login, methods=["POST"], response_model=UserOut)
router.add_api_route("/api/v1/auth/logout", logout, methods=["POST"], status_code=204)
router.add_api_route("/api/v1/auth/me", me, methods=["GET"], response_model=UserOut)
router.add_api_route(
    "/api/v1/auth/change-password",
    change_password,
    methods=["POST"],
    response_model=UserOut,
)
