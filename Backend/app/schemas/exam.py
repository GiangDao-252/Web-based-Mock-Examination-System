from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from uuid import UUID


AnswerKey = Literal["a", "b", "c", "d"]


class AnswerOptions(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    a: str = Field(min_length=1, max_length=10000)
    b: str = Field(min_length=1, max_length=10000)
    c: str = Field(min_length=1, max_length=10000)
    d: str = Field(min_length=1, max_length=10000)


class QuestionCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    text: str = Field(min_length=1, max_length=10000)
    options: AnswerOptions
    correctAnswer: AnswerKey
    explanation: str | None = Field(
        default=None,
        max_length=20000,
    )


class ExamCreate(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
    )

    title: str = Field(min_length=1, max_length=120)
    durationMinutes: int = Field(
        strict=True,
        ge=1,
        le=180,
    )
    questions: list[QuestionCreate] = Field(
        min_length=1,
        max_length=100,
    ) 
    
class QuestionForAttempt(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    questionNumber: int = Field(ge=1, le=100)
    text: str
    options: AnswerOptions


class ExamForAttempt(BaseModel):
    model_config = ConfigDict(extra="ignore")

    examId: UUID
    examVersionId: UUID
    examVersion: int = Field(ge=1)
    title: str
    durationMinutes: int = Field(ge=1, le=180)
    questions: list[QuestionForAttempt] = Field(
        min_length=1,
        max_length=100,
    )