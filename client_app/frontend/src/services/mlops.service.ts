import api from '../lib/axios'
import type {
  Dataset,
  DatasetVersion,
  Model,
  ModelVersion,
  TrainingJob,
  AuditLogEntry,
  ModelComparisonData,
} from '../types/mlops'

// ─── Raw API response types (matching backend schemas) ────────────────────────

interface RawDatasetCandidate {
  id: string
  name: string
  description: string | null
  media_type: string
  sample_count: number
  checksum: string | null
  approval_status: string
  quality_score: number | null
  validation_report: Record<string, unknown> | null
  created_by: string
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string
}

interface RawTrainingJob {
  id: string
  job_id: string
  model_id: string
  dataset_candidate_id: string
  trigger_id: string | null
  status: string
  base_model_version: string | null
  hyperparameters: Record<string, unknown> | null
  compute_config: Record<string, unknown> | null
  config_snapshot: Record<string, unknown> | null
  queued_at: string
  started_at: string | null
  completed_at: string | null
  error_message: string | null
  artifact_location: string | null
  logs_location: string | null
  created_at: string
  updated_at: string
}

interface RawModelVersion {
  id: string
  model_id: string
  from_version_id: string | null
  to_version_id: string
  action: string
  from_stage: string
  to_stage: string
  reason: string | null
  performed_by: string
  created_at: string
  updated_at: string
}

interface RawAuditLog {
  id: string
  action: string
  resource_type: string
  resource_id: string | null
  user_id: string | null
  details: Record<string, unknown> | null
  ip_address: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

// ─── Mappers: Backend → Frontend types ────────────────────────────────────────

function mapDataset(raw: RawDatasetCandidate): Dataset {
  const mediaType = raw.media_type || 'unknown'
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || '',
    status: raw.approval_status === 'approved' ? 'active' : 'stale',
    currentVersion: 'v1.0.0',
    totalSamples: raw.sample_count,
    modalities: {
      text: mediaType === 'text' ? raw.sample_count : 0,
      image: mediaType === 'image' ? raw.sample_count : 0,
      audio: mediaType === 'audio' ? raw.sample_count : 0,
      video: mediaType === 'video' ? raw.sample_count : 0,
      document: mediaType === 'document' ? raw.sample_count : 0,
    },
    languages: [],
    quality: {
      totalSamples: raw.sample_count,
      labeledSamples: 0,
      unlabeledSamples: raw.sample_count,
      averageQualityScore: raw.quality_score ?? 0,
      duplicateRate: 0,
      errorRate: 0,
    },
    latestChange: raw.description || 'No recent changes',
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    versions: [],
  }
}

function mapTrainingJob(raw: RawTrainingJob): TrainingJob {
  const statusMap: Record<string, TrainingJob['status']> = {
    queued: 'queued',
    running: 'running',
    evaluating: 'running',
    succeeded: 'completed',
    completed: 'completed',
    failed: 'failed',
    cancelled: 'failed',
  }

  const hp = raw.hyperparameters || {}

  return {
    id: raw.id,
    modelId: raw.model_id,
    modelName: raw.model_id,
    modelVersion: raw.base_model_version || 'unknown',
    datasetId: raw.dataset_candidate_id,
    datasetName: raw.dataset_candidate_id,
    datasetVersion: 'v1.0.0',
    status: statusMap[raw.status] || 'queued',
    startTime: raw.started_at || raw.queued_at,
    endTime: raw.completed_at || undefined,
    duration:
      raw.completed_at && raw.started_at
        ? formatDuration(new Date(raw.completed_at).getTime() - new Date(raw.started_at).getTime())
        : undefined,
    error: raw.error_message || undefined,
    triggeredBy: 'system',
    config: {
      epochs: (hp['epochs'] as number) || 0,
      learningRate: (hp['learning_rate'] as number) || 0,
      batchSize: (hp['batch_size'] as number) || 0,
      optimizer: (hp['optimizer'] as string) || 'unknown',
    },
  }
}

