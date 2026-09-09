import pytest
from app.core.permissions import current_user
from app.main import app
from app.models import Role, User
from fastapi import HTTPException
from fastapi.testclient import TestClient

EXPECTED_OPERATIONS = {
    ("GET", "/health"),
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/auth/me"),
    ("POST", "/api/v1/auth/change-password"),
    ("GET", "/api/v1/users"),
    ("POST", "/api/v1/users"),
    ("PATCH", "/api/v1/users/{user_id}"),
    ("DELETE", "/api/v1/users/{user_id}"),
    ("GET", "/api/v1/projects"),
    ("POST", "/api/v1/projects"),
    ("POST", "/api/v1/projects/{project_id}/members"),
    ("GET", "/api/v1/datasets"),
    ("POST", "/api/v1/datasets"),
    ("GET", "/api/v1/import-jobs/{job_id}"),
    ("POST", "/api/v1/import-jobs/{job_id}/retry"),
    ("GET", "/api/v1/task-packages"),
    ("POST", "/api/v1/task-packages"),
    ("POST", "/api/v1/task-packages/{package_id}/publish"),
    ("GET", "/api/v1/task-packages/{package_id}/items"),
    ("POST", "/api/v1/annotation-tasks/claim"),
    ("POST", "/api/v1/review-tasks/claim"),
    ("GET", "/api/v1/my-tasks"),
    ("POST", "/api/v1/task-packages/{package_id}/assign"),
    ("POST", "/api/v1/task-items/{item_id}/reclaim"),
    ("GET", "/api/v1/work-items/{item_id}/context"),
    ("PUT", "/api/v1/work-items/{item_id}/draft"),
    ("POST", "/api/v1/work-items/{item_id}/submit"),
    ("POST", "/api/v1/work-items/{item_id}/review"),
    ("POST", "/api/v1/work-items/{item_id}/clear"),
    ("POST", "/api/v1/work-items/{item_id}/quality-check"),
    ("GET", "/api/v1/work-items/{item_id}/data"),
    ("GET", "/api/v1/work-items/{item_id}/media/{media_key}"),
    ("GET", "/api/v1/stats"),
    ("GET", "/api/v1/reports/tasks.csv"),
}


@pytest.fixture
def client():
    app.dependency_overrides.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_api_contract_contains_all_legacy_operations():
    operations = {
        (method.upper(), path)
        for path, definition in app.openapi()["paths"].items()
        for method in definition
        if method in {"get", "post", "put", "patch", "delete"}
    }
    assert operations == EXPECTED_OPERATIONS


def test_health_endpoint_returns_success(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_protected_endpoint_returns_unauthorized_without_user(client):
    def reject_request() -> User:
        raise HTTPException(status_code=401, detail="未登录或会话已失效")

    app.dependency_overrides[current_user] = reject_request
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401


def test_quality_endpoint_rejects_annotator_role(client):
    annotator = User(
        username="annotator",
        display_name="Annotator",
        password_hash="x",
        role=Role.ANNOTATOR,
    )
    app.dependency_overrides[current_user] = lambda: annotator
    response = client.post(
        "/api/v1/work-items/missing/quality-check",
        json={"result": "passed"},
    )
    assert response.status_code == 403
