import psycopg
from fastapi import APIRouter, HTTPException, status

from app.database import get_connection
from app.schemas.auth import RegisterRequest, UserPublic
from app.security import hash_password


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
                status_code=409,
                detail="Email đã được sử dụng.",
            ) from None
        raise

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    return user