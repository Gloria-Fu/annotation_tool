from fastapi import APIRouter

from app.api.legacy_handlers import quality_check
from app.schemas import TaskItemOut

router = APIRouter()

router.add_api_route(
    "/api/v1/work-items/{item_id}/quality-check",
    quality_check,
    methods=["POST"],
    response_model=TaskItemOut,
)
