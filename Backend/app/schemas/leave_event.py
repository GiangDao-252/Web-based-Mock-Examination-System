from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    model_validator,
)


class LeaveEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    eventId: UUID
    hiddenAt: AwareDatetime
    visibleAt: AwareDatetime | None = None
    endedAt: AwareDatetime | None = None

    @model_validator(mode="after")
    def validate_times(self):
        if self.visibleAt is not None and self.endedAt is not None:
            raise ValueError(
                "Chỉ gửi visibleAt hoặc endedAt, không gửi cả hai."
            )

        if self.visibleAt is not None:
            if self.visibleAt < self.hiddenAt:
                raise ValueError(
                    "visibleAt không được trước hiddenAt."
                )

        if self.endedAt is not None:
            if self.endedAt < self.hiddenAt:
                raise ValueError(
                    "endedAt không được trước hiddenAt."
                )

        return self