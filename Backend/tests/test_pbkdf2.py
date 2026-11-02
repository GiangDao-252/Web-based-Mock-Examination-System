import pytest

from app.security import verify_password


# Hash của tài khoản demo trong file seed Tân đã gửi.
DEMO_HASH = (
    "pbkdf2_sha256$600000$matchday-demo-v2$"
    "QIWMSirx5KR/bIfQKDgo7ocwhH7ehqvOKfHriIZeiwM="
)


def test_demo_password_matches_seed():
    assert verify_password("MatchdayDemo!2026", DEMO_HASH)


def test_wrong_demo_password():
    assert not verify_password("WrongPassword!2026", DEMO_HASH)


@pytest.mark.parametrize(
    "encoded",
    [
        "",
        "unknown-format",
        "pbkdf2_sha256$missing-fields",
        "pbkdf2_sha256$abc$salt$AAAA",
        "pbkdf2_sha256$0$salt$AAAA",
        "pbkdf2_sha256$1000001$salt$AAAA",
        "pbkdf2_sha256$600000$$AAAA",
        "pbkdf2_sha256$600000$salt$not-base64!",
        "pbkdf2_sha256$600000$salt$AAAA",
    ],
)
def test_reject_malformed_hash(encoded):
    assert verify_password("TestPassword!2026", encoded) is False