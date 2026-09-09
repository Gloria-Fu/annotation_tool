from fastapi import APIRouter

from app.api.legacy_handlers import (
    create_dataset,
    get_import_job,
    list_datasets,
    retry_import,
)
from app.schemas import DatasetOut, ImportJobOut

router = APIRouter()
router.add_api_route(
    "/api/v1/datasets",
    list_datasets,
    methods=["GET"],
    response_model=list[DatasetOut],
)
router.add_api_route(
    "/api/v1/datasets",
    create_dataset,
    methods=["POST"],
    response_model=DatasetOut,
    status_code=202,
)
router.add_api_route(
    "/api/v1/import-jobs/{job_id}",
    get_import_job,
    methods=["GET"],
    response_model=ImportJobOut,
)
router.add_api_route(
    "/api/v1/import-jobs/{job_id}/retry",
    retry_import,
    methods=["POST"],
    response_model=ImportJobOut,
    status_code=202,
)
