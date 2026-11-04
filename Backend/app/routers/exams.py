from typing import Literal

import psycopg
from fastapi import APIRouter, HTTPException, status
from psycopg.types.json import Jsonb

from app.database import get_connection
from app.dependencies import TokenUserId
from app.schemas.exam import ExamCreate

from uuid import UUID

from pydantic import Field

import json

from fastapi import Response

router = APIRouter(prefix="/api/v1/exams", tags=["Exams"])


def require_active_user(cursor, user_id: int):
    cursor.execute(
        """
        SELECT id FROM public.users
        WHERE id = %s AND is_active = true
        """,
        (user_id,),
    )
    if cursor.fetchone() is None:
        raise HTTPException(
            status_code=401,
            detail="Tài khoản không tồn tại hoặc đã bị vô hiệu hóa.",
            headers={"WWW-Authenticate": "Bearer"},
        )


@router.get("")
def list_exams(
    user_id: TokenUserId,
    scope: Literal["sample", "mine"] = "sample",
):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    SELECT
                        e.id AS "examId",
                        v.id AS "examVersionId",
                        v.version_no AS "examVersion",
                        v.title,
                        v.duration_minutes AS "durationMinutes",
                        (
                            SELECT count(*)
                            FROM public.questions q
                            WHERE q.exam_version_id = v.id
                        ) AS "questionCount"
                    FROM public.exams e
                    JOIN LATERAL (
                        SELECT *
                        FROM public.exam_versions
                        WHERE exam_id = e.id
                          AND published_at IS NOT NULL
                        ORDER BY version_no DESC
                        LIMIT 1
                    ) v ON true
                    WHERE e.deleted_at IS NULL
                      AND (
                          (%s = 'sample' AND e.owner_id IS NULL)
                          OR
                          (%s = 'mine' AND e.owner_id = %s)
                      )
                    ORDER BY v.title, e.id
                    """,
                    (scope, scope, user_id),
                )
                return cursor.fetchall()

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None


@router.post("", status_code=status.HTTP_201_CREATED)
def create_exam(payload: ExamCreate, user_id: TokenUserId):
    # Bỏ explanation nếu là None vì hàm SQL yêu cầu
    # explanation phải là chuỗi khi trường này xuất hiện.
    questions = [
        question.model_dump(exclude_none=True)
        for question in payload.questions
    ]

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    INSERT INTO public.exams (owner_id)
                    VALUES (%s)
                    RETURNING id
                    """,
                    (user_id,),
                )
                exam_id = cursor.fetchone()["id"]

                cursor.execute(
                    """
                    SELECT public.create_exam_version(
                        %s::uuid,
                        %s::bigint,
                        0::integer,
                        %s::text,
                        %s::integer,
                        %s::jsonb
                    ) AS id
                    """,
                    (
                        exam_id,
                        user_id,
                        payload.title,
                        payload.durationMinutes,
                        Jsonb(questions),
                    ),
                )
                version_id = cursor.fetchone()["id"]

                cursor.execute(
                    """
                    SELECT
                        exam_id AS "examId",
                        id AS "examVersionId",
                        version_no AS "examVersion",
                        title,
                        duration_minutes AS "durationMinutes"
                    FROM public.exam_versions
                    WHERE id = %s
                    """,
                    (version_id,),
                )
                result = cursor.fetchone()

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    return result

class ExamUpdate(ExamCreate):
    expectedVersion: int = Field(strict=True, ge=1)


@router.put("/{exam_id}")
def update_exam(
    exam_id: UUID,
    payload: ExamUpdate,
    user_id: TokenUserId,
):
    questions = [
        question.model_dump(exclude_none=True)
        for question in payload.questions
    ]

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    SELECT id
                    FROM public.exams
                    WHERE id = %s
                      AND owner_id = %s
                      AND deleted_at IS NULL
                    FOR UPDATE
                    """,
                    (exam_id, user_id),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Không tìm thấy đề của bạn.",
                    )

                cursor.execute(
                    """
                    SELECT public.create_exam_version(
                        %s::uuid,
                        %s::bigint,
                        %s::integer,
                        %s::text,
                        %s::integer,
                        %s::jsonb
                    ) AS id
                    """,
                    (
                        exam_id,
                        user_id,
                        payload.expectedVersion,
                        payload.title,
                        payload.durationMinutes,
                        Jsonb(questions),
                    ),
                )
                version_id = cursor.fetchone()["id"]

                cursor.execute(
                    """
                    SELECT
                        exam_id AS "examId",
                        id AS "examVersionId",
                        version_no AS "examVersion",
                        title,
                        duration_minutes AS "durationMinutes"
                    FROM public.exam_versions
                    WHERE id = %s
                    """,
                    (version_id,),
                )
                result = cursor.fetchone()

    except psycopg.errors.SerializationFailure:
        raise HTTPException(
            status_code=409,
            detail="Đề đã thay đổi. Hãy tải lại trước khi sửa.",
        ) from None
    except psycopg.errors.RaiseException:
        raise HTTPException(
            status_code=409,
            detail="Không thể tạo phiên bản mới với dữ liệu hiện tại.",
        ) from None
    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    return result


@router.delete("/{exam_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_exam(exam_id: UUID, user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    UPDATE public.exams
                    SET deleted_at = clock_timestamp()
                    WHERE id = %s
                      AND owner_id = %s
                      AND deleted_at IS NULL
                    RETURNING id
                    """,
                    (exam_id, user_id),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Không tìm thấy đề của bạn.",
                    )

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    return None

