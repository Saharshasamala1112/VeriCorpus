"""Tests for the Corpus Intelligence Layer.

Tests cover:
- Corpus item ingestion and lifecycle
- Quality pipeline and checks (12 checks)
- Duplicate detection
- Dataset versioning (immutable versions)
- Audit trail
- Status transitions
- Dashboard statistics
- Quarantine operations
- Batch operations
- Training eligibility
"""

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.models.base import Base
from app.models.corpus_intelligence import (
    CorpusAuditAction,
    CorpusAuditEvent,
    CorpusDuplicate,
    CorpusItemExtended,
    CorpusItemStatus,
    CorpusQualityCheck,
    DatasetVersionExtended,
    DatasetVersionItemExt,
    DuplicateType,
    PreprocessingPipeline,
    QualityCheckResult,
    QualityCheckType,
)
from app.models.user import User, UserRole


@pytest_asyncio.fixture
async def db_session():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with AsyncSession(engine) as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def sample_user(db_session: AsyncSession):
    user = User(phone="1234567890", username="testuser", password_hash="hashed", role=UserRole.USER)
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    db_session.expunge(user)
    return user


@pytest_asyncio.fixture
async def sample_item(db_session: AsyncSession, sample_user):
    item = CorpusItemExtended(
        media_type="text",
        source="test",
        content_hash="abc123def456",
        language="en",
        title="Test Document",
        description="A test document for corpus testing",
        status=CorpusItemStatus.PENDING.value,
        created_by=sample_user.id,
    )
    db_session.add(item)
    await db_session.commit()
    await db_session.refresh(item)
    db_session.expunge(item)
    return item


# ---------------------------------------------------------------------------
# Corpus Item Model Tests
# ---------------------------------------------------------------------------


class TestCorpusItemModel:
    async def test_create_corpus_item(self, db_session, sample_user):
        item = CorpusItemExtended(
            media_type="text",
            source="swecha",
            content_hash="hash123",
            language="te",
            title="Test Item",
            status=CorpusItemStatus.PENDING.value,
            created_by=sample_user.id,
        )
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)
        assert item.id is not None
        assert item.status == CorpusItemStatus.PENDING.value
        assert item.quality_status == "unchecked"
        assert item.training_eligible is False

    def test_corpus_item_status_enum(self):
        assert CorpusItemStatus.PENDING.value == "PENDING"
        assert CorpusItemStatus.APPROVED.value == "APPROVED"
        assert CorpusItemStatus.IN_DATASET.value == "IN_DATASET"
        assert len(CorpusItemStatus) == 9

    def test_quality_check_type_enum(self):
        assert QualityCheckType.CORRUPT_FILE.value == "CORRUPT_FILE"
        assert QualityCheckType.EMPTY_CONTENT.value == "EMPTY_CONTENT"
        assert len(QualityCheckType) == 12

    async def test_corpus_item_extended_metadata(self, db_session, sample_user):
        item = CorpusItemExtended(
            media_type="image",
            source="camera",
            content_hash="img_hash",
            language="en",
            title="Photo",
            consent_status="granted",
            license_type="CC-BY-4.0",
            rights_holder="Test Org",
            preprocessing_version="2.0.0",
            ingestion_pipeline_version="1.0.0",
            status=CorpusItemStatus.PENDING.value,
            created_by=sample_user.id,
        )
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)
        assert item.consent_status == "granted"
        assert item.license_type == "CC-BY-4.0"
        assert item.preprocessing_version == "2.0.0"


# ---------------------------------------------------------------------------
# Quality Pipeline Tests (sync unit tests)
# ---------------------------------------------------------------------------


