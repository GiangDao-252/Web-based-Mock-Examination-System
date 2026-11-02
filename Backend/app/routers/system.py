from fastapi import APIRouter

router = APIRouter(prefix="/api/v1", tags=["System"])


@router.get("/health")
def health_check():
    return {
        "status": "ok",
        "application": "MATCHDAY",
    }