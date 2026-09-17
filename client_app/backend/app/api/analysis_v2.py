from __future__ import annotations

import asyncio
import json
import logging
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.analysis import (
    AnalysisJobResult,
    AnalysisJobV2,
    AnalysisPipelineEvent,
    AnalysisPriority,
    AnalysisSignal,
    AnalysisStatus,
    AnalyzerType,
    RiskLevel,
    SignalSeverity,
    SignalType,
)
from app.models.intelligence import AffectedSegment, Claim, Evidence
from app.models.user import User
from app.schemas.analysis_v2 import (
    AffectedSegmentResponse,
    AnalysisFullResponseV2,
    AnalysisJobResponseV2,
    AnalysisRequestV2,
    AnalysisResultResponseV2,
    ExplanationResponseV2,
    ModelInfoResponse,
    SignalBreakdownResponse,
    SignalResponse,
    VideoAnalysisFullResponse,
    VideoMetadataResponse,
)
from app.schemas.common import PaginatedResponse
from app.services.analysis_engine import (
    AIContentAnalyzer,
    AnalysisOrchestrator,
    AnalyzerContext,
    AuthenticityAnalyzer,
    LanguageAnalyzer,
    MetadataAnalyzer,
    PlagiarismAnalyzer,
    SimilarityAnalyzer,
)
from app.services.audit_service import log_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analysis-v2", tags=["Analysis V2"])


def _build_orchestrator() -> AnalysisOrchestrator:
    from app.services.model_registry import TextSklearnInference

    orch = AnalysisOrchestrator()
    orch.register_analyzer(AIContentAnalyzer(inference_provider=TextSklearnInference()))
    orch.register_analyzer(SimilarityAnalyzer())
    orch.register_analyzer(PlagiarismAnalyzer())
    orch.register_analyzer(AuthenticityAnalyzer())
    orch.register_analyzer(LanguageAnalyzer())
    orch.register_analyzer(MetadataAnalyzer())
    return orch


orchestrator = _build_orchestrator()


