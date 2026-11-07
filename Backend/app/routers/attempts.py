from uuid import UUID, uuid4

import psycopg
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.database import get_connection
from app.dependencies import TokenUserId
from app.routers.exams import require_active_user
from app.schemas.exam import ExamForAttempt

from psycopg.types.json import Jsonb
from app.schemas.attempt import AttemptSave, AttemptSubmit
from app.schemas.report import AttemptReport
from app.schemas.leave_event import LeaveEventRequest

router = APIRouter(prefix="/api/v1/attempts", tags=["Attempts"])


class AttemptStart(BaseModel):
    model_config = ConfigDict(extra="forbid")

    examVersionId: UUID
    clientAttemptId: UUID = Field(default_factory=uuid4)


@router.post("")
def start_exam(payload: AttemptStart, user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                # Chỉ cho làm đề mẫu hoặc đề thuộc tài khoản hiện tại.
                cursor.execute(
                    """
                    SELECT
                        e.id AS "examId",
                        v.id AS "examVersionId",
                        v.version_no AS "examVersion",
                        v.title,
                        v.duration_minutes AS "durationMinutes"
                    FROM public.exam_versions v
                    JOIN public.exams e ON e.id = v.exam_id
                    WHERE v.id = %s
                      AND v.published_at IS NOT NULL
                      AND e.deleted_at IS NULL
                      AND (e.owner_id IS NULL OR e.owner_id = %s)
                    """,
                    (payload.examVersionId, user_id),
                )
                exam = cursor.fetchone()

                if exam is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Không tìm thấy đề có thể làm.",
                    )

                cursor.execute(
                    """
                    SELECT *
                    FROM public.start_attempt(
                        %s::bigint, %s::uuid, %s::uuid
                    )
                    """,
                    (
                        user_id,
                        payload.examVersionId,
                        payload.clientAttemptId,
                    ),
                )
                attempt = cursor.fetchone()

                # Không trả đáp án đúng và lời giải khi đang làm.
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
                        ) AS options
                    FROM public.questions
                    WHERE exam_version_id = %s
                    ORDER BY question_no
                    """,
                    (payload.examVersionId,),
                )
                exam["questions"] = cursor.fetchall()
                public_exam = ExamForAttempt.model_validate(exam)

                # Nếu khôi phục bài đang làm, trả cả đáp án đã lưu.
                cursor.execute(
                    """
                    SELECT
                        question_id AS "questionId",
                        selected_answer AS "selectedAnswer",
                        is_flagged AS "isFlagged"
                    FROM public.attempt_answers
                    WHERE attempt_id = %s
                    ORDER BY question_id
                    """,
                    (attempt["id"],),
                )
                answers = cursor.fetchall()

                result = {
                    "attemptId": attempt["id"],
                    "status": attempt["status"],
                    "startedAt": attempt["started_at"],
                    "deadlineAt": attempt["deadline_at"],
                    "syncVersion": attempt["sync_version"],
                    "currentQuestion": attempt["current_question"],
                    "exam": public_exam.model_dump(mode="json"),
                    "answers": answers,
                }

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    except psycopg.errors.RaiseException:
        raise HTTPException(
            status_code=409,
            detail="Không thể bắt đầu lượt làm với trạng thái hiện tại.",
        ) from None

    return result

@router.patch("/{attempt_id}")
def save_exam(
    attempt_id: UUID,
    payload: AttemptSave,
    user_id: TokenUserId,
):
    answers = [
        answer.model_dump(mode="json")
        for answer in payload.answers
    ]

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    SELECT id
                    FROM public.attempts
                    WHERE id = %s AND user_id = %s
                    """,
                    (attempt_id, user_id),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Không tìm thấy lượt làm.",
                    )

                cursor.execute(
                    """
                    SELECT *
                    FROM public.save_attempt(
                        %s::bigint,
                        %s::uuid,
                        %s::integer,
                        %s::jsonb,
                        %s::integer
                    )
                    """,
                    (
                        user_id,
                        attempt_id,
                        payload.expectedSync,
                        Jsonb(answers),
                        payload.currentQuestion,
                    ),
                )
                attempt = cursor.fetchone()

                result = {
                    "attemptId": attempt["id"],
                    "status": attempt["status"],
                    "syncVersion": attempt["sync_version"],
                    "currentQuestion": attempt["current_question"],
                    "answeredQuestions": attempt["answered_count"],
                }

    except psycopg.errors.SerializationFailure:
        raise HTTPException(
            status_code=409,
            detail="Dữ liệu đã thay đổi. Tải lại trạng thái lượt làm.",
        ) from None

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    except psycopg.errors.RaiseException:
        raise HTTPException(
            status_code=409,
            detail="Không thể lưu: bài đã kết thúc hoặc đã hết giờ.",
        ) from None

    except psycopg.IntegrityError:
        raise HTTPException(
            status_code=422,
            detail="Câu hỏi hoặc dữ liệu trả lời không hợp lệ.",
        ) from None

    return result

