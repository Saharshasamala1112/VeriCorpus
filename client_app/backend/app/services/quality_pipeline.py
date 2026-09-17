"""Quality Pipeline - Configurable quality assessment for corpus items.

Runs a configurable set of quality checks against corpus items and produces
a composite quality score. Each check is independent and can be enabled/disabled
per media type.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.all_models import MediaAsset
from app.models.corpus_intelligence import (
    CorpusItemExtended,
    CorpusQualityCheck,
    QualityCheckResult,
    QualityCheckType,
)

logger = logging.getLogger(__name__)

PIPELINE_VERSION = "1.0.0"

# Default check weights for quality score calculation
DEFAULT_CHECK_WEIGHTS: dict[str, float] = {
    QualityCheckType.CORRUPT_FILE.value: 1.0,
    QualityCheckType.UNSUPPORTED_FORMAT.value: 0.8,
    QualityCheckType.EMPTY_CONTENT.value: 1.0,
    QualityCheckType.DUPLICATE_CONTENT.value: 0.5,
    QualityCheckType.NEAR_DUPLICATE.value: 0.3,
    QualityCheckType.LOW_QUALITY_MEDIA.value: 0.6,
    QualityCheckType.INVALID_METADATA.value: 0.4,
    QualityCheckType.LANGUAGE_MISMATCH.value: 0.5,
    QualityCheckType.ANNOTATION_INCONSISTENCY.value: 0.3,
    QualityCheckType.SUSPICIOUS_INPUT.value: 0.7,
    QualityCheckType.FILE_TOO_LARGE.value: 0.4,
    QualityCheckType.FILE_TOO_SMALL.value: 0.3,
}


@dataclass
class CheckResult:
    """Result of a single quality check."""

    check_type: QualityCheckType
    result: QualityCheckResult
    score: float | None = None
    details: str | None = None


@dataclass
class QualityAssessment:
    """Aggregated quality assessment for a corpus item."""

    overall_score: float
    status: str
    checks: list[CheckResult] = field(default_factory=list)
    passed: int = 0
    failed: int = 0
    warned: int = 0
    skipped: int = 0


class QualityCheck(Protocol):
    """Protocol for quality check implementations."""

    @property
    def check_type(self) -> QualityCheckType: ...

    def is_applicable(self, item: CorpusItemExtended) -> bool: ...

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult: ...


class CorruptFileCheck:
    """Check for corrupt or unreadable files."""

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.CORRUPT_FILE

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return item.media_asset_id is not None

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        if item.media_asset_id is None:
            return CheckResult(check_type=self.check_type, result=QualityCheckResult.SKIP)

        result = await db.execute(select(MediaAsset).where(MediaAsset.id == item.media_asset_id))
        asset = result.scalar_one_or_none()
        if asset is None:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.FAIL,
                details="Referenced media asset not found",
            )

        if asset.status == "corrupt":
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.FAIL,
                details="File marked as corrupt by storage system",
            )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS)


class EmptyContentCheck:
    """Check for empty or zero-length content."""

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.EMPTY_CONTENT

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return True

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        if item.file_size_bytes is not None and item.file_size_bytes == 0:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.FAIL,
                details="File size is zero bytes",
            )
        if item.title and len(item.title.strip()) == 0 and item.description and len(item.description.strip()) == 0:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.WARN,
                details="Both title and description are empty",
            )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS)


class InvalidMetadataCheck:
    """Check for missing or invalid metadata fields."""

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.INVALID_METADATA

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return True

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        issues = []
        if not item.source or len(item.source.strip()) == 0:
            issues.append("missing source")
        if not item.language or len(item.language.strip()) == 0:
            issues.append("missing language")
        if not item.content_hash or len(item.content_hash.strip()) == 0:
            issues.append("missing content hash")
        if item.media_type not in ("text", "image", "audio", "video", "document"):
            issues.append(f"unknown media type: {item.media_type}")

        if issues:
            severity = QualityCheckResult.FAIL if len(issues) > 2 else QualityCheckResult.WARN
            return CheckResult(
                check_type=self.check_type,
                result=severity,
                details=f"Issues: {'; '.join(issues)}",
            )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS)


class LanguageMismatchCheck:
    """Check for language mismatch between declared and detected language."""

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.LANGUAGE_MISMATCH

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return item.media_type == "text"

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        if item.media_asset_id is None:
            return CheckResult(check_type=self.check_type, result=QualityCheckResult.SKIP)

        from app.models.all_models import MediaMetadata

        result = await db.execute(select(MediaMetadata).where(MediaMetadata.media_asset_id == item.media_asset_id))
        meta = result.scalar_one_or_none()

        if meta is None or meta.language_detected is None:
            return CheckResult(check_type=self.check_type, result=QualityCheckResult.SKIP)

        if meta.language_detected != item.language:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.WARN,
                details=f"Declared '{item.language}' but detected '{meta.language_detected}'",
                score=0.5,
            )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS, score=1.0)


class FileSizeTooLargeCheck:
    """Check for files exceeding maximum allowed size."""

    MAX_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.FILE_TOO_LARGE

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return item.file_size_bytes is not None

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        if item.file_size_bytes is None:
            return CheckResult(check_type=self.check_type, result=QualityCheckResult.SKIP)

        if item.file_size_bytes > self.MAX_SIZE_BYTES:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.WARN,
                details=f"File size {item.file_size_bytes} exceeds {self.MAX_SIZE_BYTES} bytes",
            )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS)


class FileSizeTooSmallCheck:
    """Check for files below minimum meaningful size."""

    MIN_SIZE_BYTES = 10

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.FILE_TOO_SMALL

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return item.file_size_bytes is not None

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        if item.file_size_bytes is None:
            return CheckResult(check_type=self.check_type, result=QualityCheckResult.SKIP)

        if item.file_size_bytes < self.MIN_SIZE_BYTES:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.WARN,
                details=f"File size {item.file_size_bytes} is below {self.MIN_SIZE_BYTES} bytes",
            )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS)


class UnsupportedFormatCheck:
    """Check for unsupported media formats."""

    SUPPORTED_MIME_PREFIXES: dict[str, list[str]] = {
        "text": ["text/"],
        "image": ["image/"],
        "audio": ["audio/", "sound/"],
        "video": ["video/"],
        "document": [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats",
            "application/vnd.ms-excel",
            "text/csv",
            "text/plain",
            "text/markdown",
        ],
    }

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.UNSUPPORTED_FORMAT

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return item.mime_type is not None

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        if item.mime_type is None:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.WARN,
                details="No MIME type available",
            )

        supported_prefixes = self.SUPPORTED_MIME_PREFIXES.get(item.media_type, [])
        for prefix in supported_prefixes:
            if item.mime_type.startswith(prefix):
                return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS)

        return CheckResult(
            check_type=self.check_type,
            result=QualityCheckResult.FAIL,
            details=f"MIME type '{item.mime_type}' not supported for media type '{item.media_type}'",
        )


class DuplicateContentCheck:
    """Check for exact content duplicates by hash comparison."""

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.DUPLICATE_CONTENT

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return item.content_hash is not None and len(item.content_hash) > 0

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        if not item.content_hash:
            return CheckResult(check_type=self.check_type, result=QualityCheckResult.SKIP)

        from app.models.corpus_intelligence import CorpusItemExtended as CorpusItemModel

        result = await db.execute(
            select(CorpusItemModel).where(
                CorpusItemModel.content_hash == item.content_hash,
                CorpusItemModel.id != item.id,
            )
        )
        existing = result.scalar_one_or_none()

        if existing is not None:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.WARN,
                details=f"Exact duplicate of item {existing.id[:8]}...",
                score=0.0,
            )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS, score=1.0)


class NearDuplicateCheck:
    """Check for near-duplicate content using embedding similarity.

    Uses the pluggable NearDuplicateDetector to find similar items.
    """

    DEFAULT_THRESHOLD = 0.85

    def __init__(self, threshold: float | None = None):
        self.threshold = threshold or self.DEFAULT_THRESHOLD

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.NEAR_DUPLICATE

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return item.media_type == "text" and item.description is not None and len(item.description) > 20

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        if item.description is None or len(item.description) < 20:
            return CheckResult(check_type=self.check_type, result=QualityCheckResult.SKIP)

        from app.models.corpus_intelligence import CorpusItemExtended as CorpusItemModel
        from app.services.duplicate_detection import HashBasedNearDuplicate

        detector = HashBasedNearDuplicate()
        fingerprint = await detector.compute_fingerprint(item.description, item.media_type)

        if not fingerprint:
            return CheckResult(check_type=self.check_type, result=QualityCheckResult.SKIP)

        # Fetch candidate items of the same media type with descriptions
        result = await db.execute(
            select(CorpusItemModel)
            .where(
                CorpusItemModel.media_type == item.media_type,
                CorpusItemModel.id != item.id,
                CorpusItemModel.description.isnot(None),
            )
            .limit(200)
        )
        candidates = list(result.scalars().all())

        for candidate in candidates:
            if candidate.description is None or len(candidate.description) < 20:
                continue
            cand_fp = await detector.compute_fingerprint(candidate.description, candidate.media_type)
            if not cand_fp:
                continue
            sim = await detector.similarity(fingerprint, cand_fp)
            if sim >= self.threshold:
                return CheckResult(
                    check_type=self.check_type,
                    result=QualityCheckResult.WARN,
                    details=f"Near-duplicate (sim={sim:.3f}) of item {candidate.id[:8]}...",
                    score=sim,
                )

        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS, score=1.0)


class LowQualityMediaCheck:
    """Check for low-quality media based on heuristic criteria.

    For text: checks text length and character diversity.
    For image/audio/video: checks file size relative to minimum thresholds.
    """

    MIN_TEXT_LENGTH = 50
    MIN_IMAGE_SIZE = 5 * 1024  # 5 KB
    MIN_AUDIO_SIZE = 10 * 1024  # 10 KB
    MIN_VIDEO_SIZE = 50 * 1024  # 50 KB

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.LOW_QUALITY_MEDIA

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return True

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        if item.media_type == "text":
            return self._check_text(item)
        if item.media_type == "image":
            return self._check_min_size(item, self.MIN_IMAGE_SIZE, "image")
        if item.media_type == "audio":
            return self._check_min_size(item, self.MIN_AUDIO_SIZE, "audio")
        if item.media_type == "video":
            return self._check_min_size(item, self.MIN_VIDEO_SIZE, "video")
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.SKIP)

    def _check_text(self, item: CorpusItemExtended) -> CheckResult:
        text = item.description or item.title or ""
        if len(text) < self.MIN_TEXT_LENGTH:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.WARN,
                details=f"Text length {len(text)} is below minimum {self.MIN_TEXT_LENGTH}",
                score=0.3,
            )
        if len(text) > 0:
            unique_chars = len(set(text.lower()))
            diversity = unique_chars / len(text)
            if diversity < 0.05:
                return CheckResult(
                    check_type=self.check_type,
                    result=QualityCheckResult.WARN,
                    details=f"Very low character diversity: {diversity:.3f}",
                    score=0.2,
                )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS, score=1.0)

    def _check_min_size(self, item: CorpusItemExtended, min_size: int, media_type: str) -> CheckResult:
        if item.file_size_bytes is None:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.WARN,
                details=f"No file size for {media_type}",
            )
        if item.file_size_bytes < min_size:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.WARN,
                details=f"{media_type.title()} file size {item.file_size_bytes} below minimum {min_size}",
                score=0.4,
            )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS, score=1.0)


class AnnotationInconsistencyCheck:
    """Check for inconsistencies between annotation fields.

    Detects cases where:
    - annotation_status is 'annotated' but label is missing
    - label_confidence is high but annotation_status is 'unannotated'
    - annotation_status is invalid
    """

    VALID_ANNOTATION_STATUSES = {"unannotated", "annotated", "partial", "disputed", "verified"}

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.ANNOTATION_INCONSISTENCY

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return True

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        issues = []

        if item.annotation_status not in self.VALID_ANNOTATION_STATUSES:
            issues.append(f"Invalid annotation_status: '{item.annotation_status}'")

        if item.annotation_status == "annotated" and not item.label:
            issues.append("annotation_status is 'annotated' but label is missing")

        if item.label and item.annotation_status == "unannotated":
            issues.append(f"Label '{item.label}' set but annotation_status is 'unannotated'")

        if (
            item.label_confidence is not None
            and item.label_confidence > 0.9
            and item.annotation_status == "unannotated"
        ):
            issues.append(f"High label_confidence ({item.label_confidence}) but annotation_status is 'unannotated'")

        if item.label and item.label_confidence is not None and item.label_confidence < 0.3:
            issues.append(f"Low label_confidence ({item.label_confidence}) for label '{item.label}'")

        if issues:
            severity = QualityCheckResult.FAIL if len(issues) > 1 else QualityCheckResult.WARN
            return CheckResult(
                check_type=self.check_type,
                result=severity,
                details=f"Annotation issues: {'; '.join(issues)}",
            )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS)


class SuspiciousInputCheck:
    """Check for suspicious content patterns."""

    @property
    def check_type(self) -> QualityCheckType:
        return QualityCheckType.SUSPICIOUS_INPUT

    def is_applicable(self, item: CorpusItemExtended) -> bool:
        return item.media_type == "text"

    async def run(self, item: CorpusItemExtended, db: AsyncSession) -> CheckResult:
        if item.description is None or len(item.description) == 0:
            return CheckResult(check_type=self.check_type, result=QualityCheckResult.SKIP)

        text = item.description
        issues = []

        if len(text) > 100000:
            issues.append("extremely long text")
        if text.count("\x00") > 0:
            issues.append("contains null bytes")
        if len(set(text)) < 3 and len(text) > 10:
            issues.append("very low character diversity")

        if issues:
            return CheckResult(
                check_type=self.check_type,
                result=QualityCheckResult.WARN,
                details=f"Suspicious patterns: {'; '.join(issues)}",
            )
        return CheckResult(check_type=self.check_type, result=QualityCheckResult.PASS)


# ---------------------------------------------------------------------------
# Quality Pipeline
# ---------------------------------------------------------------------------

ALL_CHECKS: list[QualityCheck] = [
    CorruptFileCheck(),
    EmptyContentCheck(),
    InvalidMetadataCheck(),
    LanguageMismatchCheck(),
    FileSizeTooLargeCheck(),
    FileSizeTooSmallCheck(),
    UnsupportedFormatCheck(),
    DuplicateContentCheck(),
    NearDuplicateCheck(),
    LowQualityMediaCheck(),
    AnnotationInconsistencyCheck(),
    SuspiciousInputCheck(),
]


class QualityPipeline:
    """Configurable quality assessment pipeline.

    Runs all applicable quality checks against a corpus item, computes a
    composite quality score, and persists individual check results.
    """

    def __init__(
        self,
        checks: list[QualityCheck] | None = None,
        weights: dict[str, float] | None = None,
    ):
        self.checks = checks or ALL_CHECKS
        self.weights = weights or DEFAULT_CHECK_WEIGHTS

    async def assess(self, item: CorpusItemExtended, db: AsyncSession) -> QualityAssessment:
        """Run all applicable checks and produce a quality assessment."""
        results: list[CheckResult] = []

        for check in self.checks:
            if check.is_applicable(item):
                try:
                    result = await check.run(item, db)
                    results.append(result)
                except Exception:
                    logger.exception("Quality check %s failed with exception", check.check_type.value)
                    results.append(
                        CheckResult(
                            check_type=check.check_type,
                            result=QualityCheckResult.FAIL,
                            details="Check raised an exception",
                        )
                    )
            else:
                results.append(CheckResult(check_type=check.check_type, result=QualityCheckResult.SKIP))

        return self._compute_assessment(results)

    def _compute_assessment(self, results: list[CheckResult]) -> QualityAssessment:
        """Compute composite quality score from individual check results."""
        passed = sum(1 for r in results if r.result == QualityCheckResult.PASS)
        failed = sum(1 for r in results if r.result == QualityCheckResult.FAIL)
        warned = sum(1 for r in results if r.result == QualityCheckResult.WARN)
        skipped = sum(1 for r in results if r.result == QualityCheckResult.SKIP)

        applicable = passed + failed + warned
        if applicable == 0:
            overall_score = 1.0
        else:
            weighted_sum = 0.0
            weight_total = 0.0
            for r in results:
                if r.result == QualityCheckResult.SKIP:
                    continue
                weight = self.weights.get(r.check_type.value, 0.5)
                weight_total += weight
                if r.result == QualityCheckResult.PASS:
                    weighted_sum += weight
                elif r.result == QualityCheckResult.WARN:
                    weighted_sum += weight * 0.5
                # FAIL contributes 0

            overall_score = weighted_sum / weight_total if weight_total > 0 else 1.0

        if failed > 0:
            status = "failed"
        elif warned > 0:
            status = "warning"
        else:
            status = "passed"

        return QualityAssessment(
            overall_score=round(overall_score, 4),
            status=status,
            checks=results,
            passed=passed,
            failed=failed,
            warned=warned,
            skipped=skipped,
        )

    async def persist_results(self, item: CorpusItemExtended, assessment: QualityAssessment, db: AsyncSession) -> None:
        """Persist quality check results to the database."""
        for check_result in assessment.checks:
            if check_result.result == QualityCheckResult.SKIP:
                continue
            db_check = CorpusQualityCheck(
                corpus_item_id=item.id,
                check_type=check_result.check_type.value,
                result=check_result.result.value,
                score=check_result.score,
                details=check_result.details,
                pipeline_version=PIPELINE_VERSION,
            )
            db.add(db_check)

        item.quality_score = assessment.overall_score
        item.quality_status = assessment.status

        await db.flush()
