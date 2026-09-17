from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import require_roles
from app.models.user import User, UserRole
from app.services.learning_service import learning_service

router = APIRouter(prefix="/training", tags=["Training"])

MAX_PREDICT_TEXT_LENGTH = 50_000  # 50K characters


@router.get("/status")
async def training_status():
    """Get model training status including sample counts and last run info."""
    return learning_service.status()


@router.get("/history")
async def training_history(limit: int = 20):
    """Get recent training run history with metrics."""
    if limit < 1 or limit > 100:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 100")
    return {"runs": learning_service.get_training_history(limit)}


@router.get("/dashboard")
async def dashboard_stats():
    """Get comprehensive dashboard statistics for the training pipeline."""
    return learning_service.get_dashboard_stats()


@router.post("/generate-samples")
async def generate_ai_samples(
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    count: int = 100,
):
    """Generate synthetic AI-written training samples for balance."""
    if count < 1 or count > 1000:
        raise HTTPException(status_code=400, detail="count must be between 1 and 1000")
    return learning_service.generate_ai_samples(count)


@router.post("/trigger-training")
async def trigger_training(
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
):
    """Manually trigger model retraining."""
    try:
        learning_service.request_retrain()
        return {"status": "training_queued", "message": "Retraining has been queued"}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to queue training")


@router.post("/predict")
async def predict_text(text: str):
    """Predict whether text is AI-written using the trained model."""
    if not text.strip():
        raise HTTPException(status_code=400, detail="text is required")

    # Validate text length
    if len(text) > MAX_PREDICT_TEXT_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Text too long. Maximum {MAX_PREDICT_TEXT_LENGTH} characters allowed.",
        )

    result = learning_service.predict_text(text)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail="Model not trained yet. Generate samples and trigger training first.",
        )
    return result
