import type { MediaType } from '../config/media-registry'

// ─── Pipeline Stages ─────────────────────────────────────────────────────────

export type PipelineStage =
  | 'new_data'
  | 'validation'
  | 'sanitization'
  | 'quality_check'
  | 'duplicate_check'
  | 'label_annotation'
  | 'corpus'
  | 'dataset_version'
  | 'training_queue'
  | 'train'
  | 'validate'
  | 'test'
  | 'calibrate'
  | 'compare'
  | 'candidate_model'
  | 'staging'
  | 'promotion'
  | 'production'

export const PIPELINE_STAGES: PipelineStage[] = [
  'new_data',
  'validation',
  'sanitization',
  'quality_check',
  'duplicate_check',
  'label_annotation',
  'corpus',
  'dataset_version',
  'training_queue',
  'train',
  'validate',
  'test',
  'calibrate',
  'compare',
  'candidate_model',
  'staging',
  'promotion',
  'production',
]

// ─── Trigger Types ───────────────────────────────────────────────────────────

export type TriggerType =
  | 'scheduled'
  | 'new_data_threshold'
  | 'dataset_version'
  | 'significant_growth'
  | 'drift_detection'
  | 'feedback_threshold'
  | 'manual'

export const TRIGGER_TYPE_LABELS: Record<TriggerType, string> = {
  scheduled: 'Scheduled',
  new_data_threshold: 'New Data Threshold',
  dataset_version: 'Dataset Version',
  significant_growth: 'Significant Growth',
  drift_detection: 'Drift Detection',
  feedback_threshold: 'Feedback Threshold',
  manual: 'Manual',
}

export type TriggerStatus = 'active' | 'paused' | 'fired' | 'cooldown'

export interface TrainingTrigger {
  id: string
  type: TriggerType
  status: TriggerStatus
  name: string
  description: string
  config: Record<string, unknown>
  lastFiredAt: string | null
  nextFireAt: string | null
  firedCount: number
  cooldownMinutes: number
  createdAt: string
  updatedAt: string
}

// ─── Training Job ────────────────────────────────────────────────────────────

export type TrainingJobStatus =
  | 'queued'
  | 'preprocessing'
  | 'training'
  | 'evaluating'
  | 'comparing'
  | 'calibrating'
  | 'staging'
  | 'promoting'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

export interface TrainingRunRecord {
  datasetVersion: string
  codeVersion: string
  preprocessingVersion: string
  modelArchitecture: string
  hyperparameters: Record<string, unknown>
  randomSeed: number
  trainingStart: string
  trainingEnd: string | null
  metrics: Record<string, number>
  artifacts: string[]
  environment: Record<string, string>
  parentModelVersion: string | null
}

