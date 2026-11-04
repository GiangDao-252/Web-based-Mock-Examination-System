import psycopg
from fastapi import APIRouter, HTTPException

from app.database import get_connection
from app.dependencies import TokenUserId
from app.schemas.profile import ProfileResponse, ProfileUpdate


router = APIRouter(prefix="/api/v1/profile", tags=["Profile"])


def lock_active_user(cursor, user_id: int):
    cursor.execute(
        """
        SELECT id
        FROM public.users
        WHERE id = %s AND is_active = true
        FOR UPDATE
        """,
        (user_id,),
    )
    if cursor.fetchone() is None:
        raise HTTPException(
            status_code=401,
            detail="Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.",
            headers={"WWW-Authenticate": "Bearer"},
        )


def read_profile(cursor, user_id: int):
    cursor.execute(
        """
        SELECT u.display_name, p.goal
        FROM public.users u
        LEFT JOIN public.user_profiles p ON p.user_id = u.id
        WHERE u.id = %s AND u.is_active = true
        """,
        (user_id,),
    )
    profile = cursor.fetchone()

    if profile is None:
        raise HTTPException(
            status_code=401,
            detail="Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return ProfileResponse.model_validate(profile)


@router.get("", response_model=ProfileResponse)
def get_profile(user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                return read_profile(cursor, user_id)

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None


@router.patch("", response_model=ProfileResponse)
def update_profile(payload: ProfileUpdate, user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                lock_active_user(cursor, user_id)

                if "display_name" in payload.model_fields_set:
                    cursor.execute(
                        """
                        UPDATE public.users
                        SET display_name = %s,
                            updated_at = clock_timestamp()
                        WHERE id = %s
                        """,
                        (payload.display_name, user_id),
                    )

                if "goal" in payload.model_fields_set:
                    cursor.execute(
                        """
                        INSERT INTO public.user_profiles (
                            user_id, goal, updated_at
                        )
                        VALUES (%s, %s, clock_timestamp())
                        ON CONFLICT (user_id) DO UPDATE
                        SET goal = EXCLUDED.goal,
                            updated_at = EXCLUDED.updated_at
                        """,
                        (user_id, payload.goal),
                    )

                result = read_profile(cursor, user_id)

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    return result