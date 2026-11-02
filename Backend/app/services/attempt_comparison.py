from collections.abc import Sequence

from app.schemas.report import AttemptReport


def compare_attempts(
    attempts: Sequence[AttemptReport],
) -> dict:
    if not attempts:
        raise ValueError("Chưa có lượt làm để so sánh.")

    first = attempts[0]

    if any(
        attempt.examId != first.examId
        or attempt.examVersionId != first.examVersionId
        for attempt in attempts
    ):
        raise ValueError(
            "Chỉ so sánh các lượt làm cùng phiên bản đề."
        )

    attempt_ids = [attempt.attemptId for attempt in attempts]

    if len(attempt_ids) != len(set(attempt_ids)):
        raise ValueError("Danh sách chứa lượt làm bị trùng.")

    ordered = sorted(
        attempts,
        key=lambda attempt: (
            attempt.startedAt,
            str(attempt.attemptId),
        ),
    )

    scores = [attempt.score for attempt in ordered]

    return {
        "examId": str(first.examId),
        "examVersionId": str(first.examVersionId),
        "attemptCount": len(ordered),
        "firstScore": scores[0],
        "latestScore": scores[-1],
        "bestScore": max(scores),
        "scoreChange": round(scores[-1] - scores[0], 2),
        "attempts": [
            {
                "attemptId": str(attempt.attemptId),
                "startedAt": attempt.startedAt.isoformat(),
                "score": attempt.score,
                "pageLeaveCount": attempt.pageLeaveCount,
                "status": attempt.status,
            }
            for attempt in ordered
        ],
    }