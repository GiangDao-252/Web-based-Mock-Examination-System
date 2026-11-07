from typing import Annotated

import psycopg
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from app.database import get_connection
from app.dependencies import TokenUserId
from app.routers.exams import require_active_user
from app.schemas.exam import ExamCreate
from app.services.document_import import (
    MAX_DOCUMENT_BYTES,
    DocumentImportError,
    convert_document,
)
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
        filename = file.filename or ""
        if not filename.lower().endswith(".json"):
            raise HTTPException(
                status_code=415,
                detail="Chỉ hỗ trợ file JSON.",
            )

        content = await file.read(MAX_FILE_BYTES + 1)
        if len(content) > MAX_FILE_BYTES:
            raise HTTPException(
                status_code=413,
                detail="File đề thi không được vượt quá 1 MB.",
            )

        return parse_exam_file(content)

    except ExamImportError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None

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
            },
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


@router.post("/convert")
async def convert_exam_document(
    user_id: TokenUserId,
    file: Annotated[UploadFile, File()],
):
    try:
        filename = file.filename or ""
        if not filename.lower().endswith((".docx", ".pdf")):
            raise HTTPException(
                status_code=415,
                detail="Chỉ hỗ trợ DOCX và PDF.",
            )

        with get_connection() as connection:
            with connection.cursor() as cursor:
                require_active_user(cursor, user_id)

        content = await file.read(MAX_DOCUMENT_BYTES + 1)
        if len(content) > MAX_DOCUMENT_BYTES:
            raise HTTPException(
                status_code=413,
                detail="File tối đa 10 MB.",
            )

        return await run_in_threadpool(
            convert_document,
            content,
            filename,
        )

    except DocumentImportError as error:
        raise HTTPException(status_code=422, detail=str(error)) from None

    except psycopg.OperationalError:
        raise HTTPException(
            status_code=503,
            detail="Không kết nối được database.",
        ) from None

    finally:
        await file.close()