function formatDuration(ms: number): string {
  if (ms < 0) return '0m'
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

function mapAuditLog(raw: RawAuditLog): AuditLogEntry {
  const eventMap: Record<string, AuditLogEntry['event']> = {
    dataset_created: 'dataset_created',
    dataset_updated: 'dataset_updated',
    dataset_approved: 'dataset_version_created',
    training_initiated: 'training_triggered',
    training_completed: 'training_completed',
    training_failed: 'training_failed',
    model_promoted: 'model_promoted',
    model_rolled_back: 'model_rolled_back',
    model_evaluated: 'model_evaluated',
    annotation_added: 'corpus_item_approved',
  }

  return {
    id: raw.id,
    event: eventMap[raw.action] || 'dataset_created',
    timestamp: raw.created_at,
    userId: raw.user_id || 'system',
    username: raw.user_id || 'unknown',
    userRole: 'admin',
    targetType: (raw.resource_type as AuditLogEntry['targetType']) || 'system',
    targetId: raw.resource_id || '',
    targetName: raw.resource_type,
    details: raw.details || {},
  }
}

// ─── Raw types for models_v2 and datasets endpoints ──────────────────────────

interface RawModel {
  id: string
  name: string
  description: string | null
  media_type: string
  architecture: string | null
  is_active: boolean
  created_at: string
}

interface RawModelVersionV2 {
  id: string
  model_id: string
  version: string
  status: string
  accuracy: number | null
  f1_score: number | null
  precision_score: number | null
  recall_score: number | null
  trained_at: string | null
  created_at: string
}

interface RawDatasetV2 {
  id: string
  name: string
  description: string | null
  media_type: string
  is_active: boolean
  created_at: string
}

interface RawDatasetVersion {
  id: string
  dataset_id: string
  version: string
  description: string | null
  sample_count: number
  checksum: string | null
  created_at: string
}

function mapModelFromV2(raw: RawModel, versions: Model['versions']): Model {
  const prodVersion = versions.find((v) => v.status === 'production')
  return {
    id: raw.id,
    name: raw.name,
    task: raw.description || 'Unknown Task',
    modality: (raw.media_type as Model['modality']) || 'text',
    currentProductionVersion: prodVersion?.version || '',
    candidateVersions: versions.filter((v) => v.status === 'staging').map((v) => v.version),
    versions,
    datasetName: 'Unknown',
    createdAt: raw.created_at,
    updatedAt: raw.created_at,
  }
}

function mapModelVersionFromV2(raw: RawModelVersionV2): ModelVersion {
  return {
    id: raw.id,
    version: raw.version,
    status: raw.status as ModelVersion['status'],
    datasetVersion: 'v1.0.0',
    trainingRunId: '',
    metrics: {
      accuracy: raw.accuracy ?? 0,
      precision: raw.precision_score ?? 0,
      recall: raw.recall_score ?? 0,
      f1Score: raw.f1_score ?? 0,
    },
    createdAt: raw.created_at,
    lastEvaluatedAt: raw.trained_at || raw.created_at,
    changelog: '',
  }
}

function mapDatasetFromV2(raw: RawDatasetV2, versions: DatasetVersion[]): Dataset {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description || '',
    status: raw.is_active ? 'active' : 'stale',
    currentVersion: versions.length > 0 ? versions[0].version : 'N/A',
    totalSamples: versions.reduce((sum, v) => sum + v.sampleCount, 0),
    modalities: { text: 0, image: 0, audio: 0, video: 0, document: 0 },
    languages: [],
    quality: {
      totalSamples: versions.reduce((sum, v) => sum + v.sampleCount, 0),
      labeledSamples: 0,
      unlabeledSamples: 0,
      averageQualityScore: 0,
      duplicateRate: 0,
      errorRate: 0,
    },
    latestChange: raw.description || 'No recent changes',
    createdAt: raw.created_at,
    updatedAt: raw.created_at,
    versions,
  }
}

function mapDatasetVersionFromV2(raw: RawDatasetVersion): DatasetVersion {
  return {
    id: raw.id,
    version: raw.version,
    createdAt: raw.created_at,
    createdBy: 'system',
    sampleCount: raw.sample_count,
    preprocessingVersion: 'N/A',
    annotationStatus: 'complete',
    validationStatus: 'passed',
    changesFromPrevious: raw.description || '',
    changelog: raw.description || '',
  }
}

