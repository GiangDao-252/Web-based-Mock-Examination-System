from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.auth import router as auth_router
from app.routers.exam_import import router as exam_import_router
from app.routers.subjects import router as subjects_router
from app.routers.system import router as system_router
from app.routers.exams import router as exams_router
from app.routers.attempts import router as attempts_router
from app.routers.profile import router as profile_router

app = FastAPI(
    title="MATCHDAY API",
    description="Backend cho hệ thống thi thử trực tuyến.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    ],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

app.include_router(system_router)
app.include_router(exam_import_router)
app.include_router(subjects_router)
app.include_router(auth_router)
app.include_router(exams_router)
app.include_router(attempts_router)
app.include_router(profile_router)

@app.get("/health", tags=["System"])
def health():
    return {"status": "ok"}