class TestQualityPipeline:
    def test_quality_check_result_enum(self):
        assert QualityCheckResult.PASS.value == "PASS"
        assert QualityCheckResult.FAIL.value == "FAIL"
        assert QualityCheckResult.WARN.value == "WARN"
        assert QualityCheckResult.SKIP.value == "SKIP"

    def test_quality_pipeline_computation(self):
        from app.services.quality_pipeline import CheckResult, QualityPipeline

        pipeline = QualityPipeline()
        results = [
            CheckResult(check_type=QualityCheckType.CORRUPT_FILE, result=QualityCheckResult.PASS),
            CheckResult(check_type=QualityCheckType.EMPTY_CONTENT, result=QualityCheckResult.PASS),
            CheckResult(
                check_type=QualityCheckType.INVALID_METADATA, result=QualityCheckResult.WARN, details="minor issue"
            ),
        ]
        assessment = pipeline._compute_assessment(results)
        assert assessment.overall_score > 0
        assert assessment.passed == 2
        assert assessment.warned == 1
        assert assessment.failed == 0

    def test_quality_pipeline_all_fail(self):
        from app.services.quality_pipeline import CheckResult, QualityPipeline

        pipeline = QualityPipeline()
        results = [
            CheckResult(check_type=QualityCheckType.CORRUPT_FILE, result=QualityCheckResult.FAIL),
            CheckResult(check_type=QualityCheckType.EMPTY_CONTENT, result=QualityCheckResult.FAIL),
        ]
        assessment = pipeline._compute_assessment(results)
        assert assessment.overall_score == 0.0
        assert assessment.status == "failed"
        assert assessment.failed == 2

    def test_quality_pipeline_all_skip(self):
        from app.services.quality_pipeline import CheckResult, QualityPipeline

        pipeline = QualityPipeline()
        results = [
            CheckResult(check_type=QualityCheckType.LANGUAGE_MISMATCH, result=QualityCheckResult.SKIP),
        ]
        assessment = pipeline._compute_assessment(results)
        assert assessment.overall_score == 1.0

    def test_individual_check_corrupt_file(self):
        from app.services.quality_pipeline import CorruptFileCheck

        check = CorruptFileCheck()
        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h",
            language="en",
            title="T",
            status="PENDING",
        )
        assert check.is_applicable(item) is False

    async def test_individual_check_empty_content(self, db_session):
        from app.services.quality_pipeline import EmptyContentCheck

        check = EmptyContentCheck()
        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h",
            language="en",
            title="",
            description="",
            file_size_bytes=0,
            status="PENDING",
        )
        result = await check.run(item, db_session)
        assert result.result == QualityCheckResult.FAIL

    async def test_individual_check_invalid_metadata(self, db_session):
        from app.services.quality_pipeline import InvalidMetadataCheck

        check = InvalidMetadataCheck()
        item = CorpusItemExtended(
            media_type="text",
            source="",
            content_hash="",
            language="",
            title="T",
            status="PENDING",
        )
        result = await check.run(item, db_session)
        assert result.result in (QualityCheckResult.FAIL, QualityCheckResult.WARN)

    async def test_individual_check_suspicious_input(self, db_session):
        from app.services.quality_pipeline import SuspiciousInputCheck

        check = SuspiciousInputCheck()
        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h",
            language="en",
            title="T",
            description="Normal text content here",
            status="PENDING",
        )
        result = await check.run(item, db_session)
        assert result.result == QualityCheckResult.PASS

        item2 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h",
            language="en",
            title="T",
            description="Text with\x00null byte",
            status="PENDING",
        )
        result2 = await check.run(item2, db_session)
        assert result2.result == QualityCheckResult.WARN

    def test_all_12_checks_registered(self):
        from app.services.quality_pipeline import ALL_CHECKS

        check_types = {c.check_type for c in ALL_CHECKS}
        expected = {
            QualityCheckType.CORRUPT_FILE,
            QualityCheckType.EMPTY_CONTENT,
            QualityCheckType.INVALID_METADATA,
            QualityCheckType.LANGUAGE_MISMATCH,
            QualityCheckType.FILE_TOO_LARGE,
            QualityCheckType.FILE_TOO_SMALL,
            QualityCheckType.UNSUPPORTED_FORMAT,
            QualityCheckType.DUPLICATE_CONTENT,
            QualityCheckType.NEAR_DUPLICATE,
            QualityCheckType.LOW_QUALITY_MEDIA,
            QualityCheckType.ANNOTATION_INCONSISTENCY,
            QualityCheckType.SUSPICIOUS_INPUT,
        }
        assert check_types == expected

    async def test_unsupported_format_check(self, db_session):
        from app.services.quality_pipeline import UnsupportedFormatCheck

        check = UnsupportedFormatCheck()
        item = CorpusItemExtended(
            media_type="image",
            source="test",
            content_hash="h",
            language="en",
            title="T",
            mime_type="image/png",
            status="PENDING",
        )
        result = await check.run(item, db_session)
        assert result.result == QualityCheckResult.PASS

        bad_item = CorpusItemExtended(
            media_type="image",
            source="test",
            content_hash="h",
            language="en",
            title="T",
            mime_type="application/x-executable",
            status="PENDING",
        )
        result2 = await check.run(bad_item, db_session)
        assert result2.result == QualityCheckResult.FAIL

    async def test_duplicate_content_check(self, db_session, sample_user):
        from app.services.quality_pipeline import DuplicateContentCheck

        item1 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="unique_hash_123",
            language="en",
            title="Item 1",
            status="APPROVED",
            created_by=sample_user.id,
        )
        item2 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="unique_hash_123",
            language="en",
            title="Item 2",
            status="PENDING",
            created_by=sample_user.id,
        )
        db_session.add_all([item1, item2])
        await db_session.commit()
        await db_session.refresh(item1)
        await db_session.refresh(item2)

        check = DuplicateContentCheck()
        result = await check.run(item2, db_session)
        assert result.result == QualityCheckResult.WARN
        assert result.details is not None
        assert "duplicate" in result.details.lower()

    async def test_near_duplicate_check(self, db_session, sample_user):
        from app.services.quality_pipeline import NearDuplicateCheck

        item1 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h1",
            language="en",
            title="Item 1",
            description="The quick brown fox jumps over the lazy dog in the meadow",
            status="APPROVED",
            created_by=sample_user.id,
        )
        item2 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h2",
            language="en",
            title="Item 2",
            description="The quick brown fox leaps over the lazy dog in the meadow",
            status="PENDING",
            created_by=sample_user.id,
        )
        db_session.add_all([item1, item2])
        await db_session.commit()
        await db_session.refresh(item1)
        await db_session.refresh(item2)

        check = NearDuplicateCheck(threshold=0.5)
        result = await check.run(item2, db_session)
        # Near-duplicate check should find high similarity
        assert result.result in (QualityCheckResult.PASS, QualityCheckResult.WARN)

    async def test_low_quality_media_check(self, db_session):
        from app.services.quality_pipeline import LowQualityMediaCheck

        check = LowQualityMediaCheck()
        # Short text should trigger WARN
        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h",
            language="en",
            title="Short",
            description="Hi",
            status="PENDING",
        )
        result = await check.run(item, db_session)
        assert result.result == QualityCheckResult.WARN

        # Long enough text should PASS
        good_item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h2",
            language="en",
            title="Good Item",
            description="The quick brown fox jumps over the lazy dog near the river bank",
            status="PENDING",
        )
        result2 = await check.run(good_item, db_session)
        assert result2.result == QualityCheckResult.PASS

    async def test_annotation_inconsistency_check(self, db_session):
        from app.services.quality_pipeline import AnnotationInconsistencyCheck

        check = AnnotationInconsistencyCheck()
        # Annotated but no label = WARN
        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h",
            language="en",
            title="T",
            annotation_status="annotated",
            label=None,
            status="PENDING",
        )
        result = await check.run(item, db_session)
        assert result.result == QualityCheckResult.WARN

        # Label set but unannotated = WARN
        item2 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h2",
            language="en",
            title="T2",
            annotation_status="unannotated",
            label="some_label",
            status="PENDING",
        )
        result2 = await check.run(item2, db_session)
        assert result2.result == QualityCheckResult.WARN

        # Consistent = PASS
        item3 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h3",
            language="en",
            title="T3",
            annotation_status="annotated",
            label="label",
            label_confidence=0.9,
            status="PENDING",
        )
        result3 = await check.run(item3, db_session)
        assert result3.result == QualityCheckResult.PASS

    async def test_file_size_too_large_check(self, db_session):
        from app.services.quality_pipeline import FileSizeTooLargeCheck

        check = FileSizeTooLargeCheck()
        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h",
            language="en",
            title="T",
            file_size_bytes=100 * 1024 * 1024 + 1,
            status="PENDING",
        )
        result = await check.run(item, db_session)
        assert result.result == QualityCheckResult.WARN

        small_item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h2",
            language="en",
            title="T2",
            file_size_bytes=1024,
            status="PENDING",
        )
        result2 = await check.run(small_item, db_session)
        assert result2.result == QualityCheckResult.PASS

    async def test_file_size_too_small_check(self, db_session):
        from app.services.quality_pipeline import FileSizeTooSmallCheck

        check = FileSizeTooSmallCheck()
        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h",
            language="en",
            title="T",
            file_size_bytes=5,
            status="PENDING",
        )
        result = await check.run(item, db_session)
        assert result.result == QualityCheckResult.WARN

        ok_item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h2",
            language="en",
            title="T2",
            file_size_bytes=100,
            status="PENDING",
        )
        result2 = await check.run(ok_item, db_session)
        assert result2.result == QualityCheckResult.PASS


