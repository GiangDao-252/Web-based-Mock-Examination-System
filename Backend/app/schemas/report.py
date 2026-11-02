from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.schemas.exam import AnswerKey, AnswerOptions


class AnswerReview(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    questionNumber: int = Field(ge=1, le=100)
    text: str
    options: AnswerOptions
    selectedAnswer: AnswerKey | None
    correctAnswer: AnswerKey
    explanation: str | None = None


class AttemptReport(BaseModel):
    model_config = ConfigDict(extra="ignore")

    attemptId: UUID
    examId: UUID
    examVersionId: UUID
    examVersion: int = Field(ge=1)
    examTitle: str

    status: Literal["submitted", "timed_out"]

    startedAt: AwareDatetime
    endedAt: AwareDatetime
    submittedAt: AwareDatetime

    totalQuestions: int = Field(ge=1, le=100)
    answeredQuestions: int = Field(ge=0, le=100)
    correctQuestions: int = Field(ge=0, le=100)
    wrongQuestions: int = Field(ge=0, le=100)

    score: float = Field(ge=0, le=10, allow_inf_nan=False)
    pageLeaveCount: int = Field(ge=0)

    questions: list[AnswerReview] = Field(
        min_length=1,
        max_length=100,
    )