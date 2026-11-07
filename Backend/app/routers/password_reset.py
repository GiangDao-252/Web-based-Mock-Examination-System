import hashlib
import hmac
import logging
import os
import secrets
import smtplib
import ssl

from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from uuid import uuid4

import psycopg

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)

from app.database import get_connection
from app.security import hash_password


router = APIRouter(
    prefix="/api/v1",
    tags=["Password recovery"],
)

logger = logging.getLogger(__name__)

GENERIC_MESSAGE = (
    "Nếu email thuộc tài khoản đang hoạt động, "
    "bạn sẽ nhận được mã OTP. Hãy kiểm tra cả thư rác."
)

INVALID_OTP = (
    "Mã OTP không hợp lệ, đã hết hạn hoặc đã vượt số lần thử. "
    "Hãy yêu cầu mã mới nếu cần."
)


class ForgotPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr = Field(max_length=254)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        if isinstance(value, str):
            return value.strip().lower()
        return value


class ResetPasswordRequest(ForgotPasswordRequest):
    otp: str = Field(pattern=r"^[0-9]{6}$")
    new_password: str = Field(min_length=8, max_length=128)


def mail_settings():
    names = (
        "SMTP_HOST",
        "SMTP_PORT",
        "SMTP_USER",
        "SMTP_PASSWORD",
        "SMTP_FROM",
        "OTP_SECRET",
    )

    if any(not os.getenv(name) for name in names):
        raise HTTPException(
            status_code=503,
            detail="Máy chủ chưa được cấu hình gửi email khôi phục.",
        )

    try:
        port = int(os.environ["SMTP_PORT"])
    except ValueError:
        raise HTTPException(
            status_code=503,
            detail="Cấu hình cổng SMTP không hợp lệ.",
        ) from None

    if port not in (465, 587):
        raise HTTPException(
            status_code=503,
            detail="SMTP_PORT phải là 465 hoặc 587.",
        )

    secret = os.environ["OTP_SECRET"]

    if len(secret) < 32:
        raise HTTPException(
            status_code=503,
            detail="OTP_SECRET cần có ít nhất 32 ký tự.",
        )

    return {
        "host": os.environ["SMTP_HOST"],
        "port": port,
        "username": os.environ["SMTP_USER"],
        "password": os.environ["SMTP_PASSWORD"],
        "sender": os.environ["SMTP_FROM"],
        "secret": secret,
    }


def otp_digest(secret, email, request_id, otp):
    value = f"{email}:{request_id}:{otp}".encode("utf-8")

    return hmac.new(
        secret.encode("utf-8"),
        value,
        hashlib.sha256,
    ).hexdigest()


def deliver_otp(settings, email, request_id, otp):
    """Chạy sau khi transaction tạo mã đã commit."""
    message = EmailMessage()
    message["Subject"] = "MATCHDAY - Mã khôi phục mật khẩu"
    message["From"] = settings["sender"]
    message["To"] = email

    message.set_content(
        "Bạn vừa yêu cầu khôi phục mật khẩu MATCHDAY.\n\n"
        f"Mã OTP: {otp}\n\n"
        "Mã có hiệu lực trong 10 phút và chỉ dùng được một lần.\n"
        "Không chia sẻ mã này với người khác.\n"
        "Nếu không yêu cầu, bạn có thể bỏ qua email này.\n"
    )

    try:
        context = ssl.create_default_context()

        if settings["port"] == 465:
            with smtplib.SMTP_SSL(
                settings["host"],
                settings["port"],
                timeout=10,
                context=context,
            ) as server:
                server.login(
                    settings["username"],
                    settings["password"],
                )
                server.send_message(message)
        else:
            with smtplib.SMTP(
                settings["host"],
                settings["port"],
                timeout=10,
            ) as server:
                server.ehlo()
                server.starttls(context=context)
                server.ehlo()
                server.login(
                    settings["username"],
                    settings["password"],
                )
                server.send_message(message)

    except Exception as error:
        # Không ghi OTP, mật khẩu SMTP hoặc nội dung email vào log.
        logger.error(
            "Không gửi được email OTP (%s).",
            type(error).__name__,
        )

        # Chỉ vô hiệu hóa đúng yêu cầu gửi thất bại.
        # Không làm ảnh hưởng mã mới hơn nếu người dùng đã gửi lại.
        try:
            with get_connection() as connection:
                connection.execute(
                    """
                    UPDATE public.password_reset_requests
                    SET otp_hash = NULL,
                        expires_at = NULL
                    WHERE email = %s
                      AND request_id = %s
                      AND consumed_at IS NULL
                    """,
                    (email, request_id),
                )
        except Exception:
            logger.error("Không vô hiệu hóa được yêu cầu OTP gửi lỗi.")


