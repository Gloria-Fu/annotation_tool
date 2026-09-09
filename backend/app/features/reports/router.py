from fastapi import APIRouter

from app.api.legacy_handlers import project_stats, task_report
from app.schemas import StatsOut

router = APIRouter()
router.add_api_route(
    "/api/v1/stats",
    project_stats,
    methods=["GET"],
    response_model=StatsOut,
)
router.add_api_route("/api/v1/reports/tasks.csv", task_report, methods=["GET"])
