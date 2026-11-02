import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import get_settings
from app.dependencies import TokenUserId
from app.security import create_access_token


application = FastAPI()


@application.get("/protected")
def protected_route(user_id: TokenUserId):
    return {"user_id": user_id}


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


def test_missing_token(client):
    response = client.get("/protected")

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"


def test_invalid_token(client):
    response = client.get(
        "/protected",
        headers={"Authorization": "Bearer invalid-token"},
    )

    assert response.status_code == 401


def test_valid_token(client):
    token = create_access_token("123")

    response = client.get(
        "/protected",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json() == {"user_id": 123}


@pytest.mark.parametrize(
    "subject",
    ["abc", "0", "-1", "9223372036854775808"],
)
def test_invalid_user_id(client, subject):
    token = create_access_token(subject)

    response = client.get(
        "/protected",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 401