from fastapi import APIRouter

from app.features.auth.router import router as auth_router
from app.features.datasets.router import router as datasets_router
from app.features.projects.router import router as projects_router
from app.features.reports.router import router as reports_router
from app.features.task_packages.router import router as task_packages_router
from app.features.users.router import router as users_router
from app.features.work_items.router import router as work_items_router

router = APIRouter()
router.include_router(auth_router)
router.include_router(users_router)
router.include_router(projects_router)
router.include_router(datasets_router)
router.include_router(task_packages_router)
router.include_router(work_items_router)
router.include_router(reports_router)
