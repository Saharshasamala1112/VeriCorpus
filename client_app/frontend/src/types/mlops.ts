import type { MediaType } from '../config/media-registry'

// ─── Roles ──────────────────────────────────────────────────────────────────

export type MLOpsRole = 'admin' | 'ml_engineer' | 'reviewer' | 'annotator'

export const AUTHORIZED_ROLES_FOR_PROMOTION: MLOpsRole[] = ['admin', 'ml_engineer']
export const AUTHORIZED_ROLES_FOR_ROLLBACK: MLOpsRole[] = ['admin']
export const AUTHORIZED_ROLES_FOR_MLOPS: MLOpsRole[] = ['admin', 'ml_engineer', 'reviewer']

// ─── Dataset ────────────────────────────────────────────────────────────────

export type DatasetStatus = 'active' | 'stale' | 'archived' | 'syncing'

export interface DatasetModalityDistribution {
  text: number
  image: number
  audio: number
  video: number
  document: number
}

export interface DatasetLanguageDistribution {
  language: string
  count: number
  percentage: number
}

export interface DatasetQualityStats {
  totalSamples: number
  labeledSamples: number
  unlabeledSamples: number
  averageQualityScore: number
  duplicateRate: number
  errorRate: number
}

export interface DatasetVersion {
  id: string
  version: string
  createdAt: string
  createdBy: string
  sampleCount: number
  preprocessingVersion: string
  annotationStatus: 'complete' | 'in_progress' | 'pending'
  validationStatus: 'passed' | 'failed' | 'pending'
  changesFromPrevious: string
  changelog: string
}

export interface Dataset {
  id: string
  name: string
  description: string
  status: DatasetStatus
  currentVersion: string
  totalSamples: number
  modalities: DatasetModalityDistribution
  languages: DatasetLanguageDistribution[]
  quality: DatasetQualityStats
  latestChange: string
  createdAt: string
  updatedAt: string
  versions: DatasetVersion[]
}

// ─── Model ──────────────────────────────────────────────────────────────────

export type ModelStatus = 'production' | 'staging' | 'development' | 'archived'
export type TrainingStatus = 'queued' | 'running' | 'completed' | 'failed'

export interface ModelMetrics {
  accuracy: number
  precision: number
  recall: number
  f1Score: number
  aucRoc?: number
  loss?: number
  confusionMatrix?: {
    truePositive: number
    falsePositive: number
    trueNegative: number
    falseNegative: number
  }
}

export interface ModelVersion {
  id: string
  version: string
  status: ModelStatus
  datasetVersion: string
  trainingRunId: string
  metrics: ModelMetrics
  createdAt: string
  lastEvaluatedAt: string
  promotedAt?: string
  promotedBy?: string
  changelog: string
}

export interface Model {
  id: string
  name: string
  task: string
  modality: MediaType
  currentProductionVersion: string
  candidateVersions: string[]
  versions: ModelVersion[]
  datasetName: string
  createdAt: string
  updatedAt: string
}

// ─── Training ───────────────────────────────────────────────────────────────

export interface TrainingJob {
  id: string
  modelId: string
  modelName: string
  modelVersion: string
  datasetId: string
  datasetName: string
  datasetVersion: string
  status: TrainingStatus
  startTime: string
  endTime?: string
  duration?: string
  metrics?: ModelMetrics
  error?: string
  triggeredBy: string
  config: {
    epochs: number
    learningRate: number
    batchSize: number
    optimizer: string
  }
}

// ─── Audit Log ──────────────────────────────────────────────────────────────

export type AuditEvent =
  | 'dataset_created'
  | 'dataset_updated'
  | 'dataset_version_created'
  | 'dataset_version_validated'
  | 'corpus_item_approved'
  | 'corpus_item_rejected'
  | 'training_triggered'
  | 'training_started'
  | 'training_completed'
  | 'training_failed'
  | 'model_created'
  | 'model_promoted'
  | 'model_rolled_back'
  | 'model_evaluated'
  | 'model_archived'

export interface AuditLogEntry {
  id: string
  event: AuditEvent
  timestamp: string
  userId: string
  username: string
  userRole: MLOpsRole
  targetType: 'dataset' | 'model' | 'training_job' | 'system'
  targetId: string
  targetName: string
  details: Record<string, unknown>
  ipAddress?: string
}

// ─── Comparison ─────────────────────────────────────────────────────────────

export interface ModelComparisonData {
  production: ModelVersion
  candidate: ModelVersion
  metricsComparison: {
    metric: string
    production: number
    candidate: number
    delta: number
    winner: 'production' | 'candidate' | 'tie'
  }[]
}

// ─── Promotion / Rollback ───────────────────────────────────────────────────

export interface PromotionAction {
  modelId: string
  versionId: string
  performedBy: string
  timestamp: string
  reason: string
  auditLogId: string
}

export interface RollbackAction {
  modelId: string
  fromVersionId: string
  toVersionId: string
  performedBy: string
  timestamp: string
  reason: string
  auditLogId: string
}
