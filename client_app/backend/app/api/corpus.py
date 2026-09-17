from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import create_access_token, get_current_user, require_roles
from app.models.user import User, UserRole
from app.services.corpus_sync_service import CorpusSyncService
from app.services.learning_service import learning_service

router = APIRouter(prefix="/corpus", tags=["Corpus"])
corpus_sync = CorpusSyncService()


@router.post("/refresh")
async def refresh_corpus_token(current_user: Annotated[User, Depends(get_current_user)]):
    return {"access_token": create_access_token(current_user.id), "token_type": "bearer"}


@router.get("/sync-status")
async def corpus_sync_status(
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
):
    """Get corpus synchronization statistics."""
    return corpus_sync.get_sync_stats()


@router.post("/sync-batch")
async def corpus_sync_batch(
    records: list[dict],
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
):
    """Sync a batch of corpus records with quality filtering."""
    if not records:
        raise HTTPException(status_code=400, detail="records list cannot be empty")
    if len(records) > 500:
        raise HTTPException(status_code=400, detail="max 500 records per batch")
    return corpus_sync.store_corpus_batch(records)


@router.post("/store-record")
async def store_corpus_record(
    record_id: str,
    title: str,
    description: str,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
    media_type: str = "text",
):
    """Store a single corpus record as a human-written sample."""
    return learning_service.store_corpus_record(record_id, title, description, media_type)


@router.get("/samples")
async def get_learning_samples(
    label: str | None = None,
    limit: int = 50,
    offset: int = 0,
):
    """Get learning samples with optional label filter."""
    if limit < 1 or limit > 200:
        raise HTTPException(status_code=400, detail="limit must be between 1 and 200")

    with learning_service._lock, learning_service._connect() as connection:
        if label:
            rows = connection.execute(
                """SELECT id, filename, media_type, label, label_source, created_at
                   FROM learning_samples
                   WHERE label = ?
                   ORDER BY created_at DESC
                   LIMIT ? OFFSET ?""",
                (label, limit, offset),
            ).fetchall()
        else:
            rows = connection.execute(
                """SELECT id, filename, media_type, label, label_source, created_at
                   FROM learning_samples
                   ORDER BY created_at DESC
                   LIMIT ? OFFSET ?""",
                (limit, offset),
            ).fetchall()

        total = connection.execute("SELECT COUNT(*) as count FROM learning_samples").fetchone()

    return {
        "samples": [
            {
                "id": row["id"],
                "filename": row["filename"],
                "media_type": row["media_type"],
                "label": row["label"],
                "source": row["label_source"],
                "created_at": row["created_at"],
            }
            for row in rows
        ],
        "total": total["count"] if total else 0,
        "limit": limit,
        "offset": offset,
    }


@router.delete("/samples/{sample_id}")
async def delete_learning_sample(
    sample_id: str,
    current_user: Annotated[User, Depends(require_roles(UserRole.ADMIN, UserRole.ML_ENGINEER))],
):
    """Delete a learning sample by ID."""
    with learning_service._lock, learning_service._connect() as connection:
        cursor = connection.execute("DELETE FROM learning_samples WHERE id = ?", (sample_id,))
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Sample not found")
    return {"deleted": True, "id": sample_id}


@router.get("/evaluation")
async def evaluate_model():
    """Run model evaluation and return detailed metrics."""
    try:
        import json
        from pathlib import Path

        report_dir = Path(__file__).resolve().parent.parent.parent / "data" / "reports"
        if report_dir.exists():
            reports = sorted(report_dir.glob("evaluation_*.json"), reverse=True)
            if reports:
                return json.loads(reports[0].read_text())

        return {"message": "No evaluation reports found. Run evaluation script first."}
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to load evaluation report")