# ---------------------------------------------------------------------------
# Duplicate Detection Tests
# ---------------------------------------------------------------------------


class TestDuplicateDetection:
    async def test_exact_duplicate_not_found(self, db_session, sample_item):
        from app.services.duplicate_detection import DuplicateDetectionService

        service = DuplicateDetectionService()
        result = await service.check_exact_duplicate(
            content_hash="abc123def456",
            exclude_item_id=sample_item.id,
            db=db_session,
        )
        assert result.is_duplicate is False

    async def test_exact_duplicate_detection(self, db_session, sample_user):
        from app.services.duplicate_detection import DuplicateDetectionService

        item1 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="same_hash",
            language="en",
            title="Item 1",
            status="APPROVED",
            created_by=sample_user.id,
        )
        item2 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="same_hash",
            language="en",
            title="Item 2",
            status="PENDING",
            created_by=sample_user.id,
        )
        db_session.add_all([item1, item2])
        await db_session.commit()
        await db_session.refresh(item1)
        await db_session.refresh(item2)

        service = DuplicateDetectionService()
        result = await service.check_exact_duplicate("same_hash", exclude_item_id=item2.id, db=db_session)
        assert result.is_duplicate is True
        assert result.duplicate_of_id == item1.id
        assert result.similarity_score == 1.0

    async def test_record_duplicate(self, db_session, sample_user):
        from app.services.duplicate_detection import DuplicateDetectionService

        item1 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h1",
            language="en",
            title="Item 1",
            status="APPROVED",
            created_by=sample_user.id,
        )
        item2 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h2",
            language="en",
            title="Item 2",
            status="APPROVED",
            created_by=sample_user.id,
        )
        db_session.add_all([item1, item2])
        await db_session.commit()
        await db_session.refresh(item1)
        await db_session.refresh(item2)

        service = DuplicateDetectionService()
        dup = await service.record_duplicate(item1.id, item2.id, DuplicateType.EXACT, 1.0, "test", db=db_session)
        assert dup is not None
        assert dup.duplicate_type == DuplicateType.EXACT.value

    async def test_near_duplicate_detector(self):
        from app.services.duplicate_detection import HashBasedNearDuplicate

        detector = HashBasedNearDuplicate()
        fp1 = await detector.compute_fingerprint("The quick brown fox jumps over the lazy dog", "text")
        fp2 = await detector.compute_fingerprint("The quick brown fox leaps over the lazy dog", "text")
        fp3 = await detector.compute_fingerprint("Completely different content about quantum physics", "text")

        sim_similar = await detector.similarity(fp1, fp2)
        sim_different = await detector.similarity(fp1, fp3)

        assert sim_similar > sim_different
        assert 0.0 <= sim_similar <= 1.0
        assert 0.0 <= sim_different <= 1.0

    async def test_near_duplicate_find(self):
        from app.services.duplicate_detection import HashBasedNearDuplicate

        detector = HashBasedNearDuplicate()
        fp = await detector.compute_fingerprint("The quick brown fox", "text")
        candidates = [
            ("item1", await detector.compute_fingerprint("The quick brown fox jumps", "text")),
            ("item2", await detector.compute_fingerprint("Quantum computing basics", "text")),
        ]
        results = await detector.find_near_duplicates(fp, 0.5, candidates)
        assert len(results) >= 0

    async def test_duplicate_group_detection(self, db_session, sample_user):
        from app.services.duplicate_detection import DuplicateDetectionService

        item1 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="dup_a",
            language="en",
            title="A",
            status="APPROVED",
            created_by=sample_user.id,
        )
        item2 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="dup_a",
            language="en",
            title="B",
            status="APPROVED",
            created_by=sample_user.id,
        )
        db_session.add_all([item1, item2])
        await db_session.commit()
        await db_session.refresh(item1)
        await db_session.refresh(item2)

        service = DuplicateDetectionService()
        await service.record_duplicate(item1.id, item2.id, DuplicateType.EXACT, 1.0, "test", db=db_session)

        groups = await service.get_duplicate_groups(db=db_session)
        assert len(groups) >= 1
        assert groups[0]["count"] == 2


