from typing import Annotated

from fastapi.responses import Response
from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.dependencies import TokenUserId
from app.schemas.exam import ExamCreate
from app.services.exam_import import (
    MAX_FILE_BYTES,
    ExamImportError,
    parse_exam_file,
)


router = APIRouter(
    prefix="/api/v1/exams",
    tags=["Exam import"],
)


@router.post("/preview", response_model=ExamCreate)
async def preview_exam(
    user_id: TokenUserId,
    file: Annotated[UploadFile, File()],
):
    try:
        if not file.filename or not file.filename.lower().endswith(".json"):
            raise HTTPException(
                status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
                detail="Chỉ hỗ trợ file JSON.",
            )

        content = await file.read(MAX_FILE_BYTES + 1)

        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail="File đề thi không được vượt quá 1 MB.",
            )

        try:
            return parse_exam_file(content)
        except ExamImportError as error:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(error),
            ) from None

    finally:
        await file.close()
        
@router.get("/template")
def download_exam_template():
    template = ExamCreate.model_validate({
        "title": "Đề Toán mẫu",
        "durationMinutes": 30,
        "questions": [
            {
                "text": r"Nghiệm của \(2x + 6 = 14\) là gì?",
                "options": {
                    "a": "2",
                    "b": "3",
                    "c": "4",
                    "d": "5",
                },
                "correctAnswer": "c",
                "explanation": r"\(2x = 8 \Rightarrow x = 4\)",
            }
        ],
    })

    return Response(
        content=template.model_dump_json(indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition":
                'attachment; filename="matchday-exam-template.json"',
        },
    )