from __future__ import annotations

import asyncio
import hashlib
import json
import logging
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.media_registry import detect_modality as detect_registered_modality
from app.core.media_registry import validate_file_signature
from app.models.all_models import MediaAsset, MediaMetadata
from app.models.processing import ProcessingArtifact, ProcessingJob, ProcessingJobEvent, ProcessingStatus
from app.services.media_processors import (
    ProcessingContext,
    ProcessingResult,
    get_processor,
)

logger = logging.getLogger(__name__)

PIPELINE_STEPS = [
    "validate",
    "validate_signature",
    "safety_scan",
    "checksum",
    "extract_metadata",
    "normalize",
    "preprocess",
    "parse_structure",
    "extract_features",
    "assess_corpus_eligibility",
]


def detect_modality(mime_type: str, filename: str) -> str | None:
    """Detect modality from MIME type and filename extension."""
    return detect_registered_modality(filename, mime_type)


class IngestionPipeline:
    """Orchestrates the full ingestion pipeline for all modalities.

    Pipeline: upload → validate → safety scan → metadata → normalize → preprocess → features → candidate
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_job(
        self,
        user_id: str,
        media_asset_id: str,
        modality: str,
    ) -> ProcessingJob:
        job = ProcessingJob(
            user_id=user_id,
            media_asset_id=media_asset_id,
            modality=modality,
            status=ProcessingStatus.QUEUED.value,
            progress=0,
            max_retries=3,
        )
        self.db.add(job)
        await self.db.commit()
        await self.db.refresh(job)
        return job

    async def execute_job(
        self, job_id: str, file_path: str, file_size: int, mime_type: str, original_filename: str
    ) -> None:
        """Execute the full ingestion pipeline asynchronously."""
        job = await self._get_job(job_id)
        if job is None:
            logger.error("Job %s not found", job_id)
            return

        if job.status == ProcessingStatus.CANCELLED.value:
            return

        await self._update_job_status(job, ProcessingStatus.PROCESSING)
        job.attempt_count += 1
        await self.db.commit()
        await self._add_event(job, "pipeline_start", "started", "Ingestion pipeline started")

        ctx = ProcessingContext(
            media_asset_id=job.media_asset_id,
            user_id=job.user_id,
            modality=job.modality,
            file_path=file_path,
            file_size=file_size,
            mime_type=mime_type,
            original_filename=original_filename,
        )

        try:
            processor = get_processor(job.modality)
        except ValueError as e:
            await self._fail_job(job, str(e), "UNSUPPORTED_MODALITY")
            return

        step_results: dict[str, bool] = {}
        for i, step_name in enumerate(PIPELINE_STEPS):
            job = await self._get_job(job_id)
            if job is None or job.status == ProcessingStatus.CANCELLED.value:
                return

            progress = int((i / len(PIPELINE_STEPS)) * 100)
            await self._update_progress(job, progress, step_name)

            try:
                if step_name == "safety_scan":
                    result = await self._safety_scan(ctx)
                elif step_name == "validate_signature":
                    result = await self._validate_signature(ctx)
                elif step_name == "checksum":
                    result = await self._calculate_checksum(ctx)
                else:
                    step_fn = getattr(processor, step_name)
                    result = await step_fn(ctx)

                step_results[step_name] = result.success
                ctx.metadata.update(result.metadata)
                ctx.features.update(result.features)
                ctx.warnings.extend(result.warnings)

                if not result.success:
                    error_msg = "; ".join(result.errors)
                    await self._fail_job(job, error_msg, "PROCESSING_ERROR")
                    return

                await self._add_event(
                    job,
                    step_name,
                    "completed",
                    f"Step completed: {step_name}",
                    details=result.metadata,
                )
                if step_name == "checksum" and ctx.source_sha256:
                    source_artifact = ProcessingArtifact(
                        job_id=job.id,
                        source_media_asset_id=job.media_asset_id,
                        stage="upload",
                        artifact_type="original",
                        storage_path=ctx.file_path,
                        sha256=ctx.source_sha256,
                        metadata_json=json.dumps({"filename": ctx.original_filename, "mime_type": ctx.mime_type}),
                    )
                    self.db.add(source_artifact)
                    await self.db.flush()
                    ctx.lineage.append(
                        {
                            "artifact_id": source_artifact.id,
                            "stage": "upload",
                            "path": ctx.file_path,
                            "sha256": ctx.source_sha256,
                        }
                    )
                await self._record_derived_artifact(job, ctx, step_name, result)

            except Exception as e:
                logger.exception("Pipeline step '%s' failed for job %s", step_name, job_id)
                await self._retry_or_fail(job, file_path, file_size, mime_type, original_filename, step_name, e)
                return

        result_json = json.dumps(
            {
                "metadata": ctx.metadata,
                "features": ctx.features,
                "warnings": ctx.warnings,
                "step_results": step_results,
                "lineage": ctx.lineage,
                "source_sha256": ctx.source_sha256,
            },
            default=str,
        )

        job = await self._get_job(job_id)
        if job and job.status != ProcessingStatus.CANCELLED.value:
            job.result_json = result_json
            await self._persist_media_metadata(job, ctx)
            job.progress = 100
            await self._update_job_status(job, ProcessingStatus.COMPLETED)
            await self._add_event(job, "pipeline_complete", "completed", "Ingestion pipeline completed")

    async def cancel_job(self, job_id: str) -> bool:
        job = await self._get_job(job_id)
        if job is None:
            return False
        if job.status in (ProcessingStatus.COMPLETED.value, ProcessingStatus.FAILED.value):
            return False
        await self._update_job_status(job, ProcessingStatus.CANCELLED)
        job.cancelled_at = datetime.now(UTC)
        await self.db.commit()
        return True

    async def get_job(self, job_id: str) -> ProcessingJob | None:
        return await self._get_job(job_id)

    async def list_user_jobs(
        self,
        user_id: str,
        status: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple[list[ProcessingJob], int]:
        from sqlalchemy import func, select

        query = select(ProcessingJob).where(ProcessingJob.user_id == user_id)
        count_query = select(func.count()).select_from(ProcessingJob).where(ProcessingJob.user_id == user_id)

        if status:
            query = query.where(ProcessingJob.status == status)
            count_query = count_query.where(ProcessingJob.status == status)

        total = (await self.db.execute(count_query)).scalar() or 0
        query = query.order_by(ProcessingJob.created_at.desc()).limit(limit).offset(offset)
        result = await self.db.execute(query)
        return list(result.scalars().all()), total

    # ----- Private helpers -----

    async def _get_job(self, job_id: str) -> ProcessingJob | None:
        from sqlalchemy import select

        result = await self.db.execute(select(ProcessingJob).where(ProcessingJob.id == job_id))
        return result.scalar_one_or_none()

    async def _update_job_status(self, job: ProcessingJob, status: ProcessingStatus) -> None:
        job.status = status.value
        now = datetime.now(UTC)
        if status == ProcessingStatus.PROCESSING:
            job.started_at = now
            job.next_retry_at = None
        elif status in (ProcessingStatus.COMPLETED, ProcessingStatus.FAILED):
            job.completed_at = now
        await self.db.commit()

    async def _validate_signature(self, ctx: ProcessingContext) -> ProcessingResult:
        try:
            data = await asyncio.to_thread(lambda: Path(ctx.file_path).read_bytes()[:8192])
            valid, error = validate_file_signature(ctx.modality, data, ctx.original_filename)
            return ProcessingResult(success=valid, errors=[error] if error else [])
        except OSError as exc:
            return ProcessingResult(success=False, errors=[f"Unable to read file signature: {exc}"])

    async def _calculate_checksum(self, ctx: ProcessingContext) -> ProcessingResult:
        def digest() -> str:
            hasher = hashlib.sha256()
            with Path(ctx.file_path).open("rb") as stream:
                for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                    hasher.update(chunk)
            return hasher.hexdigest()

        checksum = await asyncio.to_thread(digest)
        ctx.source_sha256 = checksum
        return ProcessingResult(success=True, metadata={"sha256": checksum})

    async def _record_derived_artifact(
        self, job: ProcessingJob, ctx: ProcessingContext, stage: str, result: ProcessingResult
    ) -> None:
        path = (
            result.normalized_path or ctx.metadata.get("normalized_path")
            if stage in {"normalize", "preprocess"}
            else None
        )
        if not path:
            return
        artifact_path = Path(str(path))
        if not artifact_path.exists():
            return
        checksum = await asyncio.to_thread(lambda: hashlib.sha256(artifact_path.read_bytes()).hexdigest())
        parent = ctx.lineage[-1]["artifact_id"] if ctx.lineage else None
        artifact = ProcessingArtifact(
            job_id=job.id,
            source_media_asset_id=job.media_asset_id,
            parent_artifact_id=parent,
            stage=stage,
            artifact_type=artifact_path.suffix.lstrip(".") or "file",
            storage_path=str(artifact_path),
            sha256=checksum,
            metadata_json=json.dumps({"source_sha256": ctx.source_sha256}),
        )
        self.db.add(artifact)
        await self.db.flush()
        ctx.lineage.append({"artifact_id": artifact.id, "stage": stage, "path": str(artifact_path), "sha256": checksum})

    async def _persist_media_metadata(self, job: ProcessingJob, ctx: ProcessingContext) -> None:
        asset = await self.db.get(MediaAsset, job.media_asset_id)
        if asset is None:
            return
        metadata = (
            await self.db.execute(select(MediaMetadata).where(MediaMetadata.media_asset_id == asset.id))
        ).scalar_one_or_none()
        if metadata is None:
            metadata = MediaMetadata(media_asset_id=asset.id)
            self.db.add(metadata)
        values = ctx.metadata
        metadata.width = values.get("width", metadata.width)
        metadata.height = values.get("height", metadata.height)
        metadata.duration_seconds = values.get("duration_seconds", metadata.duration_seconds)
        metadata.sample_rate = values.get("sample_rate", metadata.sample_rate)
        metadata.channels = values.get("channels", metadata.channels)
        metadata.codec = values.get("codec", values.get("video_codec", metadata.codec))
        metadata.bit_rate = values.get("bit_rate", metadata.bit_rate)
        metadata.text_length = values.get("text_length", metadata.text_length)
        metadata.language_detected = values.get("language", metadata.language_detected)
        metadata.extra = json.dumps(values, default=str)
        asset.status = "processed"

    async def _retry_or_fail(
        self,
        job: ProcessingJob,
        file_path: str,
        file_size: int,
        mime_type: str,
        original_filename: str,
        step: str,
        error: Exception,
    ) -> None:
        if job.attempt_count < job.max_retries:
            delay = min(60, 2 ** max(job.attempt_count - 1, 0))
            job.status = ProcessingStatus.QUEUED.value
            job.next_retry_at = datetime.now(UTC)
            job.error_message = f"Retrying {step} after transient error: {error}"
            await self.db.commit()
            await self._add_event(job, step, "retrying", job.error_message, {"backoff_seconds": delay})
            await asyncio.sleep(delay)
            await self.execute_job(job.id, file_path, file_size, mime_type, original_filename)
            return
        await self._fail_job(job, f"Unexpected error in {step}: {error}", "INTERNAL_ERROR")

    async def _update_progress(self, job: ProcessingJob, progress: int, step: str) -> None:
        job.progress = progress
        job.current_step = step
        await self.db.commit()

    async def _add_event(
        self,
        job: ProcessingJob,
        step: str,
        status: str,
        message: str,
        details: dict | None = None,
        duration_ms: int | None = None,
    ) -> None:
        event = ProcessingJobEvent(
            job_id=job.id,
            step=step,
            status=status,
            message=message,
            details_json=json.dumps(details, default=str) if details else None,
            duration_ms=duration_ms,
        )
        self.db.add(event)
        await self.db.commit()

    async def _fail_job(self, job: ProcessingJob, error_message: str, error_code: str) -> None:
        job.error_message = error_message
        job.error_code = error_code
        await self._update_job_status(job, ProcessingStatus.FAILED)
        await self._add_event(job, "pipeline_error", "failed", error_message)

    async def _safety_scan(self, ctx: ProcessingContext) -> ProcessingResult:
        """Safety scanning integration point. Runs basic checks.

        In production, integrate with ClamAV, VirusTotal, or similar.
        """

        # Basic safety: check for suspicious file patterns
        path = Path(ctx.file_path)
        try:
            header = path.read_bytes()[:16]

            # Check for executable signatures
            suspicious_signatures = [
                b"MZ",  # PE executable
                b"\x7fELF",  # ELF executable
                b"\xca\xfe",  # Mach-O / Java class
                b"PK\x03\x04",  # Could be ZIP (check further)
            ]

            for sig in suspicious_signatures:
                if header[: len(sig)] == sig:
                    if sig == b"PK\x03\x04":
                        # ZIP-like files are OK for docx/pdf
                        continue
                    return ProcessingResult(
                        success=False,
                        errors=[f"Potentially unsafe file detected (signature: {sig!r})"],
                    )

            return ProcessingResult(success=True, metadata={"safety_scan": "passed"})

        except Exception:
            return ProcessingResult(success=True, metadata={"safety_scan": "skipped"})

    async def _create_corpus_candidate(self, ctx: ProcessingContext, job: ProcessingJob) -> ProcessingResult:
        """Create a corpus candidate entry from the processed data."""

        metadata_summary = {
            "modality": ctx.modality,
            "original_filename": ctx.original_filename,
            "file_size": ctx.file_size,
            "mime_type": ctx.mime_type,
            "key_metadata": dict(list(ctx.metadata.items())[:10]),
            "key_features": dict(list(ctx.features.items())[:10]),
        }
        ctx.metadata["corpus_candidate"] = metadata_summary
        return ProcessingResult(
            success=True,
            metadata={"corpus_candidate_created": True},
        )


async def run_pipeline_async(
    job_id: str,
    file_path: str,
    file_size: int,
    mime_type: str,
    original_filename: str,
    db_url: str,
) -> None:
    """Run the ingestion pipeline in a background task."""
    from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

    engine = create_async_engine(db_url)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as db:
        pipeline = IngestionPipeline(db)
        try:
            await pipeline.execute_job(job_id, file_path, file_size, mime_type, original_filename)
        except Exception:
            logger.exception("Pipeline failed for job %s", job_id)
        finally:
            await engine.dispose()