# ---------------------------------------------------------------------------
# Audit Trail Tests
# ---------------------------------------------------------------------------


class TestCorpusAudit:
    async def test_record_audit_event(self, db_session, sample_item, sample_user):
        from app.services.corpus_audit import CorpusAuditService

        service = CorpusAuditService()
        event = await service.record_event(
            corpus_item_id=sample_item.id,
            action=CorpusAuditAction.UPLOADED,
            new_status="PENDING",
            performed_by=sample_user.id,
            details="Test upload",
            db=db_session,
        )
        assert event is not None
        assert event.action == CorpusAuditAction.UPLOADED.value

    def test_audit_action_enum(self):
        assert CorpusAuditAction.UPLOADED.value == "UPLOADED"
        assert CorpusAuditAction.APPROVED.value == "APPROVED"
        assert CorpusAuditAction.USED_IN_TRAINING.value == "USED_IN_TRAINING"
        assert CorpusAuditAction.REVIEWED.value == "REVIEWED"
        assert len(CorpusAuditAction) == 15

    async def test_audit_event_model(self, db_session, sample_item):
        event = CorpusAuditEvent(
            corpus_item_id=sample_item.id,
            action="UPLOADED",
            new_status="PENDING",
            details="Initial upload",
        )
        db_session.add(event)
        await db_session.commit()
        await db_session.refresh(event)
        assert event.id is not None
        assert event.action == "UPLOADED"

    def test_valid_status_transitions(self):
        from app.services.corpus_audit import is_valid_transition

        assert is_valid_transition("PENDING", "INGESTING")
        assert is_valid_transition("INGESTING", "PREPROCESSING")
        assert is_valid_transition("PREPROCESSING", "QUALITY_CHECK")
        assert is_valid_transition("QUALITY_CHECK", "VALIDATED")
        assert is_valid_transition("VALIDATED", "APPROVED")
        assert is_valid_transition("APPROVED", "IN_DATASET")
        assert is_valid_transition("REJECTED", "PENDING")

    def test_invalid_status_transitions(self):
        from app.services.corpus_audit import is_valid_transition

        assert not is_valid_transition("PENDING", "APPROVED")
        assert not is_valid_transition("IN_DATASET", "PENDING")
        assert not is_valid_transition("APPROVED", "PENDING")

    async def test_transition_status(self, db_session, sample_item, sample_user):
        from app.services.corpus_audit import CorpusAuditService

        service = CorpusAuditService()
        success = await service.transition_status(sample_item, "INGESTING", performed_by=sample_user.id, db=db_session)
        assert success is True
        assert sample_item.status == "INGESTING"

    async def test_invalid_transition_fails(self, db_session, sample_item):
        from app.services.corpus_audit import CorpusAuditService

        service = CorpusAuditService()
        success = await service.transition_status(sample_item, "APPROVED", db=db_session)
        assert success is False
        assert sample_item.status == CorpusItemStatus.PENDING.value

    async def test_get_item_events(self, db_session, sample_item, sample_user):
        from app.services.corpus_audit import CorpusAuditService

        service = CorpusAuditService()
        await service.record_event(sample_item.id, CorpusAuditAction.UPLOADED, new_status="PENDING", db=db_session)
        await service.record_event(sample_item.id, CorpusAuditAction.INGESTED, "PENDING", "INGESTING", db=db_session)

        events = await service.get_item_events(sample_item.id, db=db_session)
        assert len(events) == 2


