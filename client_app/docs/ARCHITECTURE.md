# VeriCorpus AI platform architecture

## Current-state assessment

The repository is a React/Vite frontend (`frontend/`) and FastAPI/SQLAlchemy
backend (`backend/`). Authentication, local file storage, async REST APIs,
modality processors, a text scikit-learn ensemble, an optional forensic
adapter, corpus synchronization, dataset versioning, model evaluation and
promotion services, drift snapshots, and frontend explainability components
already exist and should be retained.

The main architectural risks are:

- v1 and v2 analysis/model schemas coexist, which makes v2 the safer target
  while preserving v1 routes for compatibility.
- `create_all` initially registered only the legacy model module, so several
  v2, processing, corpus-intelligence, and MLOps tables were not guaranteed
  to exist on a clean database.
- Backend upload and ingestion capabilities were duplicated as hardcoded MIME
  and extension maps.
- The frontend contains explicit mock analysis and MLOps datasets. These are
  demo-only and must not be presented as production analysis.
- Text detection is a real specialized model path; image/audio/video paths
  still include forensic heuristics and optional model adapters. An LLM must
  not replace these signals.

## Target bounded-context architecture

```text
Auth/API
  -> Media and document ingestion
  -> Modality processing and feature extraction
  -> Specialized analyzers
       text AI detector | similarity/plagiarism | image forensics
       audio forensics | video temporal/visual forensics | language/NLP
  -> Corpus/vector retrieval
  -> External search (policy-controlled)
  -> Hybrid retrieval and reranking
  -> Claim/evidence graph
  -> Evidence-grounded LLM synthesis
  -> Structured result, explainability, localization, translation
  -> History and feedback
  -> Dataset snapshots -> training -> evaluation -> registry -> promotion
  -> drift/quality monitoring -> active learning -> next dataset version
```

The LLM boundary is intentionally narrow: it receives structured detector
signals and cited evidence, then performs controlled reasoning, synthesis,
and multilingual explanation. Detector scores, similarity matches, source
retrieval, and affected regions must come from specialized components.

## Domain model and traceability

Legacy entities remain available for compatibility. The v2 analysis entities
are the execution spine:

- `MediaAsset`, `MediaMetadata`, `ProcessingJob`, and processing events
  represent immutable input and preprocessing.
- `AnalysisJobV2`, `AnalysisSignal`, and `AnalysisJobResult` represent
  execution and detector output.
- `CorpusItem*`, `Dataset*`, `DatasetSample`, and `DatasetSplit` represent
  governed learning data.
- `Embedding`, `DocumentChunk`, `RetrievalQuery`, `RetrievalResult`, and
  `SearchSource` represent retrieval.
- `Claim`, `Evidence`, `EvidenceGraph`, `SimilarityMatch`,
  `AffectedRegion`, and `AffectedSegment` represent verification and
  modality-specific localization.
- `Model*`, training/evaluation/promotion entities, `Feedback`, and
  `DriftEvent` represent continuous learning and operations.
- `AnalysisTrace` records input hash, preprocessing and feature versions,
  model/dataset/embedding versions, retrieval configuration and source IDs,
  LLM/prompt configuration, explanation method, and timestamp.

Every new pipeline stage should append an event and update the trace rather
than returning an unversioned value. Sources and evidence must be persisted
with locators; unavailable evidence must be reported as unavailable.

## RAG and global evidence retrieval

`app.services.rag_retrieval` provides provider-neutral boundaries for query
analysis, keyword and web search, local vector retrieval, hybrid retrieval,
reranking, source quality evaluation, evidence persistence, context building,
and downstream LLM invocation. External search is opt-in through an approved
API adapter; the default provider performs no scraping and returns no
fabricated sources. If an external provider fails, local corpus results remain
usable and the failure is returned as explicit pipeline metadata.