// ─── API Service ─────────────────────────────────────────────────────────────

export const mlopsService = {
  /** List all dataset candidates */
  async listDatasets(params?: {
    status?: string
    mediaType?: string
    limit?: number
    offset?: number
  }): Promise<Dataset[]> {
    const queryParams = new URLSearchParams()
    if (params?.status) queryParams.set('status', params.status)
    if (params?.mediaType) queryParams.set('media_type', params.mediaType)
    if (params?.limit) queryParams.set('limit', String(params.limit))
    if (params?.offset) queryParams.set('offset', String(params.offset))

    const qs = queryParams.toString()
    const response = await api.get<RawDatasetCandidate[]>(
      `/mlops/datasets/candidates${qs ? `?${qs}` : ''}`,
    )
    return (response.data || []).map(mapDataset)
  },

  /** Get a single dataset candidate */
  async getDataset(candidateId: string): Promise<Dataset | null> {
    try {
      const response = await api.get<RawDatasetCandidate>(
        `/mlops/datasets/candidates/${candidateId}`,
      )
      return mapDataset(response.data)
    } catch {
      return null
    }
  },

  /** List training jobs */
  async listTrainingJobs(params?: {
    status?: string
    modelId?: string
    limit?: number
    offset?: number
  }): Promise<TrainingJob[]> {
    const queryParams = new URLSearchParams()
    if (params?.status) queryParams.set('status', params.status)
    if (params?.modelId) queryParams.set('model_id', params.modelId)
    if (params?.limit) queryParams.set('limit', String(params.limit))
    if (params?.offset) queryParams.set('offset', String(params.offset))

    const qs = queryParams.toString()
    const response = await api.get<RawTrainingJob[]>(`/mlops/jobs${qs ? `?${qs}` : ''}`)
    return (response.data || []).map(mapTrainingJob)
  },

  /** Get a single training job */
  async getTrainingJob(jobId: string): Promise<TrainingJob | null> {
    try {
      const response = await api.get<RawTrainingJob>(`/mlops/jobs/${jobId}`)
      return mapTrainingJob(response.data)
    } catch {
      return null
    }
  },

  /** Get training job counts by status */
  async getTrainingJobCounts(): Promise<Record<string, number>> {
    try {
      const response = await api.get<Record<string, number>>('/mlops/jobs/counts')
      return response.data || {}
    } catch {
      return {}
    }
  },

  /** List model versions for a given model */
  async listModelVersions(modelId: string, status?: string): Promise<RawModelVersion[]> {
    const qs = status ? `?status=${status}` : ''
    const response = await api.get<RawModelVersion[]>(`/mlops/models/${modelId}/versions${qs}`)
    return response.data || []
  },

  /** Get all models (aggregated from evaluations and versions) */
  async listModels(): Promise<Model[]> {
    // The backend doesn't have a dedicated models list endpoint.
    // We construct model list from evaluation data and known model IDs.
    // For now, return empty array and let pages handle gracefully.
    try {
      const evaluations = await api.get<
        Array<{ model_version_id: string; training_metrics: Record<string, unknown> | null }>
      >('/mlops/evaluations', { params: { limit: 100 } })

      // Group by model_version_id to discover model IDs
      const modelIds = new Set<string>()
      for (const ev of evaluations.data || []) {
        const parts = ev.model_version_id.split(':')
        if (parts.length > 0) modelIds.add(parts[0])
      }

      const models: Model[] = []
      for (const modelId of modelIds) {
        try {
          const versions = await this.listModelVersions(modelId)
          const prodVersion = versions.find((v) => v.to_stage === 'production')
          const candidateVersions = versions
            .filter((v) => v.to_stage === 'staging')
            .map((v) => v.to_version_id)

          const modelVersions = versions.map((v) => ({
            id: v.id,
            version: v.to_version_id,
            status: v.to_stage as Model['versions'][0]['status'],
            datasetVersion: 'v1.0.0',
            trainingRunId: v.from_version_id || '',
            metrics: {
              accuracy: 0,
              precision: 0,
              recall: 0,
              f1Score: 0,
            },
            createdAt: v.created_at,
            lastEvaluatedAt: v.updated_at,
            promotedAt: v.action === 'promote' ? v.created_at : undefined,
            promotedBy: v.performed_by,
            changelog: v.reason || '',
          }))

          models.push({
            id: modelId,
            name: modelId,
            task: 'Unknown Task',
            modality: 'text',
            currentProductionVersion: prodVersion?.to_version_id || '',
            candidateVersions,
            versions: modelVersions,
            datasetName: 'Unknown',
            createdAt: versions[0]?.created_at || new Date().toISOString(),
            updatedAt: versions[0]?.updated_at || new Date().toISOString(),
          })
        } catch {
          // Skip models that fail to load versions
        }
      }

      return models
    } catch {
      return []
    }
  },

  /** List model evaluations */
  async listEvaluations(params?: {
    trainingJobId?: string
    approvalStatus?: string
    limit?: number
    offset?: number
  }): Promise<unknown[]> {
    const queryParams = new URLSearchParams()
    if (params?.trainingJobId) queryParams.set('training_job_id', params.trainingJobId)
    if (params?.approvalStatus) queryParams.set('approval_status', params.approvalStatus)
    if (params?.limit) queryParams.set('limit', String(params.limit))
    if (params?.offset) queryParams.set('offset', String(params.offset))

    const qs = queryParams.toString()
    const response = await api.get(`/mlops/evaluations${qs ? `?${qs}` : ''}`)
    return response.data || []
  },

  /** Get pipeline status overview */
  async getPipelineStatus(): Promise<{
    datasetCandidates: number
    pendingApprovals: number
    activeTrainingJobs: number
    completedTrainingJobs: number
    failedTrainingJobs: number
    modelsInStaging: number
    modelsInProduction: number
    driftAlerts: number
    activeLearningPending: number
  }> {
    try {
      const response = await api.get<Record<string, unknown>>('/mlops/pipeline/status')
      const d = response.data
      return {
        datasetCandidates: (d['dataset_candidates'] as number) || 0,
        pendingApprovals: (d['pending_approvals'] as number) || 0,
        activeTrainingJobs: (d['active_training_jobs'] as number) || 0,
        completedTrainingJobs: (d['completed_training_jobs'] as number) || 0,
        failedTrainingJobs: (d['failed_training_jobs'] as number) || 0,
        modelsInStaging: (d['models_in_staging'] as number) || 0,
        modelsInProduction: (d['models_in_production'] as number) || 0,
        driftAlerts: (d['drift_alerts'] as number) || 0,
        activeLearningPending: (d['active_learning_pending'] as number) || 0,
      }
    } catch {
      return {
        datasetCandidates: 0,
        pendingApprovals: 0,
        activeTrainingJobs: 0,
        completedTrainingJobs: 0,
        failedTrainingJobs: 0,
        modelsInStaging: 0,
        modelsInProduction: 0,
        driftAlerts: 0,
        activeLearningPending: 0,
      }
    }
  },

  /** Get audit logs */
  async listAuditLogs(params?: {
    action?: string
    resourceType?: string
    resourceId?: string
    userId?: string
    limit?: number
    offset?: number
  }): Promise<AuditLogEntry[]> {
    const queryParams = new URLSearchParams()
    if (params?.action) queryParams.set('action', params.action)
    if (params?.resourceType) queryParams.set('resource_type', params.resourceType)
    if (params?.resourceId) queryParams.set('resource_id', params.resourceId)
    if (params?.userId) queryParams.set('user_id', params.userId)
    if (params?.limit) queryParams.set('limit', String(params.limit))
    if (params?.offset) queryParams.set('offset', String(params.offset))

    const qs = queryParams.toString()
    const response = await api.get<RawAuditLog[]>(`/mlops/audit/logs${qs ? `?${qs}` : ''}`)
    return (response.data || []).map(mapAuditLog)
  },

  /** Compare a candidate with production model */
  async compareWithProduction(evaluationId: string): Promise<ModelComparisonData | null> {
    try {
      const response = await api.get<{
        production: RawModelVersion
        candidate: RawModelVersion
        metrics_comparison: Array<{
          metric: string
          production: number
          candidate: number
          delta: number
          winner: string
        }>
      }>(`/mlops/evaluations/${evaluationId}/compare`)

      const data = response.data
      return {
        production: {
          id: data.production.id,
          version: data.production.to_version_id,
          status: 'production',
          datasetVersion: 'v1.0.0',
          trainingRunId: data.production.from_version_id || '',
          metrics: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
          createdAt: data.production.created_at,
          lastEvaluatedAt: data.production.updated_at,
          changelog: data.production.reason || '',
        },
        candidate: {
          id: data.candidate.id,
          version: data.candidate.to_version_id,
          status: 'staging',
          datasetVersion: 'v1.0.0',
          trainingRunId: data.candidate.from_version_id || '',
          metrics: { accuracy: 0, precision: 0, recall: 0, f1Score: 0 },
          createdAt: data.candidate.created_at,
          lastEvaluatedAt: data.candidate.updated_at,
          changelog: data.candidate.reason || '',
        },
        metricsComparison: (data.metrics_comparison || []).map((m) => ({
          metric: m.metric,
          production: m.production,
          candidate: m.candidate,
          delta: m.delta,
          winner: m.winner as 'production' | 'candidate' | 'tie',
        })),
      }
    } catch {
      return null
    }
  },

  /** Get a single model from the models_v2 endpoint */
  async getModel(modelId: string): Promise<Model | null> {
    try {
      const response = await api.get<RawModel>(`/models/${modelId}`)
      const raw = response.data
      const versionsResp = await api.get<RawModelVersionV2[]>(`/models/${modelId}/versions`)
      const versions = (versionsResp.data || []).map(mapModelVersionFromV2)
      return mapModelFromV2(raw, versions)
    } catch {
      return null
    }
  },

  /** List all models from the models_v2 endpoint */
  async listModelsV2(): Promise<Model[]> {
    try {
      const response = await api.get<{ items: RawModel[] }>('/models/')
      const rawModels = response.data.items || []
      const models: Model[] = []
      for (const raw of rawModels) {
        try {
          const versionsResp = await api.get<RawModelVersionV2[]>(`/models/${raw.id}/versions`)
          const versions = (versionsResp.data || []).map(mapModelVersionFromV2)
          models.push(mapModelFromV2(raw, versions))
        } catch {
          models.push(mapModelFromV2(raw, []))
        }
      }
      return models
    } catch {
      return []
    }
  },

  /** List dataset versions from the datasets endpoint */
  async listDatasetVersions(datasetId: string): Promise<DatasetVersion[]> {
    try {
      const response = await api.get<RawDatasetVersion[]>(`/datasets/${datasetId}/versions`)
      return (response.data || []).map(mapDatasetVersionFromV2)
    } catch {
      return []
    }
  },

  /** Get a single dataset from the datasets endpoint */
  async getDatasetDetail(datasetId: string): Promise<Dataset | null> {
    try {
      const response = await api.get<RawDatasetV2>(`/datasets/${datasetId}`)
      const raw = response.data
      const versions = await this.listDatasetVersions(datasetId)
      return mapDatasetFromV2(raw, versions)
    } catch {
      return null
    }
  },

  /** Promote a model version to production */
  async promoteModel(modelId: string, versionId: string, reason: string): Promise<boolean> {
    try {
      await api.post(`/mlops/promotions/${modelId}/to-production/${versionId}`, null, {
        params: { reason },
      })
      return true
    } catch {
      return false
    }
  },

  /** Rollback a model to a previous version */
  async rollbackModel(modelId: string, targetVersionId: string, reason: string): Promise<boolean> {
    try {
      await api.post('/mlops/rollbacks', {
        model_id: modelId,
        target_version_id: targetVersionId,
        reason,
      })
      return true
    } catch {
      return false
    }
  },
}