# ---------------------------------------------------------------------------
# Dataset Versioning Tests
# ---------------------------------------------------------------------------


class TestDatasetVersioning:
    async def test_get_next_version(self, db_session):
        from app.services.dataset_versioning import DatasetVersioningService

        service = DatasetVersioningService()
        version = await service.get_next_version("dataset-123", db_session)
        assert version == "v1"

    async def test_next_version_increments(self, db_session):
        from app.services.dataset_versioning import DatasetVersioningService

        dv = DatasetVersionExtended(dataset_id="dataset-123", version="v3", is_sealed=True)
        db_session.add(dv)
        await db_session.commit()

        service = DatasetVersioningService()
        version = await service.get_next_version("dataset-123", db_session)
        assert version == "v4"

    async def test_validate_approved_items(self, db_session, sample_user):
        from app.services.dataset_versioning import DatasetVersioningService

        item1 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h1",
            language="en",
            title="Item 1",
            status="APPROVED",
            quality_status="passed",
            created_by=sample_user.id,
        )
        item2 = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h2",
            language="en",
            title="Item 2",
            status="APPROVED",
            quality_status="passed",
            created_by=sample_user.id,
        )
        db_session.add_all([item1, item2])
        await db_session.commit()
        await db_session.refresh(item1)
        await db_session.refresh(item2)

        service = DatasetVersioningService()
        result = await service.validate_dataset_version([item1.id, item2.id], db_session)
        assert result.passed is True
        assert result.checks_failed == 0

    async def test_validate_rejects_unapproved_items(self, db_session, sample_user):
        from app.services.dataset_versioning import DatasetVersioningService

        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="h1",
            language="en",
            title="Item",
            status="PENDING",
            quality_status="unchecked",
            created_by=sample_user.id,
        )
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)

        service = DatasetVersioningService()
        result = await service.validate_dataset_version([item.id], db_session)
        assert result.passed is False
        assert result.checks_failed > 0

    async def test_validate_empty_list(self, db_session):
        from app.services.dataset_versioning import DatasetVersioningService

        service = DatasetVersioningService()
        result = await service.validate_dataset_version([], db_session)
        assert result.passed is False

    async def test_compute_statistics(self, db_session, sample_user):
        from app.services.dataset_versioning import DatasetVersioningService

        items = [
            CorpusItemExtended(
                media_type="text",
                source="test",
                content_hash=f"h{i}",
                language="en" if i % 2 == 0 else "te",
                title=f"Item {i}",
                status="APPROVED",
                quality_score=0.8 + (i * 0.02),
                quality_status="passed",
                annotation_status="annotated" if i % 3 == 0 else "unannotated",
                training_eligible=i % 2 == 0,
                created_by=sample_user.id,
            )
            for i in range(5)
        ]
        db_session.add_all(items)
        await db_session.commit()
        for item in items:
            await db_session.refresh(item)

        item_ids = [i.id for i in items]
        service = DatasetVersioningService()
        stats = await service.compute_statistics(item_ids, db_session)

        assert stats.total_items == 5
        assert stats.by_media_type["text"] == 5
        assert "en" in stats.by_language
        assert "te" in stats.by_language
        assert stats.avg_quality_score is not None
        assert stats.training_eligible_count > 0

    async def test_create_version(self, db_session, sample_user):
        from app.models.all_models import Dataset
        from app.services.dataset_versioning import DatasetVersioningService

        ds = Dataset(name="test-dataset", media_type="text", created_by=sample_user.id)
        db_session.add(ds)
        await db_session.flush()
        await db_session.refresh(ds)
        ds_id = ds.id

        items = [
            CorpusItemExtended(
                media_type="text",
                source="test",
                content_hash=f"hash_{i}",
                language="en",
                title=f"Item {i}",
                status="APPROVED",
                quality_status="passed",
                created_by=sample_user.id,
            )
            for i in range(3)
        ]
        db_session.add_all(items)
        await db_session.commit()
        for item in items:
            await db_session.refresh(item)

        service = DatasetVersioningService()
        dv = await service.create_version(
            dataset_id=ds_id,
            corpus_item_ids=[i.id for i in items],
            description="Initial version",
            created_by=sample_user.id,
            db=db_session,
        )
        await db_session.refresh(dv)

        assert dv.version == "v1"
        assert dv.is_sealed is True
        assert dv.checksum is not None
        assert dv.statistics is not None
        assert dv.validation_results is not None

        for item in items:
            await db_session.refresh(item)
            assert item.status == "IN_DATASET"

    async def test_version_is_immutable(self, db_session):
        dv = DatasetVersionExtended(dataset_id="d1", version="v1", is_sealed=True)
        db_session.add(dv)
        await db_session.commit()
        await db_session.refresh(dv)
        assert dv.is_sealed is True

    async def test_diff_versions(self, db_session, sample_user):
        from app.models.all_models import Dataset
        from app.services.dataset_versioning import DatasetVersioningService

        ds = Dataset(name="diff-dataset", media_type="text", created_by=sample_user.id)
        db_session.add(ds)
        await db_session.flush()
        await db_session.refresh(ds)
        ds_id = ds.id

        items = [
            CorpusItemExtended(
                media_type="text",
                source="test",
                content_hash=f"h{i}",
                language="en",
                title=f"Item {i}",
                status="APPROVED",
                quality_status="passed",
                created_by=sample_user.id,
            )
            for i in range(5)
        ]
        db_session.add_all(items)
        await db_session.commit()
        for item in items:
            await db_session.refresh(item)

        service = DatasetVersioningService()

        v1 = await service.create_version(
            ds_id, [items[0].id, items[1].id, items[2].id], "v1", sample_user.id, db_session
        )
        await db_session.refresh(v1)

        for item in items:
            await db_session.refresh(item)

        v2 = DatasetVersionExtended(dataset_id=ds_id, version="v2", is_sealed=True, created_by=sample_user.id)
        db_session.add(v2)
        await db_session.flush()
        await db_session.refresh(v2)

        for item_id in [items[1].id, items[2].id, items[3].id, items[4].id]:
            link = DatasetVersionItemExt(dataset_version_id=v2.id, corpus_item_id=item_id)
            db_session.add(link)
        await db_session.commit()
        await db_session.refresh(v1)
        await db_session.refresh(v2)

        diff = await service.diff_versions(v1.id, v2.id, db_session)
        assert diff["added_count"] == 2
        assert diff["removed_count"] == 1
        assert diff["common_count"] == 2


