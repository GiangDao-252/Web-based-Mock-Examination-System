from datetime import datetime, timedelta, timezone

import jwt
import pytest
from jwt.exceptions import (
    ExpiredSignatureError,
    InvalidSignatureError,
    MissingRequiredClaimError,
)

from app.config import get_settings
from app.security import create_access_token, decode_access_token


@pytest.fixture(autouse=True)
def token_settings(monkeypatch):
    monkeypatch.setenv(
        "SECRET_KEY",
        "test-only-secret-key-" + "a" * 40,
    )
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
    get_settings.cache_clear()

    yield

    get_settings.cache_clear()


def sign_payload(payload, key=None):
    if key is None:
        key = get_settings().secret_key.get_secret_value()

    return jwt.encode(payload, key, algorithm="HS256")


def test_valid_token():
    token = create_access_token("123")
    payload = decode_access_token(token)

    assert payload["sub"] == "123"
    assert payload["exp"] - payload["iat"] == 30 * 60


def test_expired_token():
    now = datetime.now(timezone.utc)

    token = sign_payload({
        "sub": "123",
        "iat": now - timedelta(minutes=2),
        "exp": now - timedelta(minutes=1),
    })

    with pytest.raises(ExpiredSignatureError):
        decode_access_token(token)


def test_wrong_signature():
    now = datetime.now(timezone.utc)

    token = sign_payload(
        {
            "sub": "123",
            "iat": now,
            "exp": now + timedelta(minutes=30),
        },
        key="another-test-secret-key-" + "b" * 40,
    )

    with pytest.raises(InvalidSignatureError):
        decode_access_token(token)


@pytest.mark.parametrize("missing_claim", ["sub", "iat", "exp"])
def test_missing_required_claim(missing_claim):
    now = datetime.now(timezone.utc)

    payload = {
        "sub": "123",
        "iat": now,
        "exp": now + timedelta(minutes=30),
    }
    del payload[missing_claim]

    token = sign_payload(payload)

    with pytest.raises(MissingRequiredClaimError):
        decode_access_token(token)