import psycopg
from fastapi import FastAPI, HTTPException

from app.database import get_connection


app = FastAPI(title="Matchday API")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/v1/subjects")
def get_subjects():
    try:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("""
                    SELECT id, name
                    FROM public.subjects
                    ORDER BY id;
                """)
                return cursor.fetchall()

    except psycopg.Error:
        raise HTTPException(
            status_code=503,
            detail="Không truy vấn được database.",
        ) from None