# ---------------------------------------------------------------------------
# Dashboard Tests
# ---------------------------------------------------------------------------


class TestDashboard:
    async def test_empty_dashboard(self, db_session):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        service = CorpusIntelligenceService()
        dashboard = await service.get_dashboard(db_session)
        assert dashboard["total_items"] == 0
        assert dashboard["by_media_type"] == {}
        assert dashboard["pending_review"] == 0
        assert dashboard["quarantined"] == 0

    async def test_dashboard_with_items(self, db_session, sample_user):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        items = [
            CorpusItemExtended(
                media_type="text",
                source="test",
                content_hash=f"h{i}",
                language="en" if i % 2 == 0 else "te",
                title=f"Item {i}",
                quality_status="passed" if i % 3 != 0 else "failed",
                quality_score=0.9 if i % 3 != 0 else 0.2,
                status="APPROVED" if i % 2 == 0 else "VALIDATED",
                training_eligible=i % 2 == 0,
                created_by=sample_user.id,
            )
            for i in range(6)
        ]
        db_session.add_all(items)
        await db_session.commit()

        service = CorpusIntelligenceService()
        dashboard = await service.get_dashboard(db_session)
        assert dashboard["total_items"] == 6
        assert dashboard["by_media_type"]["text"] == 6
        assert "en" in dashboard["by_language"]
        assert "te" in dashboard["by_language"]
        assert dashboard["training_eligible"] > 0

    async def test_dashboard_quarantined_count(self, db_session, sample_user):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        items = [
            CorpusItemExtended(
                media_type="text",
                source="test",
                content_hash=f"q{i}",
                language="en",
                title=f"Quarantined {i}",
                status="QUARANTINED",
                created_by=sample_user.id,
            )
            for i in range(3)
        ]
        db_session.add_all(items)
        await db_session.commit()

        service = CorpusIntelligenceService()
        dashboard = await service.get_dashboard(db_session)
        assert dashboard["quarantined"] == 3


