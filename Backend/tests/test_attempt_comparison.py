from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from app.schemas.report import AttemptReport
from app.services.attempt_comparison import compare_attempts


@pytest.fixture
def make_attempt():
    exam_id = uuid4()
    version_id = uuid4()
    question_id = uuid4()
    start = datetime(2026, 11, 2, 10, tzinfo=timezone.utc)

    def build(*, day=0, correct=False, leaves=0, **overrides):
        started_at = start + timedelta(days=day)
        ended_at = started_at + timedelta(minutes=5)

        payload = {
            "attemptId": uuid4(),
            "examId": exam_id,
            "examVersionId": version_id,
            "examVersion": 1,
            "examTitle": "Toán cơ bản",
            "status": "submitted",
            "startedAt": started_at,
            "endedAt": ended_at,
            "submittedAt": ended_at,
            "totalQuestions": 1,
            "answeredQuestions": 1,
            "correctQuestions": int(correct),
            "wrongQuestions": int(not correct),
            "score": 10 if correct else 0,
            "pageLeaveCount": leaves,
            "questions": [
                {
                    "id": question_id,
                    "questionNumber": 1,
                    "text": "2 + 2 = ?",
                    "options": {
                        "a": "3",
                        "b": "4",
                        "c": "5",
                        "d": "6",
                    },
                    "selectedAnswer": "b" if correct else "a",
                    "correctAnswer": "b",
                    "explanation": None,
                }
            ],
        }
        payload.update(overrides)
        return AttemptReport.model_validate(payload)

    return build


def test_compare_orders_attempts_by_start_time(make_attempt):
    first = make_attempt(day=0)
    second = make_attempt(day=1, correct=True)
    latest = make_attempt(day=2)

    result = compare_attempts([latest, first, second])

    assert result["attemptCount"] == 3
    assert result["firstScore"] == 0
    assert result["latestScore"] == 0
    assert result["bestScore"] == 10
    assert result["scoreChange"] == 0
    assert [
        item["attemptId"] for item in result["attempts"]
    ] == [
        str(first.attemptId),
        str(second.attemptId),
        str(latest.attemptId),
    ]


@pytest.mark.parametrize(
    "first_correct,latest_correct,expected_change",
    [
        (False, True, 10),
        (True, False, -10),
    ],
)
def test_score_change(
    make_attempt, first_correct, latest_correct, expected_change
):
    first = make_attempt(day=0, correct=first_correct)
    latest = make_attempt(day=1, correct=latest_correct)

    result = compare_attempts([first, latest])

    assert result["scoreChange"] == expected_change


def test_single_attempt(make_attempt):
    attempt = make_attempt(correct=True)

    result = compare_attempts([attempt])

    assert result["attemptCount"] == 1
    assert result["firstScore"] == 10
    assert result["latestScore"] == 10
    assert result["bestScore"] == 10
    assert result["scoreChange"] == 0


def test_reject_empty_list():
    with pytest.raises(ValueError):
        compare_attempts([])


@pytest.mark.parametrize("field", ["examId", "examVersionId"])
def test_reject_different_exam_or_version(make_attempt, field):
    first = make_attempt()
    other = make_attempt(day=1, **{field: uuid4()})

    with pytest.raises(ValueError):
        compare_attempts([first, other])


def test_reject_duplicate_attempt(make_attempt):
    attempt = make_attempt()

    with pytest.raises(ValueError):
        compare_attempts([attempt, attempt])


def test_page_leaves_do_not_reduce_score(make_attempt):
    attempt = make_attempt(correct=True, leaves=5)

    result = compare_attempts([attempt])

    assert result["latestScore"] == 10
    assert result["attempts"][0]["pageLeaveCount"] == 5