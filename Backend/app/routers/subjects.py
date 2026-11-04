import psycopg
from fastapi import APIRouter, HTTPException

from app.database import get_connection

router = APIRouter(prefix="/api/v1", tags=["Subjects"])


@router.get("/subjects")
def get_subjects():
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT id, name FROM public.subjects ORDER BY id;"
                )
                return cursor.fetchall()
    except psycopg.Error:
        raise HTTPException(
            status_code=503,
            detail="Không truy vấn được database.",
        ) from None