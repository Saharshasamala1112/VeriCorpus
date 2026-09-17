"""Cross-cutting intelligence entities and analysis provenance.

These tables deliberately store immutable references and JSON snapshots so an
analysis can be reproduced after models, retrieval indexes, or prompts change.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin, generate_uuid


class CorpusSource(TimestampMixin, Base):
    __tablename__ = "corpus_sources"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    locator: Mapped[str | None] = mapped_column(String(1000))
    configuration_json: Mapped[str | None] = mapped_column(Text)


class DatasetSample(TimestampMixin, Base):
    __tablename__ = "dataset_samples"
    __table_args__ = (
        Index("idx_dataset_sample_version", "dataset_version_id"),
        UniqueConstraint("dataset_version_id", "corpus_item_id", name="uq_dataset_sample_item"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    dataset_version_id: Mapped[str] = mapped_column(ForeignKey("dataset_versions.id"), nullable=False)
    corpus_item_id: Mapped[str | None] = mapped_column(ForeignKey("corpus_items.id"))
    label: Mapped[str | None] = mapped_column(String(100))
    split: Mapped[str | None] = mapped_column(String(20))
    sample_hash: Mapped[str | None] = mapped_column(String(64))
    provenance_json: Mapped[str | None] = mapped_column(Text)


class DatasetSplit(TimestampMixin, Base):
    __tablename__ = "dataset_splits"
    __table_args__ = (UniqueConstraint("dataset_version_id", "name", name="uq_dataset_split"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    dataset_version_id: Mapped[str] = mapped_column(ForeignKey("dataset_versions.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(20), nullable=False)
    sample_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    strategy: Mapped[str | None] = mapped_column(String(100))


class DocumentChunk(TimestampMixin, Base):
    __tablename__ = "document_chunks"
    __table_args__ = (
        Index("idx_document_chunk_asset", "media_asset_id"),
        UniqueConstraint("media_asset_id", "chunk_index", name="uq_document_chunk_index"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    media_asset_id: Mapped[str] = mapped_column(ForeignKey("media_assets.id"), nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str | None] = mapped_column(String(64))
    start_offset: Mapped[int | None] = mapped_column(Integer)
    end_offset: Mapped[int | None] = mapped_column(Integer)
    preprocessing_version: Mapped[str | None] = mapped_column(String(50))


class Embedding(TimestampMixin, Base):
    __tablename__ = "embeddings"
    __table_args__ = (
        Index("idx_embedding_asset", "media_asset_id"),
        Index("idx_embedding_chunk", "document_chunk_id"),
        UniqueConstraint(
            "media_asset_id",
            "document_chunk_id",
            "provider",
            "model",
            "model_version",
            name="uq_embedding_target_model",
        ),
        CheckConstraint(
            "(media_asset_id IS NOT NULL AND document_chunk_id IS NULL) OR "
            "(media_asset_id IS NULL AND document_chunk_id IS NOT NULL)",
            name="ck_embedding_single_target",
        ),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    media_asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id"))
    document_chunk_id: Mapped[str | None] = mapped_column(ForeignKey("document_chunks.id"))
    embedding_model: Mapped[str] = mapped_column(String(200), nullable=False)
    embedding_version: Mapped[str] = mapped_column(String(50), nullable=False)
    provider: Mapped[str] = mapped_column(String(100), nullable=False, default="local")
    model: Mapped[str] = mapped_column(String(200), nullable=False, default="hashing")
    model_version: Mapped[str] = mapped_column(String(100), nullable=False, default="1")
    preprocessing_version: Mapped[str] = mapped_column(String(50), nullable=False, default="1.0.0")
    vector_store: Mapped[str] = mapped_column(String(100), nullable=False)
    vector_key: Mapped[str] = mapped_column(String(500), nullable=False)
    dimensions: Mapped[int | None] = mapped_column(Integer)
    vector_json: Mapped[str | None] = mapped_column(Text)


class EmbeddingVersion(TimestampMixin, Base):
    __tablename__ = "embedding_versions"
    __table_args__ = (
        UniqueConstraint("provider", "model", "model_version", name="uq_embedding_version"),
        Index("idx_embedding_version_active", "is_active"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    provider: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(200), nullable=False)
    model_version: Mapped[str] = mapped_column(String(100), nullable=False)
    dimensions: Mapped[int] = mapped_column(Integer, nullable=False)
    preprocessing_version: Mapped[str] = mapped_column(String(50), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    configuration_json: Mapped[str | None] = mapped_column(Text)


class RetrievalQuery(TimestampMixin, Base):
    __tablename__ = "retrieval_queries"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str | None] = mapped_column(ForeignKey("analysis_jobs_v2.id"))
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    normalized_query: Mapped[str | None] = mapped_column(Text)
    query_analysis_json: Mapped[str | None] = mapped_column(Text)
    retrieval_config_json: Mapped[str | None] = mapped_column(Text)
    embedding_version: Mapped[str | None] = mapped_column(String(50))


class SearchSource(TimestampMixin, Base):
    __tablename__ = "search_sources"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    locator: Mapped[str] = mapped_column(String(2000), nullable=False)
    title: Mapped[str | None] = mapped_column(String(500))
    publisher: Mapped[str | None] = mapped_column(String(300))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    retrieved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    relevance_score: Mapped[float | None] = mapped_column(Float)
    content_hash: Mapped[str | None] = mapped_column(String(64), index=True)
    authority_score: Mapped[float | None] = mapped_column(Float)
    provenance: Mapped[str] = mapped_column(String(20), default="external", nullable=False)
    metadata_json: Mapped[str | None] = mapped_column(Text)


class RetrievalResult(TimestampMixin, Base):
    __tablename__ = "retrieval_results"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    query_id: Mapped[str] = mapped_column(ForeignKey("retrieval_queries.id"), nullable=False)
    search_source_id: Mapped[str | None] = mapped_column(ForeignKey("search_sources.id"))
    document_chunk_id: Mapped[str | None] = mapped_column(ForeignKey("document_chunks.id"))
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    retrieval_score: Mapped[float | None] = mapped_column(Float)
    rerank_score: Mapped[float | None] = mapped_column(Float)
    snippet: Mapped[str | None] = mapped_column(Text)
    provenance: Mapped[str] = mapped_column(String(20), default="external", nullable=False)


class Claim(TimestampMixin, Base):
    __tablename__ = "claims"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="unverified", nullable=False)
    extraction_method: Mapped[str | None] = mapped_column(String(100))


class ClaimSource(Base):
    __tablename__ = "claim_sources"
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), primary_key=True)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence.id"), primary_key=True)


class Evidence(TimestampMixin, Base):
    __tablename__ = "evidence"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), nullable=False)
    source_id: Mapped[str | None] = mapped_column(ForeignKey("search_sources.id"))
    evidence_type: Mapped[str] = mapped_column(String(50), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    locator: Mapped[str | None] = mapped_column(String(1000))
    support_score: Mapped[float | None] = mapped_column(Float)
    provenance: Mapped[str] = mapped_column(String(20), default="external", nullable=False)
    content_hash: Mapped[str | None] = mapped_column(String(64))


class EvidenceGraph(TimestampMixin, Base):
    __tablename__ = "evidence_graphs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), nullable=False)
    graph_json: Mapped[str] = mapped_column(Text, nullable=False)
    construction_method: Mapped[str] = mapped_column(String(100), nullable=False)


class SimilarityMatch(TimestampMixin, Base):
    __tablename__ = "similarity_matches"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), nullable=False)
    matched_asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id"))
    source_id: Mapped[str | None] = mapped_column(ForeignKey("search_sources.id"))
    matched_text: Mapped[str | None] = mapped_column(Text)
    similarity_score: Mapped[float] = mapped_column(Float, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    match_type: Mapped[str] = mapped_column(String(30), nullable=False)
    input_span_json: Mapped[str | None] = mapped_column(Text)
    source_span_json: Mapped[str | None] = mapped_column(Text)
    matched_span_json: Mapped[str | None] = mapped_column(Text)
    location_json: Mapped[str | None] = mapped_column(Text)
    retrieved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AffectedRegion(TimestampMixin, Base):
    __tablename__ = "affected_regions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), nullable=False)
    signal_id: Mapped[str | None] = mapped_column(ForeignKey("analysis_signals_v2.id"))
    region_json: Mapped[str] = mapped_column(Text, nullable=False)
    score: Mapped[float | None] = mapped_column(Float)
    explanation: Mapped[str | None] = mapped_column(Text)


class AffectedSegment(TimestampMixin, Base):
    __tablename__ = "affected_segments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), nullable=False)
    signal_id: Mapped[str | None] = mapped_column(ForeignKey("analysis_signals_v2.id"))
    start_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    end_seconds: Mapped[float] = mapped_column(Float, nullable=False)
    score: Mapped[float | None] = mapped_column(Float)
    explanation: Mapped[str | None] = mapped_column(Text)


class Feedback(TimestampMixin, Base):
    __tablename__ = "feedback"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    feedback_type: Mapped[str] = mapped_column(String(50), nullable=False)
    label: Mapped[str | None] = mapped_column(String(100))
    comment: Mapped[str | None] = mapped_column(Text)
    correction_json: Mapped[str | None] = mapped_column(Text)


class DriftEvent(TimestampMixin, Base):
    __tablename__ = "drift_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    model_id: Mapped[str] = mapped_column(ForeignKey("models.id"), nullable=False)
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    baseline_value: Mapped[float | None] = mapped_column(Float)
    observed_value: Mapped[float] = mapped_column(Float, nullable=False)
    drift_score: Mapped[float] = mapped_column(Float, nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False)
    details_json: Mapped[str | None] = mapped_column(Text)


class AnalysisTrace(TimestampMixin, Base):
    __tablename__ = "analysis_traces"
    __table_args__ = (Index("idx_analysis_trace_job", "analysis_job_id"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    analysis_job_id: Mapped[str] = mapped_column(ForeignKey("analysis_jobs_v2.id"), nullable=False)
    input_sha256: Mapped[str | None] = mapped_column(String(64))
    preprocessing_version: Mapped[str | None] = mapped_column(String(50))
    feature_extraction_version: Mapped[str | None] = mapped_column(String(50))
    model_versions_json: Mapped[str | None] = mapped_column(Text)
    dataset_versions_json: Mapped[str | None] = mapped_column(Text)
    embedding_version: Mapped[str | None] = mapped_column(String(100))
    retrieval_config_json: Mapped[str | None] = mapped_column(Text)
    retrieved_source_ids_json: Mapped[str | None] = mapped_column(Text)
    llm_config_json: Mapped[str | None] = mapped_column(Text)
    prompt_version: Mapped[str | None] = mapped_column(String(100))
    explanation_method: Mapped[str | None] = mapped_column(String(100))
    analysis_timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