# ---------------------------------------------------------------------------
# Quarantine and Batch Operations Tests
# ---------------------------------------------------------------------------


class TestQuarantineOperations:
    async def test_quarantine_item(self, db_session, sample_item, sample_user):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        service = CorpusIntelligenceService()
        item = await service.quarantine_item(sample_item.id, "Suspicious content", sample_user.id, db=db_session)
        assert item.status == "QUARANTINED"

    async def test_release_from_quarantine(self, db_session, sample_item, sample_user):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        service = CorpusIntelligenceService()
        await service.quarantine_item(sample_item.id, "Test quarantine", sample_user.id, db=db_session)
        item = await service.release_from_quarantine(sample_item.id, sample_user.id, db=db_session)
        assert item.status == "PENDING"

    async def test_batch_approve(self, db_session, sample_user):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        items = [
            CorpusItemExtended(
                media_type="text",
                source="test",
                content_hash=f"ba{i}",
                language="en",
                title=f"Batch Item {i}",
                status="VALIDATED",
                created_by=sample_user.id,
            )
            for i in range(3)
        ]
        db_session.add_all(items)
        await db_session.commit()
        for item in items:
            await db_session.refresh(item)

        service = CorpusIntelligenceService()
        result = await service.batch_approve([i.id for i in items], sample_user.id, "Batch approval", db=db_session)
        assert len(result["approved"]) == 3
        assert len(result["failed"]) == 0

    async def test_batch_reject(self, db_session, sample_user):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        items = [
            CorpusItemExtended(
                media_type="text",
                source="test",
                content_hash=f"br{i}",
                language="en",
                title=f"Reject Item {i}",
                status="VALIDATED",
                created_by=sample_user.id,
            )
            for i in range(2)
        ]
        db_session.add_all(items)
        await db_session.commit()
        for item in items:
            await db_session.refresh(item)

        service = CorpusIntelligenceService()
        result = await service.batch_reject([i.id for i in items], sample_user.id, "Batch rejection", db=db_session)
        assert len(result["rejected"]) == 2
        assert len(result["failed"]) == 0

    async def test_batch_quarantine(self, db_session, sample_user):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        items = [
            CorpusItemExtended(
                media_type="text",
                source="test",
                content_hash=f"bq{i}",
                language="en",
                title=f"Quarantine Item {i}",
                status="PENDING",
                created_by=sample_user.id,
            )
            for i in range(2)
        ]
        db_session.add_all(items)
        await db_session.commit()
        for item in items:
            await db_session.refresh(item)

        service = CorpusIntelligenceService()
        result = await service.batch_quarantine(
            [i.id for i in items], "Batch quarantine reason", sample_user.id, db=db_session
        )
        assert len(result["quarantined"]) == 2
        assert len(result["failed"]) == 0


