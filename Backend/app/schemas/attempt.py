from uuid import UUID
from pydantic import AwareDatetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.exam import AnswerKey


class AnswerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    questionId: UUID
    selectedAnswer: AnswerKey | None
    isFlagged: bool = Field(strict=True)


class AttemptSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expectedSync: int = Field(
        strict=True,
        ge=0,
        le=2_147_483_647,
    )
    currentQuestion: int = Field(
        strict=True,
        ge=1,
        le=100,
    )
    answers: list[AnswerUpdate] = Field(
        max_length=100,
    )

    @model_validator(mode="after")
    def reject_duplicate_questions(self):
        question_ids = [answer.questionId for answer in self.answers]

        if len(question_ids) != len(set(question_ids)):
            raise ValueError("Không được gửi trùng questionId.")

        return self
    
class AttemptSubmit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expectedSync: int = Field(
        strict=True,
        ge=0,
        le=2_147_483_647,
    )
    answers: list[AnswerUpdate] = Field(
        max_length=100,
    )
    clientEndedAt: AwareDatetime | None = None

    @model_validator(mode="after")
    def reject_duplicate_questions(self):
        question_ids = [answer.questionId for answer in self.answers]

        if len(question_ids) != len(set(question_ids)):
            raise ValueError("Không được gửi trùng questionId.")

        return self