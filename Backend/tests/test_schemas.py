from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.auth import RegisterRequest, UserPublic
from app.schemas.profile import ProfileUpdate
from app.schemas.attempt import AttemptSave, AttemptSubmit
from app.schemas.leave_event import LeaveEventRequest


def test_register_normalizes_input():
    request = RegisterRequest(
        email="  Giang@example.com  ",
        display_name="  Giang  ",
        password="TestPassword!2026",
    )

    assert str(request.email) == "giang@example.com"
    assert request.display_name == "Giang"


@pytest.mark.parametrize(
    "changes",
    [
        {"display_name": "   "},
        {"email": "invalid-email"},
        {"password": "123"},
        {"role": "admin"},
    ],
)
def test_register_rejects_invalid_input(changes):
    payload = {
        "email": "giang@example.com",
        "display_name": "Giang",
        "password": "TestPassword!2026",
    }
    payload.update(changes)

    with pytest.raises(ValidationError):
        RegisterRequest.model_validate(payload)


def test_public_user_excludes_password_hash():
    user = UserPublic.model_validate({
        "id": 1,
        "email": "giang@example.com",
        "display_name": "Giang",
        "password_hash": "private",
    })

    assert set(user.model_dump()) == {
        "id", "email", "display_name"
    }


def test_profile_only_updates_provided_fields():
    update = ProfileUpdate(display_name=" Giang ")

    assert update.model_dump(exclude_unset=True) == {
        "display_name": "Giang"
    }


def test_profile_can_clear_goal():
    update = ProfileUpdate(goal=None)

    assert update.model_dump(exclude_unset=True) == {
        "goal": None
    }


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"display_name": None},
        {"display_name": "   "},
        {"goal": "a" * 201},
        {"user_id": 2},
    ],
)
def test_profile_rejects_invalid_update(payload):
    with pytest.raises(ValidationError):
        ProfileUpdate.model_validate(payload)


def answer_payload():
    return {
        "questionId": str(uuid4()),
        "selectedAnswer": None,
        "isFlagged": False,
    }


def test_save_allows_clearing_answer():
    saved = AttemptSave(
        expectedSync=0,
        currentQuestion=1,
        answers=[answer_payload()],
    )

    assert saved.answers[0].selectedAnswer is None


@pytest.mark.parametrize("schema", [AttemptSave, AttemptSubmit])
def test_attempt_rejects_duplicate_question(schema):
    answer = answer_payload()
    payload = {
        "expectedSync": 0,
        "answers": [answer, answer.copy()],
    }

    if schema is AttemptSave:
        payload["currentQuestion"] = 1

    with pytest.raises(ValidationError):
        schema.model_validate(payload)


@pytest.mark.parametrize("field", ["score", "user_id"])
def test_submit_rejects_client_controlled_fields(field):
    payload = {
        "expectedSync": 0,
        "answers": [],
        field: 10,
    }

    with pytest.raises(ValidationError):
        AttemptSubmit.model_validate(payload)


def test_submit_rejects_timestamp_without_timezone():
    with pytest.raises(ValidationError):
        AttemptSubmit(
            expectedSync=0,
            answers=[],
            clientEndedAt="2026-11-02T10:00:00",
        )


def test_leave_event_allows_open_event():
    event = LeaveEventRequest(
        eventId=uuid4(),
        hiddenAt="2026-11-02T10:00:00+07:00",
    )

    assert event.visibleAt is None
    assert event.endedAt is None


@pytest.mark.parametrize(
    "changes",
    [
        {"visibleAt": "2026-11-02T09:59:00+07:00"},
        {"endedAt": "2026-11-02T09:59:00+07:00"},
        {
            "visibleAt": "2026-11-02T10:01:00+07:00",
            "endedAt": "2026-11-02T10:02:00+07:00",
        },
        {"hiddenAt": "2026-11-02T10:00:00"},
    ],
)
def test_leave_event_rejects_invalid_times(changes):
    payload = {
        "eventId": str(uuid4()),
        "hiddenAt": "2026-11-02T10:00:00+07:00",
    }
    payload.update(changes)

    with pytest.raises(ValidationError):
        LeaveEventRequest.model_validate(payload)