async def _run_analysis_background(
    job_id: str,
    text_content: str | None,
    modality: str,
    language: str,
    media_asset_id: str | None,
    storage_path: str | None,
    file_size: int,
    mime_type: str,
    requested: list[str] | None,
    db_url: str,
) -> None:
    """Execute analysis in a background task with its own DB session."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    from app.models.analysis import (
        AnalysisJobResult,
        AnalysisJobV2,
        AnalysisSignal,
        AnalysisStatus,
    )

    engine = create_async_engine(db_url)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        try:
            result = await db.execute(select(AnalysisJobV2).where(AnalysisJobV2.id == job_id))
            job = result.scalar_one_or_none()
            if not job:
                logger.error("Job %s not found", job_id)
                return

            job.status = AnalysisStatus.RUNNING.value
            job.started_at = datetime.now(UTC)
            await db.commit()

            req_types = [AnalyzerType(r) for r in requested] if requested else None

            ctx = AnalyzerContext(
                job=job,
                media_asset_id=media_asset_id,
                storage_path=storage_path,
                file_size=file_size,
                mime_type=mime_type,
                text_content=text_content,
                language=language,
            )

            await _add_event(db, job, "orchestration", None, "running", "Starting analysis")
            agg = await orchestrator.execute(ctx, requested=req_types, db=db)
            await _add_event(
                db,
                job,
                "orchestration",
                None,
                "completed",
                f"Completed {len(agg.analyzers_used)} analyzers in {agg.total_duration_ms:.0f}ms",
            )

            for sig_data in agg.signals:
                sig = AnalysisSignal(
                    job_id=job.id,
                    signal_type=sig_data.signal_type.value,
                    analyzer_type=sig_data.analyzer_type.value,
                    severity=sig_data.severity.value,
                    confidence=sig_data.confidence,
                    title=sig_data.title,
                    description=sig_data.description,
                    evidence_json=json.dumps(sig_data.evidence) if sig_data.evidence else None,
                    model_id=sig_data.model_id,
                    model_version=sig_data.model_version,
                )
                db.add(sig)

            limitations: list[str] = []
            if agg.errors:
                limitations.extend(agg.errors)
            if not agg.signals:
                limitations.append("No signals detected — result may not be conclusive.")

            job_result = AnalysisJobResult(
                job_id=job.id,
                assessment=agg.assessment,
                confidence=agg.confidence,
                risk_level=agg.risk_level.value,
                ai_content_score=agg.scores.get("ai_content_score"),
                authenticity_score=agg.scores.get("authenticity_score"),
                similarity_score=agg.scores.get("similarity_score"),
                plagiarism_score=agg.scores.get("plagiarism_score"),
                summary=agg.explanation.get("narrative", ""),
                limitations_json=json.dumps(limitations),
                processing_metadata_json=json.dumps(agg.metadata),
                explanation_json=json.dumps(agg.explanation),
            )
            db.add(job_result)

            job.status = AnalysisStatus.COMPLETED.value
            job.completed_at = datetime.now(UTC)
            await db.commit()

        except Exception as exc:
            logger.exception("Background analysis failed for job %s: %s", job_id, exc)
            try:
                job.status = AnalysisStatus.FAILED.value
                job.error_message = str(exc)
                job.completed_at = datetime.now(UTC)
                await db.commit()
            except Exception:
                logger.exception("Failed to mark job %s as failed", job_id)
        finally:
            await engine.dispose()


async def _add_event(
    db: AsyncSession,
    job: AnalysisJobV2,
    step: str,
    analyzer_type: str | None,
    step_status: str,
    message: str,
    duration_ms: int | None = None,
) -> None:
    event = AnalysisPipelineEvent(
        job_id=job.id,
        step=step,
        analyzer_type=analyzer_type,
        status=step_status,
        message=message,
        duration_ms=duration_ms,
    )
    db.add(event)
    await db.flush()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/", response_model=AnalysisJobResponseV2, status_code=status.HTTP_201_CREATED)
async def create_analysis_v2(
    data: AnalysisRequestV2,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    if not data.text and not data.media_asset_id:
        raise HTTPException(status_code=400, detail="Provide text or media_asset_id")

    # Validate text input length
    if data.text and len(data.text) > 100_000:
        raise HTTPException(
            status_code=400,
            detail="Text input too long. Maximum 100,000 characters allowed.",
        )

    # Validate language code
    if data.language and (not data.language.strip() or len(data.language) > 16):
        raise HTTPException(status_code=400, detail="Invalid language code")

    storage_path = None
    file_size = 0
    mime_type = ""

    if data.media_asset_id:
        from sqlalchemy import select as sa_select

        from app.models.all_models import MediaAsset

        result = await db.execute(sa_select(MediaAsset).where(MediaAsset.id == data.media_asset_id))
        asset = result.scalar_one_or_none()
        if not asset:
            raise HTTPException(status_code=404, detail="Media asset not found")
        storage_path = asset.storage_path
        file_size = asset.file_size
        mime_type = asset.mime_type
        if data.modality == "text":
            data.modality = asset.media_type

    job = AnalysisJobV2(
        user_id=current_user.id,
        media_asset_id=data.media_asset_id,
        input_text=data.text,
        modality=data.modality,
        status=AnalysisStatus.PENDING.value,
        priority=data.priority.value,
        requested_analyzers=json.dumps([a.value for a in data.analyzers]) if data.analyzers else None,
        model_versions_json=json.dumps(data.model_versions) if data.model_versions else None,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    from app.core.config import settings

    task = asyncio.create_task(
        _run_analysis_background(
            job_id=job.id,
            text_content=data.text,
            modality=data.modality,
            language=data.language,
            media_asset_id=data.media_asset_id,
            storage_path=storage_path,
            file_size=file_size,
            mime_type=mime_type,
            requested=[a.value for a in data.analyzers] if data.analyzers else None,
            db_url=settings.DATABASE_URL,
        )
    )
    task.add_done_callback(lambda _: None)  # prevent GC

    await log_audit(db, current_user.id, "create_analysis_v2", "analysis_job_v2", job.id)
    return job


@router.get("/", response_model=PaginatedResponse)
async def list_analyses_v2(
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
    page: int = 1,
    page_size: int = 20,
    status_filter: str | None = None,
):
    query = select(AnalysisJobV2).where(AnalysisJobV2.user_id == current_user.id)
    count_query = select(func.count()).select_from(AnalysisJobV2).where(AnalysisJobV2.user_id == current_user.id)
    if status_filter:
        query = query.where(AnalysisJobV2.status == status_filter)
        count_query = count_query.where(AnalysisJobV2.status == status_filter)
    total = (await db.execute(count_query)).scalar() or 0
    query = query.order_by(AnalysisJobV2.created_at.desc()).limit(page_size).offset((page - 1) * page_size)
    result = await db.execute(query)
    items = list(result.scalars().all())
    return PaginatedResponse(
        items=[AnalysisJobResponseV2.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size,
    )


@router.get("/{job_id}")
async def get_analysis_v2(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AnalysisJobV2).where(AnalysisJobV2.id == job_id))
    job = result.scalar_one_or_none()
    if not job or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Analysis not found")

    result_r = await db.execute(select(AnalysisJobResult).where(AnalysisJobResult.job_id == job_id))
    analysis_result = result_r.scalar_one_or_none()

    sig_result = await db.execute(
        select(AnalysisSignal).where(AnalysisSignal.job_id == job_id).order_by(AnalysisSignal.created_at)
    )
    signals = list(sig_result.scalars().all())

    explanation = None
    if analysis_result and analysis_result.explanation_json:
        explanation = json.loads(analysis_result.explanation_json)

    parsed_limitations = None
    if analysis_result and analysis_result.limitations_json:
        parsed_limitations = json.loads(analysis_result.limitations_json)
    parsed_metadata = None
    if analysis_result and analysis_result.processing_metadata_json:
        parsed_metadata = json.loads(analysis_result.processing_metadata_json)

    req_analyzers = json.loads(job.requested_analyzers) if job.requested_analyzers else None

    signal_responses = [
        SignalResponse(
            id=s.id,
            signal_type=SignalType(s.signal_type),
            analyzer_type=AnalyzerType(s.analyzer_type),
            severity=SignalSeverity(s.severity),
            confidence=s.confidence,
            title=s.title,
            description=s.description,
            evidence=json.loads(s.evidence_json) if s.evidence_json else None,
            model_id=s.model_id,
            model_version=s.model_version,
            created_at=s.created_at,
        )
        for s in signals
    ]

    explanation_response = ExplanationResponseV2(
        narrative=explanation.get("narrative", ""),
        key_factors=explanation.get("key_factors", []),
        recommendations=explanation.get("recommendations", []),
        language=explanation.get("language", "en"),
    ) if explanation else None

    # For video modality, return the extended response with segments, frames, etc.
    if job.modality == "video":
        # Fetch affected segments
        seg_result = await db.execute(
            select(AffectedSegment).where(AffectedSegment.analysis_job_id == job_id)
        )
        segments = list(seg_result.scalars().all())

        # Fetch evidence
        ev_result = await db.execute(
            select(Evidence).where(Evidence.analysis_job_id == job_id)
        )
        evidence_rows = list(ev_result.scalars().all())

        # Fetch claims
        claim_result = await db.execute(
            select(Claim).where(Claim.analysis_job_id == job_id)
        )
        claim_rows = list(claim_result.scalars().all())

        # Fetch media metadata for video
        video_metadata = None
        if job.media_asset_id:
            from app.models.all_models import MediaMetadata

            meta_result = await db.execute(
                select(MediaMetadata).where(MediaMetadata.media_asset_id == job.media_asset_id)
            )
            meta = meta_result.scalar_one_or_none()
            if meta:
                video_metadata = VideoMetadataResponse(
                    duration_seconds=meta.duration_seconds,
                    width=meta.width,
                    height=meta.height,
                    fps=None,
                    codec=meta.codec,
                    audio_codec=None,
                    bit_rate=meta.bit_rate,
                    sample_rate=meta.sample_rate,
                    channels=meta.channels,
                    frame_count=None,
                    has_audio=meta.channels is not None and meta.channels > 0,
                    resolution_class=_classify_resolution(meta.width, meta.height),
                )

        # Build signal breakdown by type
        signal_breakdown = _build_signal_breakdown(signals)

        # Build affected segment responses
        segment_responses = [
            AffectedSegmentResponse(
                id=seg.id,
                signal_id=seg.signal_id,
                start_seconds=seg.start_seconds,
                end_seconds=seg.end_seconds,
                score=seg.score,
                explanation=seg.explanation,
                signal_type=_get_signal_type_for_segment(seg.signal_id, signals),
                severity=_get_signal_severity_for_segment(seg.signal_id, signals),
            )
            for seg in segments
        ]

        # Build evidence list
        evidence_list = [
            {
                "id": ev.id,
                "evidence_type": ev.evidence_type,
                "content": ev.content,
                "locator": ev.locator,
                "support_score": ev.support_score,
                "provenance": ev.provenance,
            }
            for ev in evidence_rows
        ]

        # Build claims list
        claims_list = [
            {
                "id": cl.id,
                "text": cl.text,
                "status": cl.status,
                "extraction_method": cl.extraction_method,
            }
            for cl in claim_rows
        ]

        # Model info from processing metadata or signals
        model_info = _extract_model_info(signals, parsed_metadata)

        return VideoAnalysisFullResponse(
            analysis_id=job.id,
            asset_id=job.media_asset_id,
            assessment=analysis_result.assessment if analysis_result else "unknown",
            model_probability=analysis_result.model_probability if analysis_result else None,
            calibrated_probability=analysis_result.calibrated_probability if analysis_result else None,
            evidence_strength=analysis_result.evidence_strength if analysis_result else None,
            risk_level=analysis_result.risk_level if analysis_result else None,
            summary=analysis_result.summary if analysis_result else None,
            duration=video_metadata.duration_seconds if video_metadata else None,
            metadata=video_metadata,
            segments=segment_responses,
            frames=[],  # Frames are generated on-demand via media processor
            signals=signal_responses,
            signal_breakdown=signal_breakdown,
            evidence=evidence_list,
            sources=[],
            claims=claims_list,
            explanation=explanation_response,
            limitations=parsed_limitations or [],
            model_info=model_info,
            processing_status=job.status,
            processing_metadata=parsed_metadata,
            created_at=job.created_at,
        )

    # Non-video modalities return the standard response
    return AnalysisFullResponseV2(
        job=AnalysisJobResponseV2(
            id=job.id,
            user_id=job.user_id,
            modality=job.modality,
            status=AnalysisStatus(job.status),
            priority=AnalysisPriority(job.priority),
            requested_analyzers=req_analyzers,
            error_message=job.error_message,
            started_at=job.started_at,
            completed_at=job.completed_at,
            created_at=job.created_at,
        ),
        result=AnalysisResultResponseV2(
            id=analysis_result.id,
            job_id=analysis_result.job_id,
            assessment=analysis_result.assessment,
            confidence=analysis_result.confidence,
            risk_level=RiskLevel(analysis_result.risk_level),
            ai_content_score=analysis_result.ai_content_score,
            authenticity_score=analysis_result.authenticity_score,
            similarity_score=analysis_result.similarity_score,
            plagiarism_score=analysis_result.plagiarism_score,
            summary=analysis_result.summary,
            limitations=parsed_limitations,
            processing_metadata=parsed_metadata,
            created_at=analysis_result.created_at,
        )
        if analysis_result
        else None,
        signals=signal_responses,
        explanation=explanation_response,
    )


def _classify_resolution(width: int | None, height: int | None) -> str | None:
    if not width or not height:
        return None
    max_dim = max(width, height)
    if max_dim >= 3840:
        return "4K"
    if max_dim >= 1920:
        return "1080p"
    if max_dim >= 1280:
        return "720p"
    if max_dim >= 640:
        return "480p"
    return "SD"


def _build_signal_breakdown(signals: list) -> list[SignalBreakdownResponse]:
    type_map: dict[str, list] = {}
    for s in signals:
        stype = s.signal_type
        if stype not in type_map:
            type_map[stype] = []
        type_map[stype].append(s)

    breakdown = []
    type_labels = {
        "VISUAL_ARTIFACT": "Visual Analysis",
        "TEMPORAL": "Temporal Analysis",
        "AUDIO_INCONSISTENCY": "Audio Analysis",
        "METADATA_ANOMALY": "Metadata",
        "AI_CONTENT": "AI Content Detection",
        "AUTHENTICITY": "Authenticity",
        "COMPRESSION": "Compression",
    }
    for stype, sigs in type_map.items():
        max_conf = max(s.confidence for s in sigs)
        breakdown.append(SignalBreakdownResponse(
            signal_type=stype,
            label=type_labels.get(stype, stype),
            detected=True,
            strength=max_conf,
            description=f"{len(sigs)} signal(s) detected",
            signal_count=len(sigs),
        ))
    return breakdown


def _get_signal_type_for_segment(signal_id: str | None, signals: list) -> str | None:
    if not signal_id:
        return None
    for s in signals:
        if s.id == signal_id:
            return s.signal_type
    return None


def _get_signal_severity_for_segment(signal_id: str | None, signals: list) -> str | None:
    if not signal_id:
        return None
    for s in signals:
        if s.id == signal_id:
            return s.severity
    return None


def _extract_model_info(signals: list, metadata: dict | None) -> ModelInfoResponse:
    model_id = None
    model_version = None
    for s in signals:
        if s.model_id:
            model_id = s.model_id
        if s.model_version:
            model_version = s.model_version
    return ModelInfoResponse(
        model_id=model_id,
        display_name=model_id,
        version=model_version,
        architecture=None,
        modality="video",
        framework=None,
        dataset_version=metadata.get("dataset_version") if metadata else None,
        training_run_id=None,
        status="production",
    )


@router.get("/{job_id}/events")
async def get_analysis_events_v2(
    job_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AnalysisJobV2).where(AnalysisJobV2.id == job_id))
    job = result.scalar_one_or_none()
    if not job or job.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Analysis not found")

    events = await db.execute(
        select(AnalysisPipelineEvent)
        .where(AnalysisPipelineEvent.job_id == job_id)
        .order_by(AnalysisPipelineEvent.created_at)
    )
    return [
        {
            "step": e.step,
            "analyzer_type": e.analyzer_type,
            "status": e.status,
            "message": e.message,
            "duration_ms": e.duration_ms,
        }
        for e in events.scalars().all()
    ]