@router.post("/{attempt_id}/submit")
def submit_exam(
    attempt_id: UUID,
    payload: AttemptSubmit,
    user_id: TokenUserId,
):
    answers = [
        answer.model_dump(mode="json")
        for answer in payload.answers
    ]

    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    SELECT id
                    FROM public.attempts
                    WHERE id = %s AND user_id = %s
                    """,
                    (attempt_id, user_id),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Không tìm thấy lượt làm.",
                    )

                cursor.execute(
                    """
                    SELECT *
                    FROM public.submit_attempt(
                        %s::bigint,
                        %s::uuid,
                        %s::integer,
                        %s::jsonb,
                        %s::timestamptz
                    )
                    """,
                    (
                        user_id,
                        attempt_id,
                        payload.expectedSync,
                        Jsonb(answers),
                        payload.clientEndedAt,
                    ),
                )
                attempt = cursor.fetchone()

                result = {
                    "attemptId": attempt["id"],
                    "status": attempt["status"],
                    "syncVersion": attempt["sync_version"],
                    "startedAt": attempt["started_at"],
                    "endedAt": attempt["ended_at"],
                    "submittedAt": attempt["submitted_at"],
                    "totalQuestions": attempt["total_questions"],
                    "answeredQuestions": attempt["answered_count"],
                    "correctQuestions": attempt["correct_count"],
                    "wrongQuestions": attempt["wrong_count"],
                    "score": attempt["score"],
                    "pageLeaveCount": attempt["page_leave_count"],
                }

    except psycopg.errors.SerializationFailure:
        raise HTTPException(
            status_code=409,
            detail="Dữ liệu đã thay đổi. Tải lại trạng thái lượt làm.",
        ) from None

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    except psycopg.errors.RaiseException as exc:
        print("SUBMIT ERROR:", exc.diag.message_primary)
        print("CONTEXT:", exc.diag.context)
        raise HTTPException(
            status_code=409,
            detail="Không thể nộp bài với dữ liệu hiện tại.",
        ) from None

    except psycopg.IntegrityError:
        raise HTTPException(
            status_code=422,
            detail="Câu hỏi hoặc dữ liệu trả lời không hợp lệ.",
        ) from None

    return result

@router.get("")
def list_attempt_history(user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    SELECT
                        id AS "attemptId",
                        exam_id AS "examId",
                        exam_version_id AS "examVersionId",
                        version_no AS "examVersion",
                        title AS "examTitle",
                        status,
                        started_at AS "startedAt",
                        ended_at AS "endedAt",
                        submitted_at AS "submittedAt",
                        total_questions AS "totalQuestions",
                        answered_count AS "answeredQuestions",
                        correct_count AS "correctQuestions",
                        wrong_count AS "wrongQuestions",
                        score,
                        page_leave_count AS "pageLeaveCount"
                    FROM public.v_attempt_history
                    WHERE user_id = %s
                    ORDER BY submitted_at DESC, id DESC
                    """,
                    (user_id,),
                )
                return cursor.fetchall()

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None


@router.get("/{attempt_id}/report", response_model=AttemptReport)
def get_attempt_report(attempt_id: UUID, user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    SELECT
                        id AS "attemptId",
                        exam_id AS "examId",
                        exam_version_id AS "examVersionId",
                        version_no AS "examVersion",
                        title AS "examTitle",
                        status,
                        started_at AS "startedAt",
                        ended_at AS "endedAt",
                        submitted_at AS "submittedAt",
                        total_questions AS "totalQuestions",
                        answered_count AS "answeredQuestions",
                        correct_count AS "correctQuestions",
                        wrong_count AS "wrongQuestions",
                        score,
                        page_leave_count AS "pageLeaveCount"
                    FROM public.v_attempt_history
                    WHERE id = %s AND user_id = %s
                    """,
                    (attempt_id, user_id),
                )
                report = cursor.fetchone()

                if report is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Không tìm thấy kết quả bài làm.",
                    )

                cursor.execute(
                    """
                    SELECT
                        question_id AS id,
                        question_no AS "questionNumber",
                        body AS text,
                        jsonb_build_object(
                            'a', option_a,
                            'b', option_b,
                            'c', option_c,
                            'd', option_d
                        ) AS options,
                        selected_answer AS "selectedAnswer",
                        correct_answer AS "correctAnswer",
                        explanation
                    FROM public.v_attempt_review
                    WHERE attempt_id = %s AND user_id = %s
                    ORDER BY question_no
                    """,
                    (attempt_id, user_id),
                )
                report["questions"] = cursor.fetchall()

                return AttemptReport.model_validate(report)

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

@router.post("/{attempt_id}/leave-events")
def record_exam_leave(
    attempt_id: UUID,
    payload: LeaveEventRequest,
    user_id: TokenUserId,
):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    SELECT id
                    FROM public.attempts
                    WHERE id = %s AND user_id = %s
                    """,
                    (attempt_id, user_id),
                )
                if cursor.fetchone() is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Không tìm thấy lượt làm.",
                    )

                cursor.execute(
                    """
                    SELECT public.record_leave_event(
                        %s::bigint,
                        %s::uuid,
                        %s::uuid,
                        'hidden'::text,
                        %s::timestamptz,
                        %s::timestamptz,
                        %s::timestamptz
                    )
                    """,
                    (
                        user_id,
                        attempt_id,
                        payload.eventId,
                        payload.hiddenAt,
                        payload.visibleAt,
                        payload.endedAt,
                    ),
                )

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    except psycopg.errors.RaiseException:
        raise HTTPException(
            status_code=409,
            detail="Sự kiện không hợp lệ hoặc bài đã kết thúc.",
        ) from None

    except psycopg.IntegrityError:
        raise HTTPException(
            status_code=422,
            detail="Thời gian hoặc dữ liệu sự kiện không hợp lệ.",
        ) from None

    return {"eventId": payload.eventId, "saved": True}

