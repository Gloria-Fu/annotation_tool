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

PROTECTED_REQUESTS = [
    ("POST", "/api/v1/auth/logout", None),
    ("GET", "/api/v1/auth/me", None),
    (
        "POST",
        "/api/v1/auth/change-password",
        {"current_password": "old-password", "new_password": "new-password-123"},
    ),
    ("GET", "/api/v1/users", None),
    (
        "POST",
        "/api/v1/users",
        {
            "username": "new-user",
            "display_name": "New User",
            "password": "password-1234",
            "role": "annotator",
            "project_ids": [],
        },
    ),
    ("PATCH", "/api/v1/users/user-id", {}),
    ("DELETE", "/api/v1/users/user-id", None),
    ("GET", "/api/v1/projects", None),
    ("POST", "/api/v1/projects", {"name": "New Project"}),
    ("POST", "/api/v1/projects/project-id/members", {"user_id": "user-id"}),
    ("GET", "/api/v1/datasets", None),
    (
        "POST",
        "/api/v1/datasets",
        {"project_id": "project-id", "name": "Dataset", "root_path": "/datasets/example"},
    ),
    ("GET", "/api/v1/import-jobs/job-id", None),
    ("POST", "/api/v1/import-jobs/job-id/retry", None),
    ("GET", "/api/v1/task-packages", None),
    (
        "POST",
        "/api/v1/task-packages",
        {"project_id": "project-id", "dataset_id": "dataset-id", "title": "Package"},
    ),
    ("POST", "/api/v1/task-packages/package-id/publish", None),
    ("GET", "/api/v1/task-packages/package-id/items", None),
    ("POST", "/api/v1/annotation-tasks/claim", None),
    ("POST", "/api/v1/review-tasks/claim", None),
    ("GET", "/api/v1/my-tasks", None),
    (
        "POST",
        "/api/v1/task-packages/package-id/assign",
        {"item_ids": ["item-id"], "assignee_id": "user-id", "stage": "annotation"},
    ),
    ("POST", "/api/v1/task-items/item-id/reclaim", {"reason": "reclaim"}),
    ("GET", "/api/v1/work-items/item-id/context", None),
    ("PUT", "/api/v1/work-items/item-id/draft", {"payload": {"segments": []}}),
    ("POST", "/api/v1/work-items/item-id/submit", {"payload": {"segments": []}}),
    ("POST", "/api/v1/work-items/item-id/review", {"decision": "approve"}),
    ("POST", "/api/v1/work-items/item-id/clear", None),
    ("POST", "/api/v1/work-items/item-id/quality-check", {"result": "passed"}),
    ("GET", "/api/v1/work-items/item-id/data", None),
    ("GET", "/api/v1/work-items/item-id/media/cam.head", None),
    ("GET", "/api/v1/stats?project_id=project-id", None),
    ("GET", "/api/v1/reports/tasks.csv?project_id=project-id", None),
]


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


@pytest.mark.parametrize(("method", "path", "body"), PROTECTED_REQUESTS)
def test_all_protected_operations_require_authentication(client, method, path, body):
    def reject_request() -> User:
        raise HTTPException(status_code=401, detail="未登录或会话已失效")

    app.dependency_overrides[current_user] = reject_request
    response = client.request(method, path, json=body)
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