export interface TrainingJob {
  id: string
  triggerId: string | null
  triggerType: TriggerType | null
  modelId: string
  modelName: string
  datasetId: string
  datasetName: string
  datasetVersion: string
  status: TrainingJobStatus
  pipelineStage: PipelineStage
  progress: number
  run: TrainingRunRecord | null
  error: string | null
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

// ─── Dataset Version ─────────────────────────────────────────────────────────

export type DatasetValidationStatus = 'passed' | 'failed' | 'pending'

export interface DatasetVersionRecord {
  id: string
  datasetId: string
  version: string
  description: string
  sampleCount: number
  checksum: string
  validationStatus: DatasetValidationStatus
  annotationStatus: 'complete' | 'in_progress' | 'pending'
  preprocessingVersion: string
  qualityScore: number
  duplicateRate: number
  modalityDistribution: Record<MediaType, number>
  languageDistribution: Record<string, number>
  sealedAt: string | null
  createdBy: string
  createdAt: string
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

export type EvaluationSplit =
  'train' | 'validation' | 'test' | 'golden_test' | 'regression' | 'drift'

export interface EvaluationMetrics {
  accuracy: number
  precision: number
  recall: number
  f1Score: number
  aucRoc?: number
  loss?: number
  calibrationError?: number
  confusionMatrix?: {
    truePositive: number
    falsePositive: number
    trueNegative: number
    falseNegative: number
  }
}

export interface PerModalityMetrics {
  modality: MediaType
  metrics: EvaluationMetrics
  sampleCount: number
}

export interface PerLanguageMetrics {
  language: string
  metrics: EvaluationMetrics
  sampleCount: number
}

export interface PerClassMetrics {
  className: string
  metrics: EvaluationMetrics
  sampleCount: number
}

export interface CalibrationMetrics {
  expectedCalibrationError: number
  maximumCalibrationError: number
  brierScore: number
  reliabilityDiagram: Array<{ predicted: number; observed: number; count: number }>
}

export interface EvaluationRun {
  id: string
  trainingJobId: string
  modelVersionId: string
  datasetVersionId: string
  split: EvaluationSplit
  metrics: EvaluationMetrics
  perModality: PerModalityMetrics[]
  perLanguage: PerLanguageMetrics[]
  perClass: PerClassMetrics[]
  calibration: CalibrationMetrics
  falsePositiveRate: number
  falseNegativeRate: number
  regressionDetected: boolean
  regressionDetails: string[]
  passedGates: boolean
  gateResults: QualityGateResult[]
  createdAt: string
}

// ─── Quality Gates ───────────────────────────────────────────────────────────

export interface QualityGate {
  id: string
  name: string
  metric: string
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'
  threshold: number
  split: EvaluationSplit
  required: boolean
  description: string
}

export interface QualityGateResult {
  gateId: string
  gateName: string
  metric: string
  actual: number
  threshold: number
  operator: string
  passed: boolean
  required: boolean
}

// ─── Model Candidate ─────────────────────────────────────────────────────────

export type CandidateStatus =
  'evaluating' | 'gate_check' | 'comparison' | 'staging' | 'verified' | 'promoted' | 'rejected'

export interface ModelCandidate {
  id: string
  modelId: string
  modelName: string
  version: string
  parentVersion: string | null
  status: CandidateStatus
  evaluationRunId: string
  evaluationRun: EvaluationRun | null
  comparison: ModelComparison | null
  rejectionReason: string | null
  promotedAt: string | null
  promotedBy: string | null
  createdAt: string
  updatedAt: string
}

// ─── Model Comparison ────────────────────────────────────────────────────────

export type ComparisonWinner = 'production' | 'candidate' | 'tie'

export interface MetricComparison {
  metric: string
  production: number
  candidate: number
  delta: number
  percentageDelta: number
  winner: ComparisonWinner
  requiredForPromotion: boolean
}

export interface ModalityComparison {
  modality: MediaType
  metrics: MetricComparison[]
  overallWinner: ComparisonWinner
}

export interface ModelComparison {
  id: string
  candidateId: string
  productionVersionId: string
  candidateVersionId: string
  overallWinner: ComparisonWinner
  overallScoreDelta: number
  metricsComparison: MetricComparison[]
  perModalityComparison: ModalityComparison[]
  falsePositiveDelta: number
  falseNegativeDelta: number
  calibrationDelta: number
  regressionDetected: boolean
  regressionDetails: string[]
  promotionRecommendation: 'promote' | 'reject' | 'needs_review'
  createdAt: string
}

// ─── Promotion ───────────────────────────────────────────────────────────────

export type PromotionStatus = 'pending' | 'staging' | 'verified' | 'promoted' | 'rolled_back'

export interface PromotionRecord {
  id: string
  modelId: string
  candidateVersionId: string
  previousProductionVersionId: string
  status: PromotionStatus
  reason: string
  performedBy: string
  verifiedAt: string | null
  verifiedBy: string | null
  promotedAt: string | null
  rolledBackAt: string | null
  rollbackReason: string | null
  createdAt: string
}

// ─── Drift ───────────────────────────────────────────────────────────────────

export type DriftSeverity = 'none' | 'low' | 'medium' | 'high' | 'critical'

export interface DriftMetric {
  metric: string
  baseline: number
  current: number
  driftScore: number
  threshold: number
  severity: DriftSeverity
}

export interface DriftSnapshot {
  id: string
  modelId: string
  modelVersionId: string
  overallDriftScore: number
  overallSeverity: DriftSeverity
  metrics: DriftMetric[]
  sampleCount: number
  createdAt: string
}

// ─── Active Learning ─────────────────────────────────────────────────────────

export type ActiveLearningStrategy = 'low_confidence' | 'disagreement' | 'priority' | 'random'

export type AnnotationStatus = 'pending' | 'annotated' | 'skipped' | 'disputed'

export interface ActiveLearningCandidate {
  id: string
  mediaType: MediaType
  content: string
  contentPreview: string
  confidence: number
  modelPrediction: string
  groundTruth: string | null
  strategy: ActiveLearningStrategy
  priority: number
  status: AnnotationStatus
  annotation: string | null
  annotatedBy: string | null
  annotatedAt: string | null
  createdAt: string
}

// ─── Orchestrator State ──────────────────────────────────────────────────────

export interface LifelongLearningState {
  triggers: TrainingTrigger[]
  jobs: TrainingJob[]
  datasetVersions: DatasetVersionRecord[]
  candidates: ModelCandidate[]
  promotions: PromotionRecord[]
  driftSnapshots: DriftSnapshot[]
  activeLearningCandidates: ActiveLearningCandidate[]
  pipelineStatus: Record<PipelineStage, number>
  overallHealth: 'healthy' | 'degraded' | 'critical'
  lastTrainingAt: string | null
  nextScheduledTraining: string | null
  totalModelsInProduction: number
  totalDatasets: number
  totalTrainingJobs: number
  totalEvaluationRuns: number
}

// ─── Quality Gate Defaults ───────────────────────────────────────────────────

export const DEFAULT_QUALITY_GATES: QualityGate[] = [
  {
    id: 'accuracy_min',
    name: 'Minimum Accuracy',
    metric: 'accuracy',
    operator: 'gte',
    threshold: 0.85,
    split: 'golden_test',
    required: true,
    description: 'Model must achieve at least 85% accuracy on golden test set',
  },
  {
    id: 'f1_min',
    name: 'Minimum F1 Score',
    metric: 'f1Score',
    operator: 'gte',
    threshold: 0.8,
    split: 'golden_test',
    required: true,
    description: 'Model must achieve at least 80% F1 score on golden test set',
  },
  {
    id: 'regression_check',
    name: 'No Regression',
    metric: 'accuracy',
    operator: 'gte',
    threshold: 0,
    split: 'regression',
    required: true,
    description: 'Candidate must not regress more than 0% vs production on regression test set',
  },
  {
    id: 'calibration_max',
    name: 'Calibration Error',
    metric: 'calibrationError',
    operator: 'lte',
    threshold: 0.1,
    split: 'test',
    required: false,
    description: 'Expected calibration error must be below 0.1',
  },
  {
    id: 'drift_max',
    name: 'Drift Tolerance',
    metric: 'driftScore',
    operator: 'lte',
    threshold: 0.15,
    split: 'drift',
    required: false,
    description: 'Drift score must be below 0.15',
  },
]
