import type { MediaType } from '../config/media-registry'

// ─── Model Status Lifecycle ──────────────────────────────────────────────────

export type ModelLifecycleStatus =
  | 'NOT_CONFIGURED'
  | 'INITIALIZING'
  | 'TRAINING'
  | 'TRAINED'
  | 'VALIDATING'
  | 'CANDIDATE'
  | 'STAGING'
  | 'PRODUCTION'
  | 'FAILED'
  | 'RETIRED'

export const MODEL_LIFECYCLE_ORDER: ModelLifecycleStatus[] = [
  'NOT_CONFIGURED',
  'INITIALIZING',
  'TRAINING',
  'TRAINED',
  'VALIDATING',
  'CANDIDATE',
  'STAGING',
  'PRODUCTION',
  'FAILED',
  'RETIRED',
]

export const VALID_STATUS_TRANSITIONS: Record<ModelLifecycleStatus, ModelLifecycleStatus[]> = {
  NOT_CONFIGURED: ['INITIALIZING', 'FAILED'],
  INITIALIZING: ['TRAINING', 'FAILED'],
  TRAINING: ['TRAINED', 'FAILED'],
  TRAINED: ['VALIDATING', 'FAILED'],
  VALIDATING: ['CANDIDATE', 'FAILED'],
  CANDIDATE: ['STAGING', 'RETIRED'],
  STAGING: ['PRODUCTION', 'CANDIDATE', 'RETIRED'],
  PRODUCTION: ['RETIRED', 'STAGING'],
  FAILED: ['INITIALIZING', 'RETIRED'],
  RETIRED: [],
}

// ─── Model Aliases (MLflow-compatible) ───────────────────────────────────────

export type ModelAlias =
  'development' | 'candidate' | 'staging' | 'production' | 'champion' | 'rollback'

export const MODEL_ALIAS_LABELS: Record<ModelAlias, string> = {
  development: 'Development',
  candidate: 'Candidate',
  staging: 'Staging',
  production: 'Production',
  champion: 'Champion',
  rollback: 'Rollback',
}

export const MODEL_ALIAS_COLORS: Record<ModelAlias, string> = {
  development: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  candidate: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
  staging: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  production: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  champion: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  rollback: 'bg-red-500/10 text-red-400 border-red-500/20',
}

// ─── Model Registry ──────────────────────────────────────────────────────────

export interface ModelRegistryEntry {
  id: string
  name: string
  description: string
  modality: MediaType
  architecture: string
  framework: string
  tags: Record<string, string>
  aliases: ModelAlias[]
  createdAt: string
  updatedAt: string
  createdBy: string
}

// ─── Model Version ───────────────────────────────────────────────────────────

export interface ModelVersionRecord {
  id: string
  modelId: string
  version: string
  name: string
  modality: MediaType
  architecture: string
  datasetVersion: string
  preprocessingVersion: string
  tokenizerVersion: string | null
  embeddingVersion: string | null
  trainingRunId: string
  checkpoint: string | null
  artifactUri: string
  evaluationRunId: string | null
  calibration: CalibrationData | null
  status: ModelLifecycleStatus
  createdBy: string
  createdAt: string
  deployment: DeploymentInfo | null
  retirementAt: string | null
  aliases: ModelAlias[]
  tags: Record<string, string>
  metrics: ModelMetrics
  parentVersion: string | null
  changelog: string
}

export interface CalibrationData {
  expectedCalibrationError: number
  maximumCalibrationError: number
  brierScore: number
  reliabilityDiagram: Array<{ predicted: number; observed: number; count: number }>
}

