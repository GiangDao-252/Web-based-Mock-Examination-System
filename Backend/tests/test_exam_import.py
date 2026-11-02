import json

import pytest

from app.services.exam_import import (
    MAX_FILE_BYTES,
    ExamImportError,
    parse_exam_file,
)


def valid_payload():
    return {
        "title": "Toán cơ bản",
        "durationMinutes": 30,
        "questions": [
            {
                "text": r"Tính \(2 + 2\)",
                "options": {
                    "a": "3",
                    "b": "4",
                    "c": "5",
                    "d": "6",
                },
                "correctAnswer": "b",
            }
        ],
    }


def test_import_valid_exam():
    content = json.dumps(valid_payload()).encode("utf-8")

    exam = parse_exam_file(content)

    assert exam.title == "Toán cơ bản"
    assert exam.questions[0].text == r"Tính \(2 + 2\)"


def test_import_utf8_bom():
    content = json.dumps(valid_payload()).encode("utf-8-sig")

    assert parse_exam_file(content).durationMinutes == 30


@pytest.mark.parametrize(
    "content",
    [
        b"",
        b"x" * (MAX_FILE_BYTES + 1),
        b"\xff",
        b"{invalid-json}",
        b'{"title": "A", "title": "B"}',
        b'{"durationMinutes": NaN}',
        b"[]",
    ],
)
def test_reject_invalid_file(content):
    with pytest.raises(ExamImportError):
        parse_exam_file(content)


def test_reject_invalid_exam_content():
    payload = valid_payload()
    payload["questions"][0]["correctAnswer"] = "e"

    content = json.dumps(payload).encode("utf-8")

    with pytest.raises(ExamImportError):
        parse_exam_file(content)