@router.post("/forgot-password")
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
):
    settings = mail_settings()
    email = str(payload.email)

    request_id = uuid4()
    otp = f"{secrets.randbelow(1_000_000):06d}"
    digest = otp_digest(
        settings["secret"], email, request_id, otp
    )

    send_email = False

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                # Tạo hàng cho cả email không tồn tại để áp dụng
                # cùng chính sách giới hạn gửi lại.
                cursor.execute(
                    """
                    INSERT INTO public.password_reset_requests (
                        email, request_id
                    )
                    VALUES (%s, %s)
                    ON CONFLICT (email) DO NOTHING
                    """,
                    (email, request_id),
                )

                cursor.execute(
                    """
                    SELECT *
                    FROM public.password_reset_requests
                    WHERE email = %s
                    FOR UPDATE
                    """,
                    (email,),
                )
                row = cursor.fetchone()
                now = datetime.now(timezone.utc)

                if (
                    row["last_sent_at"] is not None
                    and now - row["last_sent_at"]
                    < timedelta(seconds=60)
                ):
                    raise HTTPException(
                        status_code=429,
                        detail="Hãy chờ ít nhất 60 giây trước khi gửi lại.",
                    )

                new_window = (
                    now - row["window_started_at"]
                    >= timedelta(hours=1)
                )

                count = 0 if new_window else row["send_count"]
                window = now if new_window else row["window_started_at"]

                if count >= 5:
                    raise HTTPException(
                        status_code=429,
                        detail=(
                            "Đã đạt giới hạn 5 yêu cầu mỗi giờ. "
                            "Vui lòng thử lại sau."
                        ),
                    )

                cursor.execute(
                    """
                    SELECT id
                    FROM public.users
                    WHERE lower(email) = %s
                      AND is_active = true
                    """,
                    (email,),
                )
                user = cursor.fetchone()
                user_id = user["id"] if user else None

                cursor.execute(
                    """
                    UPDATE public.password_reset_requests
                    SET user_id = %s,
                        request_id = %s,
                        otp_hash = %s,
                        expires_at = %s,
                        attempts = 0,
                        consumed_at = NULL,
                        last_sent_at = %s,
                        window_started_at = %s,
                        send_count = %s
                    WHERE email = %s
                    """,
                    (
                        user_id,
                        request_id,
                        digest,
                        now + timedelta(minutes=10),
                        now,
                        window,
                        count + 1,
                        email,
                    ),
                )

                send_email = user is not None

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    if send_email:
        background_tasks.add_task(
            deliver_otp,
            settings,
            email,
            request_id,
            otp,
        )

    return {"message": GENERIC_MESSAGE}


@router.post("/reset-password")
def reset_password(payload: ResetPasswordRequest):
    settings = mail_settings()
    email = str(payload.email)

    # Thực hiện trước khi khóa hàng trong database.
    new_hash = hash_password(payload.new_password)
    success = False

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT *
                    FROM public.password_reset_requests
                    WHERE email = %s
                    FOR UPDATE
                    """,
                    (email,),
                )
                row = cursor.fetchone()
                now = datetime.now(timezone.utc)

                usable = (
                    row is not None
                    and row["otp_hash"] is not None
                    and row["expires_at"] is not None
                    and row["expires_at"] > now
                    and row["consumed_at"] is None
                    and row["attempts"] < 5
                )

                if usable:
                    supplied = otp_digest(
                        settings["secret"],
                        email,
                        row["request_id"],
                        payload.otp,
                    )

                    matches = hmac.compare_digest(
                        supplied,
                        row["otp_hash"],
                    )

                    if matches and row["user_id"] is not None:
                        cursor.execute(
                            """
                            UPDATE public.users
                            SET password_hash = %s,
                                updated_at = %s
                            WHERE id = %s
                              AND lower(email) = %s
                              AND is_active = true
                            RETURNING id
                            """,
                            (
                                new_hash,
                                now,
                                row["user_id"],
                                email,
                            ),
                        )
                        success = cursor.fetchone() is not None

                    if success:
                        cursor.execute(
                            """
                            UPDATE public.password_reset_requests
                            SET consumed_at = %s,
                                otp_hash = NULL
                            WHERE email = %s
                            """,
                            (now, email),
                        )
                    else:
                        cursor.execute(
                            """
                            UPDATE public.password_reset_requests
                            SET attempts = attempts + 1
                            WHERE email = %s
                            """,
                            (email,),
                        )

        # Ném lỗi sau khi thoát transaction để lần nhập sai
        # được commit, không bị rollback.
        if not success:
            raise HTTPException(
                status_code=400,
                detail=INVALID_OTP,
            )

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    return {
        "message": (
            "Đã đổi mật khẩu. Hãy đăng nhập bằng mật khẩu mới."
        )
    }
