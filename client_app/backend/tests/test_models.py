import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.models.all_models import (
    AnalysisJob,
    AnalysisResult,
    AuditLog,
    CorpusItem,
    Dataset,
    DatasetVersion,
    DatasetVersionItem,
    Explanation,
    MediaAsset,
    MediaMetadata,
    Model,
    ModelVersion,
    ProcessingEvent,
    TrainingJob,
    TrainingRun,
)
from app.models.base import Base
from app.models.user import User, UserRole


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


class TestUserModel:
    def test_create_user(self, db_session):
        user = User(phone="1234567890", username="testuser", password_hash="hashed", role=UserRole.USER)
        db_session.add(user)
        db_session.commit()
        assert user.id is not None
        assert user.phone == "1234567890"
        assert user.role == UserRole.USER
        assert user.is_active is True

    def test_user_roles(self):
        assert UserRole.USER.value == "USER"
        assert UserRole.ADMIN.value == "ADMIN"
        assert UserRole.REVIEWER.value == "REVIEWER"
        assert UserRole.ML_ENGINEER.value == "ML_ENGINEER"


class TestMediaModels:
    def test_create_media_asset(self, db_session):
        user = User(phone="1111111111", username="u1", password_hash="h", role=UserRole.USER)
        db_session.add(user)
        db_session.flush()

        asset = MediaAsset(
            owner_id=user.id,
            media_type="text",
            filename="path.txt",
            original_filename="doc.txt",
            mime_type="text/plain",
            file_size=100,
            storage_path="/uploads/path.txt",
            sha256="abc123",
        )
        db_session.add(asset)
        db_session.commit()
        assert asset.id is not None
        assert asset.media_type == "text"

    def test_media_metadata_relationship(self, db_session):
        user = User(phone="2222222222", username="u2", password_hash="h", role=UserRole.USER)
        db_session.add(user)
        db_session.flush()

        asset = MediaAsset(
            owner_id=user.id,
            media_type="image",
            filename="img.jpg",
            original_filename="img.jpg",
            mime_type="image/jpeg",
            file_size=1000,
            storage_path="/uploads/img.jpg",
            sha256="def456",
        )
        db_session.add(asset)
        db_session.flush()

        meta = MediaMetadata(media_asset_id=asset.id, width=1920, height=1080)
        db_session.add(meta)
        db_session.commit()

        assert meta.width == 1920
        assert meta.media_asset_id == asset.id


class TestDatasetModels:
    def test_create_dataset_and_version(self, db_session):
        ds = Dataset(name="test-dataset", media_type="text")
        db_session.add(ds)
        db_session.flush()

        dv = DatasetVersion(dataset_id=ds.id, version="v1.0", sample_count=100)
        db_session.add(dv)
        db_session.commit()

        assert dv.dataset_id == ds.id
        assert dv.version == "v1.0"


class TestAnalysisModels:
    def test_create_analysis_pipeline(self, db_session):
        user = User(phone="3333333333", username="u3", password_hash="h", role=UserRole.USER)
        db_session.add(user)
        db_session.flush()

        job = AnalysisJob(user_id=user.id, input_type="text", status="pending")
        db_session.add(job)
        db_session.flush()

        result = AnalysisResult(
            analysis_job_id=job.id,
            ai_score=0.87,
            human_score=0.13,
            confidence=0.92,
            risk_level="high",
        )
        db_session.add(result)
        db_session.flush()

        explanation = Explanation(analysis_result_id=result.id, narrative="This text appears AI-generated.")
        db_session.add(explanation)
        db_session.commit()

        assert result.analysis_job_id == job.id
        assert explanation.analysis_result_id == result.id


class TestModelRegistry:
    def test_create_model_and_version(self, db_session):
        model = Model(name="text-detector", media_type="text")
        db_session.add(model)
        db_session.flush()

        mv = ModelVersion(model_id=model.id, version="v1.0", status="production", accuracy=0.95)
        db_session.add(mv)
        db_session.commit()

        assert mv.model_id == model.id
        assert mv.status == "production"


class TestAuditLog:
    def test_create_audit_log(self, db_session):
        log = AuditLog(user_id="user-1", action="login", resource_type="user", resource_id="user-1")
        db_session.add(log)
        db_session.commit()
        assert log.id is not None
        assert log.action == "login"