def load_owned_exam(cursor, exam_id: UUID, user_id: int):
    cursor.execute(
        """
        SELECT
            e.id AS "examId",
            v.id AS "examVersionId",
            v.version_no AS "examVersion",
            v.title,
            v.duration_minutes AS "durationMinutes"
        FROM public.exams e
        JOIN LATERAL (
            SELECT id, version_no, title, duration_minutes
            FROM public.exam_versions
            WHERE exam_id = e.id
              AND published_at IS NOT NULL
            ORDER BY version_no DESC
            LIMIT 1
        ) v ON true
        WHERE e.id = %s
          AND e.owner_id = %s
          AND e.deleted_at IS NULL
        """,
        (exam_id, user_id),
    )
    exam = cursor.fetchone()

    if exam is None:
        raise HTTPException(
            status_code=404,
            detail="Không tìm thấy đề của bạn.",
        )

    cursor.execute(
        """
        SELECT
            id,
            question_no AS "questionNumber",
            body AS text,
            jsonb_build_object(
                'a', option_a,
                'b', option_b,
                'c', option_c,
                'd', option_d
            ) AS options,
            correct_answer AS "correctAnswer",
            explanation
        FROM public.questions
        WHERE exam_version_id = %s
        ORDER BY question_no
        """,
        (exam["examVersionId"],),
    )
    exam["questions"] = cursor.fetchall()
    return exam


@router.get("/{exam_id}")
def get_owned_exam(exam_id: UUID, user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)
                return load_owned_exam(cursor, exam_id, user_id)

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None


@router.get("/{exam_id}/versions")
def list_exam_versions(exam_id: UUID, user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    SELECT id
                    FROM public.exams
                    WHERE id = %s
                      AND owner_id = %s
                      AND deleted_at IS NULL
                    """,
                    (exam_id, user_id),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Không tìm thấy đề của bạn.",
                    )

                cursor.execute(
                    """
                    SELECT
                        v.exam_id AS "examId",
                        v.id AS "examVersionId",
                        v.version_no AS "examVersion",
                        v.title,
                        v.duration_minutes AS "durationMinutes",
                        v.published_at AS "publishedAt",
                        (
                            SELECT count(*)
                            FROM public.questions q
                            WHERE q.exam_version_id = v.id
                        ) AS "questionCount"
                    FROM public.exam_versions v
                    WHERE v.exam_id = %s
                      AND v.published_at IS NOT NULL
                    ORDER BY v.version_no DESC
                    """,
                    (exam_id,),
                )
                return cursor.fetchall()

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None


@router.get("/{exam_id}/download")
def download_owned_exam(exam_id: UUID, user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)
                exam = load_owned_exam(cursor, exam_id, user_id)

                # Xuất đúng định dạng ExamCreate để có thể nhập lại.
                export_data = ExamCreate.model_validate(
                    {
                        "title": exam["title"],
                        "durationMinutes": exam["durationMinutes"],
                        "questions": [
                            {
                                "text": question["text"],
                                "options": question["options"],
                                "correctAnswer": question["correctAnswer"],
                                **(
                                    {"explanation": question["explanation"]}
                                    if question["explanation"] is not None
                                    else {}
                                ),
                            }
                            for question in exam["questions"]
                        ],
                    }
                ).model_dump(exclude_none=True)

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    return Response(
        content=json.dumps(
            export_data,
            ensure_ascii=False,
            indent=2,
        ),
        media_type="application/json",
        headers={
            "Content-Disposition": (
                f'attachment; filename="exam-{exam_id}.json"'
            )
        },
    )