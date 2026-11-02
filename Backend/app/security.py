import base64
import binascii
import hashlib
import hmac
from datetime import datetime, timedelta, timezone

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash
from pwdlib.exceptions import UnknownHashError

from app.config import get_settings


password_hasher = PasswordHash.recommended()
ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    """Băm mật khẩu tài khoản mới bằng Argon2."""
    return password_hasher.hash(password)


def _verify_pbkdf2_password(password: str, hashed_password: str) -> bool:
    """Hỗ trợ định dạng PBKDF2 của dữ liệu seed."""
    try:
        algorithm, rounds_text, salt, digest_text = hashed_password.split("$")

        if algorithm != "pbkdf2_sha256":
            return False

        rounds = int(rounds_text)

        # Giới hạn số vòng để tránh xử lý hash lỗi quá lâu.
        if not 1 <= rounds <= 1_000_000:
            return False

        if not salt or len(salt) > 1024:
            return False

        expected_digest = base64.b64decode(
            digest_text,
            validate=True,
        )

        if len(expected_digest) != 32:
            return False

        actual_digest = hashlib.pbkdf2_hmac(
            "sha256",
            password.encode("utf-8"),
            salt.encode("utf-8"),
            rounds,
        )

        return hmac.compare_digest(actual_digest, expected_digest)

    except (ValueError, TypeError, binascii.Error):
        return False


def verify_password(password: str, hashed_password: str) -> bool:
    """Kiểm tra mật khẩu Argon2 hoặc PBKDF2 của seed."""
    if not isinstance(password, str):
        return False

    if not isinstance(hashed_password, str) or not hashed_password:
        return False

    if hashed_password.startswith("pbkdf2_sha256$"):
        return _verify_pbkdf2_password(password, hashed_password)

    try:
        return password_hasher.verify(password, hashed_password)
    except (UnknownHashError, ValueError):
        return False


def create_access_token(subject: str) -> str:
    """Tạo JWT với subject là ID tài khoản dạng chuỗi."""
    if not isinstance(subject, str) or not subject.strip():
        raise ValueError("Subject phải là mã người dùng không rỗng.")

    settings = get_settings()
    now = datetime.now(timezone.utc)

    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(
            minutes=settings.access_token_expire_minutes
        ),
    }

    return jwt.encode(
        payload,
        settings.secret_key.get_secret_value(),
        algorithm=ALGORITHM,
    )


def decode_access_token(token: str) -> dict:
    """Kiểm tra chữ ký, thời hạn và các trường bắt buộc của JWT."""
    if not isinstance(token, str) or not token.strip():
        raise InvalidTokenError("Token không hợp lệ.")

    settings = get_settings()

    payload = jwt.decode(
        token,
        settings.secret_key.get_secret_value(),
        algorithms=[ALGORITHM],
        options={"require": ["sub", "iat", "exp"]},
    )

    subject = payload["sub"]

    if not isinstance(subject, str) or not subject.strip():
        raise InvalidTokenError("Subject không hợp lệ.")

    return payload