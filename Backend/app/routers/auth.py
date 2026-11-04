from typing import Annotated

import psycopg
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.database import get_connection
from app.dependencies import TokenUserId
from app.schemas.auth import RegisterRequest, TokenResponse, UserPublic
from app.security import (
    create_access_token,
    hash_password,
    verify_password,
)


router = APIRouter(prefix="/api/v1", tags=["Authentication"])


@router.post(
    "/register",
    response_model=UserPublic,
    status_code=status.HTTP_201_CREATED,
)
def register(payload: RegisterRequest):
    password_hash = hash_password(payload.password)

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO public.users (
                        email, password_hash, display_name
                    )
                    VALUES (%s, %s, %s)
                    RETURNING id, email, display_name
                    """,
                    (
                        str(payload.email),
                        password_hash,
                        payload.display_name,
                    ),
                )
                user = cursor.fetchone()

    except psycopg.errors.UniqueViolation as exc:
        if exc.diag.constraint_name == "uq_users_email":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email đã được sử dụng.",
            ) from None
        raise

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không kết nối được database.",
        ) from None

    return user


@router.post("/token", response_model=TokenResponse)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
):
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Email hoặc mật khẩu không đúng.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, password_hash, is_active
                    FROM public.users
                    WHERE lower(email) = %s
                    """,
                    (form.username.strip().lower(),),
                )
                user = cursor.fetchone()

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không kết nối được database.",
        ) from None

    if user is None:
        raise credentials_error

    if not verify_password(form.password, user["password_hash"]):
        raise credentials_error

    if not user["is_active"]:
        raise credentials_error

    return TokenResponse(
        access_token=create_access_token(str(user["id"])),
    )


@router.get("/me", response_model=UserPublic)
def get_me(user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id, email, display_name
                    FROM public.users
                    WHERE id = %s AND is_active = true
                    """,
                    (user_id,),
                )
                user = cursor.fetchone()

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không kết nối được database.",
        ) from None

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user