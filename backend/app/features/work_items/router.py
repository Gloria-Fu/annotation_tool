from fastapi import APIRouter

from app.api.legacy_handlers import (
    clear_annotations,
    item_data,
    item_media,
    review_item,
    save_draft,
    submit_annotation,
    work_context,
)
from app.features.quality.router import router as quality_router
from app.schemas import TaskItemOut, WorkContext

router = APIRouter()
router.add_api_route(
    "/api/v1/work-items/{item_id}/context",
    work_context,
    methods=["GET"],
    response_model=WorkContext,
)
router.add_api_route(
    "/api/v1/work-items/{item_id}/draft",
    save_draft,
    methods=["PUT"],
    response_model=TaskItemOut,
)
router.add_api_route(
    "/api/v1/work-items/{item_id}/submit",
    submit_annotation,
    methods=["POST"],
    response_model=TaskItemOut,
)
router.add_api_route(
    "/api/v1/work-items/{item_id}/review",
    review_item,
    methods=["POST"],
    response_model=TaskItemOut,
)
router.add_api_route(
    "/api/v1/work-items/{item_id}/clear",
    clear_annotations,
    methods=["POST"],
    response_model=TaskItemOut,
)
router.include_router(quality_router)
router.add_api_route("/api/v1/work-items/{item_id}/data", item_data, methods=["GET"])
router.add_api_route(
    "/api/v1/work-items/{item_id}/media/{media_key:path}",
    item_media,
    methods=["GET"],
)
