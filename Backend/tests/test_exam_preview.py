import json

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import get_settings
from app.routers.exam_import import router
from app.security import create_access_token
from app.services.exam_import import MAX_FILE_BYTES


application = FastAPI()
application.include_router(router)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv(
        "SECRET_KEY",
        "test-only-secret-key-" + "a" * 40,
    )
    get_settings.cache_clear()

    with TestClient(application) as test_client:
        yield test_client

    get_settings.cache_clear()


def auth_headers():
    token = create_access_token("1")
    return {"Authorization": f"Bearer {token}"}


def valid_content():
    return json.dumps({
        "title": "Toán cơ bản",
        "durationMinutes": 30,
        "questions": [
            {
                "text": "2 + 2 = ?",
                "options": {
                    "a": "3",
                    "b": "4",
                    "c": "5",
                    "d": "6",
                },
                "correctAnswer": "b",
            }
        ],
    }).encode("utf-8")


def test_preview_valid_file(client):
    response = client.post(
        "/api/v1/exams/preview",
        headers=auth_headers(),
        files={"file": ("exam.json", valid_content(), "application/json")},
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Toán cơ bản"
    assert response.json()["questions"][0]["correctAnswer"] == "b"


def test_preview_requires_token(client):
    response = client.post(
        "/api/v1/exams/preview",
        files={"file": ("exam.json", valid_content(), "application/json")},
    )

    assert response.status_code == 401


def test_preview_rejects_invalid_token(client):
    response = client.post(
        "/api/v1/exams/preview",
        headers={"Authorization": "Bearer invalid"},
        files={"file": ("exam.json", valid_content(), "application/json")},
    )

    assert response.status_code == 401


@pytest.mark.parametrize(
    "filename,content,expected_status",
    [
        ("exam.pdf", b"%PDF-demo", 415),
        ("exam.json", b"x" * (MAX_FILE_BYTES + 1), 413),
        ("exam.json", b"{invalid}", 422),
        ("exam.json", b"", 422),
        ("exam.json", b'{"title": "Missing questions"}', 422),
    ],
)
def test_preview_rejects_invalid_upload(
    client, filename, content, expected_status
):
    response = client.post(
        "/api/v1/exams/preview",
        headers=auth_headers(),
        files={"file": (filename, content, "application/octet-stream")},
    )

    assert response.status_code == expected_status


def test_preview_requires_file(client):
    response = client.post(
        "/api/v1/exams/preview",
        headers=auth_headers(),
    )

    assert response.status_code == 422
    
def test_download_template(client):
    response = client.get("/api/v1/exams/template")

    assert response.status_code == 200
    assert "attachment" in response.headers["content-disposition"]

    # File mẫu tải xuống phải dùng được ngay với API xem trước.
    preview = client.post(
        "/api/v1/exams/preview",
        headers=auth_headers(),
        files={
            "file": (
                "template.json",
                response.content,
                "application/json",
            )
        },
    )

    assert preview.status_code == 200
    assert preview.json()["title"] == "Đề Toán mẫu"