Retrieved content is untrusted data. Context blocks preserve provenance,
locators, timestamps, source type, and attribution, enforce source and token
budgets, and wrap content in an untrusted-data boundary. Instruction markers
are neutralized before context assembly, and the context policy explicitly
directs the LLM to ignore commands embedded in retrieved corpus or web
content.

## AI-generated-content detection

`app.services.ai_content_detection` is the detector boundary for all
AI-generated-content assessments. The text implementation combines lexical,
syntactic/stylometric, statistical, burstiness, repetition, language, and
optional trained-classifier or transformer representation signals. It emits
raw model probability separately from held-out calibration output and
evidence strength. Image, audio, video, and document detectors have separate
versioned contracts; modalities without a validated production model return
`INSUFFICIENT_EVIDENCE` rather than a neutral score.

Detector results include model and preprocessing versions, supporting and
counter-signals, evidence, limitations, and explicit assessment states:
`LIKELY_AI`, `LIKELY_HUMAN`, `UNCERTAIN`, and `INSUFFICIENT_EVIDENCE`.
`GoldenEvaluationDataset` provides duplicate/source-group-safe splits, while
`evaluate_golden_dataset` reports precision, recall, F1, ROC-AUC, PR-AUC,
Brier calibration, expected calibration error, false-positive rate,
false-negative rate, and language/modality breakdowns. Frontend result cards
label model probability, calibrated confidence, and evidence strength
separately.

## Multi-stage plagiarism and similarity

`app.services.plagiarism_detection` implements plagiarism as an evidence pipeline:

`segmentation -> exact -> lexical -> n-gram/hash -> vector/semantic -> rerank -> cluster`

Matches preserve input/source character offsets, document locations, source URLs,
retrieval timestamps, match type, similarity score, and confidence. Exact, n-gram,
and near-duplicate evidence may support a plagiarism finding; paraphrase and
semantic matches remain similarity evidence and are never confirmed plagiarism on
their own. Source retrieval and semantic providers are replaceable, allowing local
corpus search and approved external providers to use the same contracts.

## Incremental implementation plan

1. **Foundation (implemented in this increment):** central backend media
   capability registry; startup registration for all authored model modules;
   provenance/retrieval/evidence/localization/feedback/drift entities; and
   an architecture contract documenting the LLM boundary.
2. **Pipeline integrity:** create a single v2 ingestion-to-analysis service
   that persists preprocessing, feature, model, retrieval, and explanation
   trace records; remove score-shaped fallbacks for unavailable analyzers.
3. **Retrieval and evidence (implemented incrementally):** chunking and
   embedding adapters, provider-independent local vector retrieval, query
   analysis, hybrid corpus/global retrieval, optional external search
   providers with source policies, reranking, quality filtering, safe context
   construction, and evidence persistence.
4. **Multimodal specialization (contract implemented):** deploy validated
   versioned adapters for image, audio, and video models; persist affected
   regions/segments and calibration metadata. Until those models are
   evaluated and promoted, the modality detectors report insufficient
   evidence instead of producing metadata-shaped AI probabilities.
5. **Grounded reasoning and localization:** add a schema-constrained LLM
   explainer that can only cite persisted evidence and explicitly returns
   limitations; add translation after the canonical explanation.
6. **Learning loop:** connect feedback and active learning to immutable
   dataset versions, reproducible training runs, evaluation gates, registry
   promotion, rollback, and drift-triggered retraining.
7. **Product hardening:** replace frontend mock pages with API-backed query
   states, add authorization scopes for corpus/MLOps actions, background
   workers for long jobs, migrations, observability, and end-to-end tests.

## Preservation and replacement rules

Preserve existing auth, storage safety checks, text model artifacts, corpus
sync, MLOps service contracts, and v1 routes until clients migrate. Replace
duplicated capability maps, demo data in production paths, silent inference
fallbacks, and direct LLM-generated verdicts. Introduce migrations before
changing deployed schemas; `create_all` remains a local-development safety
net only.
