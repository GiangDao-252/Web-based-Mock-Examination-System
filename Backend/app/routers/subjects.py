import re

import psycopg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.database import get_connection
from app.dependencies import TokenUserId
from app.routers.exams import require_active_user


router = APIRouter(prefix="/api/v1", tags=["Subjects"])


class SubjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value):
        if isinstance(value, str):
            return re.sub(r"\s+", " ", value).strip()
        return value


@router.get("/subjects")
def get_subjects(user_id: TokenUserId):
    """Lấy môn chung và môn riêng của tài khoản hiện tại."""
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    SELECT
                        s.id,
                        s.name,
                        (s.owner_id IS NULL) AS "isShared",
                        count(e.id) FILTER (
                            WHERE e.owner_id IS NULL
                        ) AS "sampleCount",
                        count(e.id) FILTER (
                            WHERE e.owner_id = %s
                        ) AS "mineCount"
                    FROM public.subjects s
                    LEFT JOIN public.exams e
                      ON e.subject_id = s.id
                     AND e.deleted_at IS NULL
                     AND (
                         e.owner_id IS NULL
                         OR e.owner_id = %s
                     )
                     AND EXISTS (
                         SELECT 1
                         FROM public.exam_versions v
                         WHERE v.exam_id = e.id
                           AND v.published_at IS NOT NULL
                     )
                    WHERE s.owner_id IS NULL
                       OR s.owner_id = %s
                    GROUP BY s.id, s.name, s.owner_id
                    ORDER BY lower(s.name), s.id
                    """,
                    (user_id, user_id, user_id),
                )
                return cursor.fetchall()

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None


@router.post("/subjects")
def create_subject(payload: SubjectCreate, user_id: TokenUserId):
    """Dùng môn có sẵn hoặc tạo môn riêng, không tạo trùng."""
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                # Tuần tự hóa thao tác tạo môn của cùng tài khoản.
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
                        detail="Tài khoản không còn hoạt động.",
                    )

                # Ưu tiên môn chung nếu đã tồn tại cùng tên.
                cursor.execute(
                    """
                    SELECT
                        id,
                        name,
                        (owner_id IS NULL) AS "isShared"
                    FROM public.subjects
                    WHERE lower(name) = lower(%s)
                      AND (
                          owner_id IS NULL
                          OR owner_id = %s
                      )
                    ORDER BY (owner_id IS NULL) DESC, id
                    LIMIT 1
                    """,
                    (payload.name, user_id),
                )
                existing = cursor.fetchone()

                if existing is not None:
                    return {**existing, "created": False}

                cursor.execute(
                    """
                    INSERT INTO public.subjects (name, owner_id)
                    VALUES (%s, %s)
                    ON CONFLICT (owner_id, lower(name))
                    WHERE owner_id IS NOT NULL
                    DO UPDATE SET name = subjects.name
                    RETURNING
                        id,
                        name,
                        (owner_id IS NULL) AS "isShared"
                    """,
                    (payload.name, user_id),
                )
                subject = cursor.fetchone()

                return {**subject, "created": True}

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None