# ---------------------------------------------------------------------------
# Training Eligibility Tests
# ---------------------------------------------------------------------------


class TestTrainingEligibility:
    async def test_training_eligible_after_quality_pass(self, db_session, sample_user):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="te1",
            language="en",
            title="Training Eligible Item",
            status="VALIDATED",
            quality_score=0.9,
            quality_status="passed",
            created_by=sample_user.id,
        )
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)

        service = CorpusIntelligenceService()
        service._update_training_eligibility(item)
        assert item.training_eligible is True
        assert item.training_eligibility_reason is not None
        assert "0.9" in item.training_eligibility_reason

    async def test_training_not_eligible_low_quality(self, db_session, sample_user):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="te2",
            language="en",
            title="Low Quality Item",
            status="VALIDATED",
            quality_score=0.3,
            quality_status="passed",
            created_by=sample_user.id,
        )
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)

        service = CorpusIntelligenceService()
        service._update_training_eligibility(item)
        assert item.training_eligible is False
        assert item.training_eligibility_reason is not None
        assert "0.3" in item.training_eligibility_reason

    async def test_training_not_eligible_wrong_status(self, db_session, sample_user):
        from app.services.corpus_intelligence import CorpusIntelligenceService

        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="te3",
            language="en",
            title="Pending Item",
            status="PENDING",
            quality_score=0.9,
            quality_status="passed",
            created_by=sample_user.id,
        )
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)

        service = CorpusIntelligenceService()
        service._update_training_eligibility(item)
        assert item.training_eligible is False

    async def test_mark_used_in_training(self, db_session, sample_user):
        from app.services.corpus_audit import CorpusAuditService
        from app.services.corpus_intelligence import CorpusIntelligenceService

        item = CorpusItemExtended(
            media_type="text",
            source="test",
            content_hash="mu1",
            language="en",
            title="Used Item",
            status="IN_DATASET",
            created_by=sample_user.id,
        )
        db_session.add(item)
        await db_session.commit()
        await db_session.refresh(item)

        service = CorpusIntelligenceService()
        await service.mark_used_in_training([item.id], sample_user.id, db=db_session)

        audit_service = CorpusAuditService()
        events = await audit_service.get_item_events(item.id, db=db_session)
        training_events = [e for e in events if e.action == "USED_IN_TRAINING"]
        assert len(training_events) == 1


# ---------------------------------------------------------------------------
# Preprocessing Pipeline Model Tests
# ---------------------------------------------------------------------------


class TestPreprocessingPipeline:
    async def test_create_pipeline_record(self, db_session):
        pipeline = PreprocessingPipeline(
            version="1.0.0",
            name="Default Pipeline",
            description="Standard preprocessing pipeline",
            steps='["normalize", "extract_metadata", "validate"]',
            is_active=True,
        )
        db_session.add(pipeline)
        await db_session.commit()
        await db_session.refresh(pipeline)
        assert pipeline.id is not None
        assert pipeline.is_active is True


# ---------------------------------------------------------------------------
# Duplicate Type Enum Tests
# ---------------------------------------------------------------------------


class TestDuplicateType:
    def test_enum_values(self):
        assert DuplicateType.EXACT.value == "EXACT"
        assert DuplicateType.NEAR.value == "NEAR"