@router.get("/active/list")
def list_active_attempts(user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                cursor.execute(
                    """
                    SELECT
                        a.id AS "attemptId",
                        v.exam_id AS "examId",
                        a.exam_version_id AS "examVersionId",
                        v.version_no AS "examVersion",
                        v.title AS "examTitle",
                        a.status,
                        a.started_at AS "startedAt",
                        a.deadline_at AS "deadlineAt",
                        a.sync_version AS "syncVersion",
                        a.current_question AS "currentQuestion",
                        a.answered_count AS "answeredQuestions",
                        (clock_timestamp() >= a.deadline_at)
                            AS "isExpired",
                        (e.deleted_at IS NOT NULL) AS "examDeleted"
                    FROM public.attempts a
                    JOIN public.exam_versions v
                        ON v.id = a.exam_version_id
                    JOIN public.exams e ON e.id = v.exam_id
                    WHERE a.user_id = %s
                      AND a.status = 'in_progress'
                    ORDER BY a.started_at DESC, a.id DESC
                    """,
                    (user_id,),
                )
                return cursor.fetchall()

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None


@router.get("/{attempt_id}")
def get_attempt_state(attempt_id: UUID, user_id: TokenUserId):
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

                # Giữ trạng thái và đáp án nhất quán trong lúc đọc.
                cursor.execute(
                    """
                    SELECT
                        a.id,
                        a.status,
                        a.started_at,
                        a.deadline_at,
                        a.sync_version,
                        a.current_question,
                        a.exam_version_id,
                        (clock_timestamp() >= a.deadline_at)
                            AS is_expired,
                        v.exam_id AS "examId",
                        v.id AS "examVersionId",
                        v.version_no AS "examVersion",
                        v.title,
                        v.duration_minutes AS "durationMinutes"
                    FROM public.attempts a
                    JOIN public.exam_versions v
                        ON v.id = a.exam_version_id
                    WHERE a.id = %s AND a.user_id = %s
                    FOR UPDATE OF a
                    """,
                    (attempt_id, user_id),
                )
                attempt = cursor.fetchone()

                if attempt is None:
                    raise HTTPException(
                        status_code=404,
                        detail="Không tìm thấy lượt làm.",
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
                        ) AS options
                    FROM public.questions
                    WHERE exam_version_id = %s
                    ORDER BY question_no
                    """,
                    (attempt["exam_version_id"],),
                )
                exam = ExamForAttempt.model_validate(
                    {
                        "examId": attempt["examId"],
                        "examVersionId": attempt["examVersionId"],
                        "examVersion": attempt["examVersion"],
                        "title": attempt["title"],
                        "durationMinutes": attempt["durationMinutes"],
                        "questions": cursor.fetchall(),
                    }
                )

                cursor.execute(
                    """
                    SELECT
                        question_id AS "questionId",
                        selected_answer AS "selectedAnswer",
                        is_flagged AS "isFlagged"
                    FROM public.attempt_answers
                    WHERE attempt_id = %s
                    ORDER BY question_id
                    """,
                    (attempt_id,),
                )
                answers = cursor.fetchall()

                in_progress = attempt["status"] == "in_progress"

                return {
                    "attemptId": attempt["id"],
                    "status": attempt["status"],
                    "startedAt": attempt["started_at"],
                    "deadlineAt": attempt["deadline_at"],
                    "syncVersion": attempt["sync_version"],
                    "currentQuestion": attempt["current_question"],
                    "isExpired": attempt["is_expired"],
                    "canSave": (
                        in_progress and not attempt["is_expired"]
                    ),
                    "canSubmit": in_progress,
                    "exam": exam.model_dump(mode="json"),
                    "answers": answers,
                }

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None