export interface DeploymentInfo {
  deployedAt: string
  deployedBy: string
  endpoint: string
  environment: string
  replicas: number
  lastHealthCheck: string
  healthStatus: 'healthy' | 'degraded' | 'unhealthy'
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

export interface ModelMetrics {
  accuracy: number
  precision: number
  recall: number
  f1Score: number
  aucRoc?: number
  loss?: number
  calibrationError?: number
  confusionMatrix?: ConfusionMatrix
  perModality?: Record<MediaType, ModelMetrics>
  perLanguage?: Record<string, ModelMetrics>
  perClass?: Record<string, ModelMetrics>
}

export interface ConfusionMatrix {
  truePositive: number
  falsePositive: number
  trueNegative: number
  falseNegative: number
}

// ─── Experiment Tracking ─────────────────────────────────────────────────────

export interface ExperimentRun {
  id: string
  experimentName: string
  runName: string
  modelVersionId: string | null
  status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'KILLED'
  parameters: Record<string, unknown>
  metrics: Record<string, number>
  artifacts: ArtifactInfo[]
  tags: Record<string, string>
  gitCommit: string | null
  environment: Record<string, string>
  startTime: string
  endTime: string | null
  duration: number | null
  createdBy: string
}

export interface ArtifactInfo {
  name: string
  uri: string
  type: 'model' | 'data' | 'metric' | 'plot' | 'log' | 'config'
  size: number
  createdAt: string
}

// ─── Evaluation ──────────────────────────────────────────────────────────────

export interface EvaluationRun {
  id: string
  modelVersionId: string
  datasetVersionId: string
  split: 'train' | 'validation' | 'test' | 'golden_test' | 'regression' | 'drift'
  metrics: ModelMetrics
  calibration: CalibrationData
  falsePositiveRate: number
  falseNegativeRate: number
  regressionDetected: boolean
  regressionDetails: string[]
  passedGates: boolean
  gateResults: QualityGateResult[]
  createdAt: string
  createdBy: string
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

// ─── Model Comparison ────────────────────────────────────────────────────────

export interface ModelComparisonResult {
  id: string
  productionVersionId: string
  candidateVersionId: string
  overallWinner: 'production' | 'candidate' | 'tie'
  overallScoreDelta: number
  metricsComparison: MetricComparison[]
  perModalityComparison: Array<{
    modality: MediaType
    metrics: MetricComparison[]
    overallWinner: 'production' | 'candidate' | 'tie'
  }>
  falsePositiveDelta: number
  falseNegativeDelta: number
  calibrationDelta: number
  regressionDetected: boolean
  regressionDetails: string[]
  promotionRecommendation: 'promote' | 'reject' | 'needs_review'
  createdAt: string
}

export interface MetricComparison {
  metric: string
  production: number
  candidate: number
  delta: number
  percentageDelta: number
  winner: 'production' | 'candidate' | 'tie'
  requiredForPromotion: boolean
}

// ─── Promotion / Rollback ────────────────────────────────────────────────────

export interface PromotionRecord {
  id: string
  modelId: string
  candidateVersionId: string
  previousProductionVersionId: string
  status: 'pending' | 'staging' | 'verified' | 'promoted' | 'rolled_back'
  reason: string
  performedBy: string
  verifiedAt: string | null
  verifiedBy: string | null
  promotedAt: string | null
  rolledBackAt: string | null
  rollbackReason: string | null
  createdAt: string
}

// ─── Lineage ─────────────────────────────────────────────────────────────────

export interface ModelLineage {
  modelId: string
  versions: LineageNode[]
  edges: LineageEdge[]
}

export interface LineageNode {
  id: string
  version: string
  status: ModelLifecycleStatus
  datasetVersion: string
  parentVersion: string | null
  metrics: ModelMetrics
  createdAt: string
}

export interface LineageEdge {
  from: string
  to: string
  type: 'trained_from' | 'promoted_to' | 'rolled_back_to' | 'derived_from'
  label: string
  timestamp: string
}

// ─── Audit Log ───────────────────────────────────────────────────────────────

export type AuditAction =
  | 'model_created'
  | 'model_version_created'
  | 'model_status_changed'
  | 'model_trained'
  | 'model_evaluated'
  | 'model_promoted'
  | 'model_rolled_back'
  | 'model_retired'
  | 'model_artifact_uploaded'
  | 'model_alias_assigned'
  | 'model_alias_removed'
  | 'experiment_started'
  | 'experiment_completed'
  | 'experiment_failed'
  | 'deployment_created'
  | 'deployment_updated'
  | 'deployment_rolled_back'

export interface AuditLogEntry {
  id: string
  action: AuditAction
  resourceType: 'model' | 'model_version' | 'experiment' | 'deployment'
  resourceId: string
  resourceName: string
  userId: string
  username: string
  details: Record<string, unknown>
  ipAddress: string | null
  createdAt: string
}

// ─── Production Inference ────────────────────────────────────────────────────

export interface ProductionInferenceConfig {
  modelId: string
  activeVersionId: string
  activeVersion: string
  aliases: ModelAlias[]
  deployedAt: string
  endpoint: string
  environment: string
  fallbackVersionId: string | null
  fallbackVersion: string | null
  lastValidation: string
  validationPassed: boolean
  metrics: ModelMetrics
}

// ─── Status Display Config ───────────────────────────────────────────────────

export const STATUS_CONFIG: Record<
  ModelLifecycleStatus,
  { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; label: string; icon: string }
> = {
  NOT_CONFIGURED: { variant: 'default', label: 'Not Configured', icon: '⚙️' },
  INITIALIZING: { variant: 'info', label: 'Initializing', icon: '🔄' },
  TRAINING: { variant: 'info', label: 'Training', icon: '🏋️' },
  TRAINED: { variant: 'info', label: 'Trained', icon: '✅' },
  VALIDATING: { variant: 'warning', label: 'Validating', icon: '🔍' },
  CANDIDATE: { variant: 'info', label: 'Candidate', icon: '🤖' },
  STAGING: { variant: 'warning', label: 'Staging', icon: '📋' },
  PRODUCTION: { variant: 'success', label: 'Production', icon: '🟢' },
  FAILED: { variant: 'danger', label: 'Failed', icon: '❌' },
  RETIRED: { variant: 'default', label: 'Retired', icon: '🗄️' },
}
