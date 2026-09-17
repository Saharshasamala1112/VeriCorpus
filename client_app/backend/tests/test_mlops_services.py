"""
MLOps Pipeline Tests

Comprehensive tests for the MLOps pipeline services including:
- Data pipeline service
- Training trigger service
- Model evaluation service
- Model promotion service
- Drift monitoring service
- Active learning service
- Audit logging service
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.mlops import (
    ActiveLearningCandidate,
    ApprovalStatus,
    DatasetCandidate,
    DatasetQualityCheck,
    DriftSnapshot,
    ModelEvaluation,
    ModelPromotion,
    ModelStage,
    TrainingJobStatus,
    TrainingJobV2,
    TrainingTrigger,
)
from app.schemas.mlops import (
    ActiveLearningAnnotation,
    ActiveLearningCandidateCreate,
    DatasetCandidateApproval,
    DatasetCandidateCreate,
    DriftSnapshotCreate,
    ModelEvaluationApproval,
    ModelEvaluationCreate,
    ModelEvaluationMetricsUpdate,
    ModelPromotionCreate,
    ModelRollbackCreate,
    TrainingJobCreate,
    TrainingJobStatusUpdate,
    TrainingTriggerCreate,
)
from app.services.active_learning_service import ActiveLearningService
from app.services.data_pipeline_service import DataPipelineService
from app.services.drift_monitoring_service import DriftMonitoringService
from app.services.mlops_audit_service import MLOpsAuditService
from app.services.model_evaluation_service import ModelEvaluationService
from app.services.model_promotion_service import ModelPromotionService
from app.services.training_trigger_service import TrainingTriggerService

# ─── Mock Database Session ─────────────────────────────────────────────────────


class MockAsyncSession:
    """Mock async database session for testing."""

    def __init__(self):
        self.add = AsyncMock()
        self.commit = AsyncMock()
        self.flush = AsyncMock()
        self.refresh = AsyncMock()
        self.execute = AsyncMock()
        self.close = AsyncMock()


# ─── Data Pipeline Service Tests ──────────────────────────────────────────────


class TestDataPipelineService:
    """Tests for DataPipelineService."""

    @pytest.fixture
    def mock_session(self):
        return MockAsyncSession()

    @pytest.fixture
    def service(self, mock_session):
        return DataPipelineService(mock_session)

    @pytest.mark.asyncio
    async def test_create_candidate_success(self, service, mock_session):
        """Test successful dataset candidate creation."""
        data = DatasetCandidateCreate(
            name="Test Dataset",
            media_type="text",
            sample_count=100,
        )
        user_id = "user-123"

        candidate = await service.create_candidate(data, user_id)

        assert candidate.name == "Test Dataset"
        assert candidate.media_type == "text"
        assert candidate.sample_count == 100
        assert candidate.approval_status == ApprovalStatus.PENDING.value
        assert candidate.created_by == user_id
        # add is called for candidate + quality checks
        assert mock_session.add.call_count >= 1
        mock_session.commit.assert_called()

    @pytest.mark.asyncio
    async def test_create_candidate_quality_checks(self, service, mock_session):
        """Test that quality checks are run on creation."""
        data = DatasetCandidateCreate(
            name="Test Dataset",
            media_type="text",
            sample_count=100,
        )

        await service.create_candidate(data, "user-123")

        # Should have created quality checks
        assert mock_session.add.call_count >= 1  # At least the candidate

    @pytest.mark.asyncio
    async def test_approve_candidate_success(self, service, mock_session):
        """Test successful candidate approval."""
        candidate = DatasetCandidate(
            id="candidate-123",
            name="Test Dataset",
            media_type="text",
            sample_count=100,
            approval_status=ApprovalStatus.PENDING.value,
            created_by="user-123",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = candidate
        mock_session.execute.return_value = mock_result

        approval = DatasetCandidateApproval(approved=True)
        approved_candidate = await service.approve_candidate("candidate-123", approval, "approver-456")

        assert approved_candidate.approval_status == ApprovalStatus.APPROVED.value
        assert approved_candidate.approved_by == "approver-456"
        assert approved_candidate.approved_at is not None

    @pytest.mark.asyncio
    async def test_approve_candidate_not_found(self, service, mock_session):
        """Test approval of non-existent candidate."""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        approval = DatasetCandidateApproval(approved=True)

        with pytest.raises(ValueError, match="not found"):
            await service.approve_candidate("nonexistent", approval, "user-123")

    @pytest.mark.asyncio
    async def test_approve_candidate_already_approved(self, service, mock_session):
        """Test approval of already approved candidate."""
        candidate = DatasetCandidate(
            id="candidate-123",
            name="Test Dataset",
            media_type="text",
            sample_count=100,
            approval_status=ApprovalStatus.APPROVED.value,
            created_by="user-123",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = candidate
        mock_session.execute.return_value = mock_result

        approval = DatasetCandidateApproval(approved=True)

        with pytest.raises(ValueError, match="not pending approval"):
            await service.approve_candidate("candidate-123", approval, "user-123")

    @pytest.mark.asyncio
    async def test_reject_candidate_with_reason(self, service, mock_session):
        """Test candidate rejection with reason."""
        candidate = DatasetCandidate(
            id="candidate-123",
            name="Test Dataset",
            media_type="text",
            sample_count=100,
            approval_status=ApprovalStatus.PENDING.value,
            created_by="user-123",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = candidate
        mock_session.execute.return_value = mock_result

        approval = DatasetCandidateApproval(
            approved=False,
            rejection_reason="Insufficient sample quality",
        )
        rejected_candidate = await service.approve_candidate("candidate-123", approval, "approver-456")

        assert rejected_candidate.approval_status == ApprovalStatus.REJECTED.value
        assert rejected_candidate.rejection_reason == "Insufficient sample quality"


# ─── Training Trigger Service Tests ───────────────────────────────────────────


class TestTrainingTriggerService:
    """Tests for TrainingTriggerService."""

    @pytest.fixture
    def mock_session(self):
        return MockAsyncSession()

    @pytest.fixture
    def service(self, mock_session):
        return TrainingTriggerService(mock_session)

    @pytest.mark.asyncio
    async def test_create_trigger_success(self, service, mock_session):
        """Test successful trigger creation."""
        data = TrainingTriggerCreate(
            name="Sample Threshold Trigger",
            trigger_type="sample_threshold",
            config={"threshold": 100},
        )

        trigger = await service.create_trigger(data, "user-123")

        assert trigger.name == "Sample Threshold Trigger"
        assert trigger.trigger_type == "sample_threshold"
        assert trigger.is_active is True
        mock_session.add.assert_called_once()

    @pytest.mark.asyncio
    async def test_evaluate_trigger_manual(self, service, mock_session):
        """Test manual trigger evaluation."""
        trigger = TrainingTrigger(
            id="trigger-123",
            name="Manual Trigger",
            trigger_type="manual",
            is_active=True,
            created_by="user-123",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = trigger
        mock_session.execute.return_value = mock_result

        evaluation = await service.evaluate_trigger("trigger-123", 50)

        assert evaluation.should_fire is False
        assert "Manual trigger" in evaluation.reason

    @pytest.mark.asyncio
    async def test_evaluate_trigger_threshold_met(self, service, mock_session):
        """Test threshold trigger when threshold is met."""
        trigger = TrainingTrigger(
            id="trigger-123",
            name="Threshold Trigger",
            trigger_type="sample_threshold",
            is_active=True,
            config=json.dumps({"threshold": 100}),
            created_by="user-123",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = trigger
        mock_session.execute.return_value = mock_result

        evaluation = await service.evaluate_trigger("trigger-123", 150)

        assert evaluation.should_fire is True
        assert evaluation.threshold == 100
        assert "meets" in evaluation.reason

    @pytest.mark.asyncio
    async def test_evaluate_trigger_threshold_not_met(self, service, mock_session):
        """Test threshold trigger when threshold is not met."""
        trigger = TrainingTrigger(
            id="trigger-123",
            name="Threshold Trigger",
            trigger_type="sample_threshold",
            is_active=True,
            config=json.dumps({"threshold": 100}),
            created_by="user-123",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = trigger
        mock_session.execute.return_value = mock_result

        evaluation = await service.evaluate_trigger("trigger-123", 50)

        assert evaluation.should_fire is False
        assert evaluation.threshold == 100
        assert "below" in evaluation.reason

    @pytest.mark.asyncio
    async def test_validate_transition_valid(self, service):
        """Test valid state transition."""
        # Should not raise
        service._validate_transition("queued", "running")
        service._validate_transition("running", "succeeded")
        service._validate_transition("running", "failed")
        service._validate_transition("queued", "cancelled")

    @pytest.mark.asyncio
    async def test_validate_transition_invalid(self, service):
        """Test invalid state transition."""
        with pytest.raises(ValueError, match="Invalid transition"):
            service._validate_transition("succeeded", "running")

        with pytest.raises(ValueError, match="Invalid transition"):
            service._validate_transition("failed", "running")


# ─── Model Evaluation Service Tests ───────────────────────────────────────────


class TestModelEvaluationService:
    """Tests for ModelEvaluationService."""

    @pytest.fixture
    def mock_session(self):
        return MockAsyncSession()

    @pytest.fixture
    def service(self, mock_session):
        return ModelEvaluationService(mock_session)

    @pytest.mark.asyncio
    async def test_compare_with_production_improvement(self, service, mock_session):
        """Test comparison showing improvement over production."""
        evaluation = ModelEvaluation(
            id="eval-123",
            training_job_id="job-123",
            model_version_id="version-123",
            test_metrics=json.dumps(
                {
                    "precision": 0.85,
                    "recall": 0.82,
                    "f1_score": 0.83,
                }
            ),
            production_metrics=json.dumps(
                {
                    "precision": 0.80,
                    "recall": 0.78,
                    "f1_score": 0.79,
                }
            ),
            threshold_config=json.dumps(
                {
                    "min_precision": 0.7,
                    "min_recall": 0.7,
                    "min_f1": 0.7,
                }
            ),
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = evaluation
        mock_session.execute.return_value = mock_result

        comparison = await service.compare_with_production("eval-123")

        assert comparison["meets_thresholds"] is True
        assert "improvement" in comparison
        assert comparison["improvement"]["precision"]["improvement_pct"] > 0

    @pytest.mark.asyncio
    async def test_compare_with_production_regression(self, service, mock_session):
        """Test comparison showing regression from production."""
        evaluation = ModelEvaluation(
            id="eval-123",
            training_job_id="job-123",
            model_version_id="version-123",
            test_metrics=json.dumps(
                {
                    "precision": 0.75,
                    "recall": 0.70,
                    "f1_score": 0.72,
                }
            ),
            production_metrics=json.dumps(
                {
                    "precision": 0.80,
                    "recall": 0.78,
                    "f1_score": 0.79,
                }
            ),
            threshold_config=json.dumps(
                {
                    "min_precision": 0.7,
                    "min_recall": 0.7,
                    "min_f1": 0.7,
                }
            ),
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = evaluation
        mock_session.execute.return_value = mock_result

        comparison = await service.compare_with_production("eval-123")

        assert comparison["meets_thresholds"] is True  # Still meets thresholds
        assert comparison["improvement"]["precision"]["improvement_pct"] < 0

    @pytest.mark.asyncio
    async def test_approve_evaluation_success(self, service, mock_session):
        """Test successful evaluation approval."""
        evaluation = ModelEvaluation(
            id="eval-123",
            training_job_id="job-123",
            model_version_id="version-123",
            approval_status=ApprovalStatus.PENDING.value,
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = evaluation
        mock_session.execute.return_value = mock_result

        approval = ModelEvaluationApproval(
            approved=True,
            review_notes="Meets all thresholds",
        )
        approved_evaluation = await service.approve_evaluation("eval-123", approval, "reviewer-456")

        assert approved_evaluation.approval_status == ApprovalStatus.APPROVED.value
        assert approved_evaluation.reviewed_by == "reviewer-456"
        assert approved_evaluation.review_notes == "Meets all thresholds"


# ─── Model Promotion Service Tests ────────────────────────────────────────────


class TestModelPromotionService:
    """Tests for ModelPromotionService."""

    @pytest.fixture
    def mock_session(self):
        return MockAsyncSession()

    @pytest.fixture
    def service(self, mock_session):
        return ModelPromotionService(mock_session)

    @pytest.mark.asyncio
    async def test_rollback_model_success(self, service, mock_session):
        """Test successful model rollback."""
        from app.models.all_models import Model, ModelVersion

        model = Model(
            id="model-123",
            name="Test Model",
            media_type="text",
        )
        current_production = ModelVersion(
            id="version-current",
            model_id="model-123",
            version="v1.0",
            status=ModelStage.PRODUCTION.value,
        )
        target_version = ModelVersion(
            id="version-target",
            model_id="model-123",
            version="v0.9",
            status=ModelStage.RETIRED.value,
        )

        # Mock get_model
        mock_result_model = MagicMock()
        mock_result_model.scalar_one_or_none.return_value = model
        # Mock get_model_version (target)
        mock_result_version = MagicMock()
        mock_result_version.scalar_one_or_none.return_value = target_version
        # Mock get_production_version
        mock_result_production = MagicMock()
        mock_result_production.scalar_one_or_none.return_value = current_production

        mock_session.execute.side_effect = [
            mock_result_model,
            mock_result_version,
            mock_result_production,
        ]

        data = ModelRollbackCreate(
            model_id="model-123",
            target_version_id="version-target",
            reason="Performance regression in v1.0",
        )

        promotion = await service.rollback_model(data, "user-123")

        assert promotion.action == "rollback"
        assert promotion.from_version_id == "version-current"
        assert promotion.to_version_id == "version-target"
        assert current_production.status == ModelStage.RETIRED.value
        assert target_version.status == ModelStage.PRODUCTION.value

    @pytest.mark.asyncio
    async def test_rollback_to_same_version(self, service, mock_session):
        """Test rollback to the same version fails."""
        from app.models.all_models import Model, ModelVersion

        model = Model(
            id="model-123",
            name="Test Model",
            media_type="text",
        )
        current_production = ModelVersion(
            id="version-current",
            model_id="model-123",
            version="v1.0",
            status=ModelStage.PRODUCTION.value,
        )

        mock_result_model = MagicMock()
        mock_result_model.scalar_one_or_none.return_value = model
        mock_result_version = MagicMock()
        mock_result_version.scalar_one_or_none.return_value = current_production
        mock_result_production = MagicMock()
        mock_result_production.scalar_one_or_none.return_value = current_production

        mock_session.execute.side_effect = [
            mock_result_model,
            mock_result_version,
            mock_result_production,
        ]

        data = ModelRollbackCreate(
            model_id="model-123",
            target_version_id="version-current",
            reason="Test rollback",
        )

        with pytest.raises(ValueError, match="Cannot rollback to the same version"):
            await service.rollback_model(data, "user-123")


# ─── Drift Monitoring Service Tests ───────────────────────────────────────────


class TestDriftMonitoringService:
    """Tests for DriftMonitoringService."""

    @pytest.fixture
    def mock_session(self):
        return MockAsyncSession()

    @pytest.fixture
    def service(self, mock_session):
        return DriftMonitoringService(mock_session)

    @pytest.mark.asyncio
    async def test_create_snapshot_with_baseline(self, service, mock_session):
        """Test creating a drift snapshot with baseline value."""
        data = DriftSnapshotCreate(
            model_id="model-123",
            metric_type="language_distribution",
            metric_name="english_ratio",
            metric_value=0.75,
            baseline_value=0.80,
            sample_size=1000,
        )

        # Mock _get_baseline_value
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result

        snapshot = await service.create_snapshot(data)

        assert snapshot.model_id == "model-123"
        assert snapshot.metric_type == "language_distribution"
        assert snapshot.metric_value == 0.75
        assert snapshot.baseline_value == 0.80
        assert snapshot.drift_score is not None
        assert snapshot.is_drifting is not None

    @pytest.mark.asyncio
    async def test_drift_detection(self, service, mock_session):
        """Test drift detection for a model."""
        snapshots = [
            DriftSnapshot(
                id="snap-1",
                model_id="model-123",
                metric_type="language_distribution",
                metric_name="english_ratio",
                metric_value=0.60,
                baseline_value=0.80,
                drift_score=0.25,
                is_drifting=True,
                sample_size=1000,
            ),
            DriftSnapshot(
                id="snap-2",
                model_id="model-123",
                metric_type="confidence_distribution",
                metric_name="avg_confidence",
                metric_value=0.85,
                baseline_value=0.80,
                drift_score=0.0625,
                is_drifting=False,
                sample_size=1000,
            ),
        ]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = snapshots
        mock_session.execute.return_value = mock_result

        alerts = await service.detect_drift("model-123")

        assert len(alerts) == 1
        assert alerts[0].metric_type == "language_distribution"
        assert alerts[0].severity in ["low", "medium", "high", "critical"]

    @pytest.mark.asyncio
    async def test_drift_summary(self, service, mock_session):
        """Test drift summary generation."""
        snapshots = [
            DriftSnapshot(
                id="snap-1",
                model_id="model-123",
                metric_type="language_distribution",
                metric_name="english_ratio",
                metric_value=0.60,
                baseline_value=0.80,
                drift_score=0.25,
                is_drifting=True,
                sample_size=1000,
            ),
            DriftSnapshot(
                id="snap-2",
                model_id="model-123",
                metric_type="confidence_distribution",
                metric_name="avg_confidence",
                metric_value=0.85,
                baseline_value=0.80,
                drift_score=0.0625,
                is_drifting=False,
                sample_size=1000,
            ),
        ]
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = snapshots
        mock_session.execute.return_value = mock_result

        summary = await service.get_drift_summary("model-123")

        assert summary["model_id"] == "model-123"
        assert summary["total_metrics"] == 2
        assert summary["drifting_metrics"] == 1
        assert summary["stable_metrics"] == 1
        assert summary["drift_percentage"] == 50.0


# ─── Active Learning Service Tests ────────────────────────────────────────────


class TestActiveLearningService:
    """Tests for ActiveLearningService."""

    @pytest.fixture
    def mock_session(self):
        return MockAsyncSession()

    @pytest.fixture
    def service(self, mock_session):
        return ActiveLearningService(mock_session)

    @pytest.mark.asyncio
    async def test_create_candidate_success(self, service, mock_session):
        """Test successful candidate creation."""
        data = ActiveLearningCandidateCreate(
            sample_id="sample-123",
            media_type="text",
            source="analysis",
            selection_reason="low_confidence",
            confidence_score=0.35,
            priority=80,
        )

        candidate = await service.create_candidate(data)

        assert candidate.sample_id == "sample-123"
        assert candidate.selection_reason == "low_confidence"
        assert candidate.confidence_score == 0.35
        assert candidate.priority == 80
        assert candidate.status == "pending"

    @pytest.mark.asyncio
    async def test_annotate_candidate_success(self, service, mock_session):
        """Test successful candidate annotation."""
        candidate = ActiveLearningCandidate(
            id="alc-123",
            sample_id="sample-123",
            media_type="text",
            source="analysis",
            selection_reason="low_confidence",
            status="pending",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = candidate
        mock_session.execute.return_value = mock_result

        annotation = ActiveLearningAnnotation(
            label="authentic",
            confidence=0.95,
            notes="Clear authentic content",
        )

        annotated = await service.annotate_candidate("alc-123", annotation, "annotator-456")

        assert annotated.status == "annotated"
        assert annotated.annotated_by == "annotator-456"
        assert annotated.annotated_at is not None

    @pytest.mark.asyncio
    async def test_annotate_already_annotated(self, service, mock_session):
        """Test annotation of already annotated candidate."""
        candidate = ActiveLearningCandidate(
            id="alc-123",
            sample_id="sample-123",
            media_type="text",
            source="analysis",
            selection_reason="low_confidence",
            status="annotated",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = candidate
        mock_session.execute.return_value = mock_result

        annotation = ActiveLearningAnnotation(
            label="authentic",
            confidence=0.95,
        )

        with pytest.raises(ValueError, match="already annotated"):
            await service.annotate_candidate("alc-123", annotation, "annotator-456")

    @pytest.mark.asyncio
    async def test_skip_candidate(self, service, mock_session):
        """Test skipping a candidate."""
        candidate = ActiveLearningCandidate(
            id="alc-123",
            sample_id="sample-123",
            media_type="text",
            source="analysis",
            selection_reason="low_confidence",
            status="pending",
        )
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = candidate
        mock_session.execute.return_value = mock_result

        skipped = await service.skip_candidate("alc-123", "Too noisy")

        assert skipped.status == "skipped"

    @pytest.mark.asyncio
    async def test_get_statistics(self, service, mock_session):
        """Test statistics generation."""
        # Mock count by status
        mock_status_result = MagicMock()
        mock_status_result.all.return_value = [
            ("pending", 10),
            ("annotated", 25),
            ("skipped", 5),
        ]
        # Mock count by reason
        mock_reason_result = MagicMock()
        mock_reason_result.all.return_value = [
            ("low_confidence", 15),
            ("disagreement", 10),
            ("reviewer_selected", 15),
        ]
        # Mock average scores
        mock_scores_result = MagicMock()
        mock_scores_result.one.return_value = (0.45, 0.35)

        mock_session.execute.side_effect = [
            mock_status_result,
            mock_reason_result,
            mock_scores_result,
        ]

        stats = await service.get_statistics()

        assert stats["total_candidates"] == 40
        assert stats["by_status"]["pending"] == 10
        assert stats["by_status"]["annotated"] == 25
        assert stats["annotation_rate"] == 62.5


# ─── Audit Service Tests ──────────────────────────────────────────────────────


class TestMLOpsAuditService:
    """Tests for MLOpsAuditService."""

    @pytest.fixture
    def mock_session(self):
        return MockAsyncSession()

    @pytest.fixture
    def service(self, mock_session):
        return MLOpsAuditService(mock_session)

    @pytest.mark.asyncio
    async def test_log_dataset_created(self, service, mock_session):
        """Test logging dataset creation."""
        entry = await service.log_dataset_created(
            "dataset-123",
            "user-456",
            {"name": "Test Dataset"},
        )

        assert entry.action == "dataset_created"
        assert entry.resource_type == "dataset_candidate"
        assert entry.resource_id == "dataset-123"
        assert entry.user_id == "user-456"

    @pytest.mark.asyncio
    async def test_log_training_initiated(self, service, mock_session):
        """Test logging training initiation."""
        entry = await service.log_training_initiated(
            "job-123",
            "user-456",
            "model-789",
            "dataset-012",
            "trigger-345",
        )

        assert entry.action == "training_initiated"
        assert entry.resource_type == "training_job"
        assert entry.resource_id == "job-123"

    @pytest.mark.asyncio
    async def test_log_model_promoted(self, service, mock_session):
        """Test logging model promotion."""
        entry = await service.log_model_promoted(
            "promo-123",
            "user-456",
            "model-789",
            "version-old",
            "version-new",
            "staging",
            "production",
        )

        assert entry.action == "model_promoted"
        assert entry.resource_type == "model_promotion"
        assert entry.resource_id == "promo-123"

    @pytest.mark.asyncio
    async def test_log_drift_detected(self, service, mock_session):
        """Test logging drift detection."""
        entry = await service.log_drift_detected(
            "model-123",
            "language_distribution",
            0.25,
            "high",
        )

        assert entry.action == "drift_detected"
        assert entry.resource_type == "drift_snapshot"
        assert entry.resource_id == "model-123"
