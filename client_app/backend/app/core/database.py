from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

corpus_engine = create_async_engine(settings.CORPUS_DB_URL, echo=False, pool_pre_ping=True)
corpus_session = async_sessionmaker(corpus_engine, class_=AsyncSession, expire_on_commit=False)


async def get_db():
    try:
        async with async_session() as session:
            yield session
    except SQLAlchemyError:
        yield None


async def get_corpus_db():
    try:
        async with corpus_session() as session:
            yield session
    except SQLAlchemyError:
        yield None


async def init_db():
    from app.models.all_models import (  # noqa: F401
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
    from app.models.analysis import (  # noqa: F401
        AnalysisConfiguration,
        AnalysisJobAnalyzer,
        AnalysisJobResult,
        AnalysisJobV2,
        AnalysisPipelineEvent,
        AnalysisSignal,
        ModelRegistry,
    )
    from app.models.base import Base
    from app.models.corpus_intelligence import (  # noqa: F401
        CorpusAuditEvent,
        CorpusDuplicate,
        CorpusItemExtended,
        CorpusQualityCheck,
        DatasetSplitExtended,
        DatasetVersionExtended,
        DatasetVersionItemExt,
        PreprocessingPipeline,
    )
    from app.models.intelligence import (  # noqa: F401
        AffectedRegion,
        AffectedSegment,
        AnalysisTrace,
        Claim,
        ClaimSource,
        CorpusSource,
        DatasetSample,
        DatasetSplit,
        DocumentChunk,
        DriftEvent,
        Embedding,
        EmbeddingVersion,
        Evidence,
        EvidenceGraph,
        Feedback,
        RetrievalQuery,
        RetrievalResult,
        SearchSource,
        SimilarityMatch,
    )
    from app.models.mlops import (  # noqa: F401
        ActiveLearningCandidate,
        DatasetCandidate,
        DatasetQualityCheck,
        DriftSnapshot,
        ExperimentRun,
        MLOpsAuditLog,
        ModelDeployment,
        ModelEvaluation,
        ModelPromotion,
        TrainingJobV2,
        TrainingTrigger,
    )
    from app.models.processing import ProcessingArtifact, ProcessingJob, ProcessingJobEvent  # noqa: F401
    from app.models.user import User  # noqa: F401

    if not settings.DEBUG:
        return

    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    except Exception as exc:
        import logging

        logging.warning("Development database unavailable, starting without DB: %s", exc)
