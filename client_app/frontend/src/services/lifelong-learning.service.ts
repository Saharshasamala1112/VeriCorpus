import api from '../lib/axios'
import type {
  TrainingTrigger,
  TrainingJob,
  DatasetVersionRecord,
  ModelCandidate,
  PromotionRecord,
  DriftSnapshot,
  ActiveLearningCandidate,
  TriggerType,
  TrainingJobStatus,
  PipelineStage,
  EvaluationRun,
  QualityGateResult,
  EvaluationMetrics,
  CalibrationMetrics,
} from '../types/lifelong-learning'

// ─── Raw API Types ───────────────────────────────────────────────────────────

interface RawTrigger {
  id: string
  trigger_type: string
  status: string
  name: string
  description: string | null
  config: Record<string, unknown> | null
  last_fired_at: string | null
  next_fire_at: string | null
  fired_count: number
  cooldown_minutes: number
  created_at: string
  updated_at: string
}

interface RawJob {
  id: string
  trigger_id: string | null
  trigger_type: string | null
  model_id: string
  dataset_id: string
  dataset_candidate_id: string
  status: string
  pipeline_stage: string | null
  progress: number | null
  base_model_version: string | null
  hyperparameters: Record<string, unknown> | null
  config_snapshot: Record<string, unknown> | null
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

interface RawDatasetVersion {
  id: string
  dataset_id: string
  version: string
  description: string | null
  sample_count: number
  checksum: string | null
  validation_status: string | null
  annotation_status: string | null
  preprocessing_version: string | null
  quality_score: number | null
  duplicate_rate: number | null
  modality_distribution: Record<string, number> | null
  language_distribution: Record<string, number> | null
  sealed_at: string | null
  created_by: string | null
  created_at: string
}

interface RawCandidate {
  id: string
  model_id: string
  model_name: string
  version: string
  parent_version: string | null
  status: string
  evaluation_run_id: string | null
  rejection_reason: string | null
  promoted_at: string | null
  promoted_by: string | null
  created_at: string
  updated_at: string
}

interface RawPromotion {
  id: string
  model_id: string
  candidate_version_id: string
  previous_production_version_id: string
  status: string
  reason: string
  performed_by: string
  verified_at: string | null
  verified_by: string | null
  promoted_at: string | null
  rolled_back_at: string | null
  rollback_reason: string | null
  created_at: string
}

interface RawDriftSnapshot {
  id: string
  model_id: string
  model_version_id: string
  overall_drift_score: number
  overall_severity: string
  metrics: Array<{
    metric: string
    baseline: number
    current: number
    drift_score: number
    threshold: number
    severity: string
  }> | null
  sample_count: number
  created_at: string
}

interface RawActiveLearning {
  id: string
  media_type: string
  content: string
  content_preview: string | null
  confidence: number
  model_prediction: string
  ground_truth: string | null
  strategy: string
  priority: number
  status: string
  annotation: string | null
  annotated_by: string | null
  annotated_at: string | null
  created_at: string
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

function mapTrigger(raw: RawTrigger): TrainingTrigger {
  return {
    id: raw.id,
    type: raw.trigger_type as TriggerType,
    status: raw.status as TrainingTrigger['status'],
    name: raw.name,
    description: raw.description || '',
    config: raw.config || {},
    lastFiredAt: raw.last_fired_at,
    nextFireAt: raw.next_fire_at,
    firedCount: raw.fired_count,
    cooldownMinutes: raw.cooldown_minutes,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function mapJob(raw: RawJob): TrainingJob {
  const statusMap: Record<string, TrainingJobStatus> = {
    queued: 'queued',
    preprocessing: 'preprocessing',
    running: 'training',
    training: 'training',
    evaluating: 'evaluating',
    comparing: 'comparing',
    calibrating: 'calibrating',
    staging: 'staging',
    promoting: 'promoting',
    succeeded: 'succeeded',
    completed: 'succeeded',
    failed: 'failed',
    cancelled: 'cancelled',
  }

  const stageMap: Record<string, PipelineStage> = {
    validation: 'validation',
    sanitization: 'sanitization',
    quality_check: 'quality_check',
    duplicate_check: 'duplicate_check',
    label_annotation: 'label_annotation',
    corpus: 'corpus',
    dataset_version: 'dataset_version',
    training_queue: 'training_queue',
    train: 'train',
    validate: 'validate',
    test: 'test',
    calibrate: 'calibrate',
    compare: 'compare',
    candidate_model: 'candidate_model',
    staging: 'staging',
    promotion: 'promotion',
    production: 'production',
  }

  return {
    id: raw.id,
    triggerId: raw.trigger_id,
    triggerType: (raw.trigger_type as TriggerType) || null,
    modelId: raw.model_id,
    modelName: raw.model_id,
    datasetId: raw.dataset_id || raw.dataset_candidate_id,
    datasetName: raw.dataset_candidate_id,
    datasetVersion: (raw.config_snapshot?.['dataset_version'] as string) || 'v1.0.0',
    status: statusMap[raw.status] || 'queued',
    pipelineStage: stageMap[raw.pipeline_stage || ''] || 'training_queue',
    progress: raw.progress || 0,
    run: raw.config_snapshot
      ? {
          datasetVersion: (raw.config_snapshot['dataset_version'] as string) || 'v1.0.0',
          codeVersion: (raw.config_snapshot['code_version'] as string) || '',
          preprocessingVersion: (raw.config_snapshot['preprocessing_version'] as string) || '',
          modelArchitecture: (raw.config_snapshot['model_architecture'] as string) || '',
          hyperparameters: (raw.hyperparameters as Record<string, unknown>) || {},
          randomSeed: (raw.config_snapshot['random_seed'] as number) || 42,
          trainingStart: raw.started_at || raw.created_at,
          trainingEnd: raw.completed_at,
          metrics: {},
          artifacts: [],
          environment: {},
          parentModelVersion: raw.base_model_version,
        }
      : null,
    error: raw.error_message ?? null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    completedAt: raw.completed_at,
  }
}

function mapDatasetVersion(raw: RawDatasetVersion): DatasetVersionRecord {
  return {
    id: raw.id,
    datasetId: raw.dataset_id,
    version: raw.version,
    description: raw.description || '',
    sampleCount: raw.sample_count,
    checksum: raw.checksum || '',
    validationStatus:
      (raw.validation_status as DatasetVersionRecord['validationStatus']) || 'pending',
    annotationStatus:
      (raw.annotation_status as DatasetVersionRecord['annotationStatus']) || 'pending',
    preprocessingVersion: raw.preprocessing_version || 'N/A',
    qualityScore: raw.quality_score || 0,
    duplicateRate: raw.duplicate_rate || 0,
    modalityDistribution:
      (raw.modality_distribution as DatasetVersionRecord['modalityDistribution']) || {
        text: 0,
        image: 0,
        audio: 0,
        video: 0,
        document: 0,
      },
    languageDistribution:
      (raw.language_distribution as DatasetVersionRecord['languageDistribution']) || {},
    sealedAt: raw.sealed_at,
    createdBy: raw.created_by || 'system',
    createdAt: raw.created_at,
  }
}

function mapCandidate(raw: RawCandidate): ModelCandidate {
  return {
    id: raw.id,
    modelId: raw.model_id,
    modelName: raw.model_name,
    version: raw.version,
    parentVersion: raw.parent_version,
    status: raw.status as ModelCandidate['status'],
    evaluationRunId: raw.evaluation_run_id ?? '',
    evaluationRun: null,
    comparison: null,
    rejectionReason: raw.rejection_reason,
    promotedAt: raw.promoted_at,
    promotedBy: raw.promoted_by,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

function mapPromotion(raw: RawPromotion): PromotionRecord {
  return {
    id: raw.id,
    modelId: raw.model_id,
    candidateVersionId: raw.candidate_version_id,
    previousProductionVersionId: raw.previous_production_version_id,
    status: raw.status as PromotionRecord['status'],
    reason: raw.reason,
    performedBy: raw.performed_by,
    verifiedAt: raw.verified_at,
    verifiedBy: raw.verified_by,
    promotedAt: raw.promoted_at,
    rolledBackAt: raw.rolled_back_at,
    rollbackReason: raw.rollback_reason,
    createdAt: raw.created_at,
  }
}

function mapDriftSnapshot(raw: RawDriftSnapshot): DriftSnapshot {
  return {
    id: raw.id,
    modelId: raw.model_id,
    modelVersionId: raw.model_version_id,
    overallDriftScore: raw.overall_drift_score,
    overallSeverity: raw.overall_severity as DriftSnapshot['overallSeverity'],
    metrics: (raw.metrics || []).map((m) => ({
      metric: m.metric,
      baseline: m.baseline,
      current: m.current,
      driftScore: m.drift_score,
      threshold: m.threshold,
      severity: m.severity as DriftSnapshot['metrics'][0]['severity'],
    })),
    sampleCount: raw.sample_count,
    createdAt: raw.created_at,
  }
}

function mapActiveLearning(raw: RawActiveLearning): ActiveLearningCandidate {
  return {
    id: raw.id,
    mediaType: raw.media_type as ActiveLearningCandidate['mediaType'],
    content: raw.content,
    contentPreview: raw.content_preview || raw.content.substring(0, 200),
    confidence: raw.confidence,
    modelPrediction: raw.model_prediction,
    groundTruth: raw.ground_truth,
    strategy: raw.strategy as ActiveLearningCandidate['strategy'],
    priority: raw.priority,
    status: raw.status as ActiveLearningCandidate['status'],
    annotation: raw.annotation,
    annotatedBy: raw.annotated_by,
    annotatedAt: raw.annotated_at,
    createdAt: raw.created_at,
  }
}

// ─── Service ─────────────────────────────────────────────────────────────────

export const lifelongLearningService = {
  // ── Triggers ──────────────────────────────────────────────────────────────

  async listTriggers(): Promise<TrainingTrigger[]> {
    try {
      const response = await api.get<RawTrigger[]>('/mlops/triggers')
      return (response.data || []).map(mapTrigger)
    } catch {
      return []
    }
  },

  async createTrigger(params: {
    type: TriggerType
    name: string
    description?: string
    config: Record<string, unknown>
    cooldownMinutes?: number
  }): Promise<TrainingTrigger | null> {
    try {
      const response = await api.post<RawTrigger>('/mlops/triggers', {
        trigger_type: params.type,
        name: params.name,
        description: params.description || '',
        config: params.config,
        cooldown_minutes: params.cooldownMinutes || 60,
      })
      return mapTrigger(response.data)
    } catch {
      return null
    }
  },

  async updateTrigger(
    triggerId: string,
    updates: Partial<{ status: string; config: Record<string, unknown>; cooldownMinutes: number }>,
  ): Promise<boolean> {
    try {
      await api.put(`/mlops/triggers/${triggerId}`, updates)
      return true
    } catch {
      return false
    }
  },

  async evaluateTrigger(triggerId: string): Promise<boolean> {
    try {
      await api.post(`/mlops/triggers/${triggerId}/evaluate`)
      return true
    } catch {
      return false
    }
  },

  // ── Training Jobs ─────────────────────────────────────────────────────────

  async listJobs(params?: {
    status?: TrainingJobStatus
    modelId?: string
    limit?: number
    offset?: number
  }): Promise<TrainingJob[]> {
    try {
      const queryParams = new URLSearchParams()
      if (params?.status) queryParams.set('status', params.status)
      if (params?.modelId) queryParams.set('model_id', params.modelId)
      if (params?.limit) queryParams.set('limit', String(params.limit))
      if (params?.offset) queryParams.set('offset', String(params.offset))

      const qs = queryParams.toString()
      const response = await api.get<RawJob[]>(`/mlops/jobs${qs ? `?${qs}` : ''}`)
      return (response.data || []).map(mapJob)
    } catch {
      return []
    }
  },

  async getJob(jobId: string): Promise<TrainingJob | null> {
    try {
      const response = await api.get<RawJob>(`/mlops/jobs/${jobId}`)
      return mapJob(response.data)
    } catch {
      return null
    }
  },

  async getJobCounts(): Promise<Record<TrainingJobStatus, number>> {
    try {
      const response = await api.get<Record<string, number>>('/mlops/jobs/counts')
      const raw = response.data || {}
      return {
        queued: raw['queued'] || 0,
        preprocessing: raw['preprocessing'] || 0,
        training: raw['training'] || raw['running'] || 0,
        evaluating: raw['evaluating'] || 0,
        comparing: raw['comparing'] || 0,
        calibrating: raw['calibrating'] || 0,
        staging: raw['staging'] || 0,
        promoting: raw['promoting'] || 0,
        succeeded: raw['succeeded'] || 0,
        failed: raw['failed'] || 0,
        cancelled: raw['cancelled'] || 0,
      }
    } catch {
      return {
        queued: 0,
        preprocessing: 0,
        training: 0,
        evaluating: 0,
        comparing: 0,
        calibrating: 0,
        staging: 0,
        promoting: 0,
        succeeded: 0,
        failed: 0,
        cancelled: 0,
      }
    }
  },

  // ── Dataset Versions ──────────────────────────────────────────────────────

  async listDatasetVersions(datasetId: string): Promise<DatasetVersionRecord[]> {
    try {
      const response = await api.get<RawDatasetVersion[]>(`/datasets/${datasetId}/versions`)
      return (response.data || []).map(mapDatasetVersion)
    } catch {
      return []
    }
  },

  // ── Candidates ────────────────────────────────────────────────────────────

  async listCandidates(params?: {
    status?: string
    modelId?: string
    limit?: number
    offset?: number
  }): Promise<ModelCandidate[]> {
    try {
      const queryParams = new URLSearchParams()
      if (params?.status) queryParams.set('status', params.status)
      if (params?.modelId) queryParams.set('model_id', params.modelId)
      if (params?.limit) queryParams.set('limit', String(params.limit))
      if (params?.offset) queryParams.set('offset', String(params.offset))

      const qs = queryParams.toString()
      const response = await api.get<RawCandidate[]>(`/mlops/candidates${qs ? `?${qs}` : ''}`)
      return (response.data || []).map(mapCandidate)
    } catch {
      return []
    }
  },

  // ── Evaluations ───────────────────────────────────────────────────────────

  async listEvaluations(params?: {
    trainingJobId?: string
    approvalStatus?: string
    limit?: number
    offset?: number
  }): Promise<EvaluationRun[]> {
    try {
      const queryParams = new URLSearchParams()
      if (params?.trainingJobId) queryParams.set('training_job_id', params.trainingJobId)
      if (params?.approvalStatus) queryParams.set('approval_status', params.approvalStatus)
      if (params?.limit) queryParams.set('limit', String(params.limit))
      if (params?.offset) queryParams.set('offset', String(params.offset))

      const qs = queryParams.toString()
      const response = await api.get<Array<Record<string, unknown>>>(
        `/mlops/evaluations${qs ? `?${qs}` : ''}`,
      )
      return (response.data || []).map(mapEvaluation)
    } catch {
      return []
    }
  },

  async approveEvaluation(
    evaluationId: string,
    approved: boolean,
    reason?: string,
  ): Promise<boolean> {
    try {
      await api.post(`/mlops/evaluations/${evaluationId}/approve`, {
        approved,
        reason: reason || '',
      })
      return true
    } catch {
      return false
    }
  },

  // ── Promotions ────────────────────────────────────────────────────────────

  async listPromotions(params?: {
    modelId?: string
    status?: string
    limit?: number
  }): Promise<PromotionRecord[]> {
    try {
      const queryParams = new URLSearchParams()
      if (params?.modelId) queryParams.set('model_id', params.modelId)
      if (params?.status) queryParams.set('status', params.status)
      if (params?.limit) queryParams.set('limit', String(params.limit))

      const qs = queryParams.toString()
      const response = await api.get<RawPromotion[]>(`/mlops/promotions${qs ? `?${qs}` : ''}`)
      return (response.data || []).map(mapPromotion)
    } catch {
      return []
    }
  },

  async promote(modelId: string, versionId: string, reason: string): Promise<boolean> {
    try {
      await api.post(`/mlops/promotions/${modelId}/to-production/${versionId}`, null, {
        params: { reason },
      })
      return true
    } catch {
      return false
    }
  },

  async rollback(modelId: string, targetVersionId: string, reason: string): Promise<boolean> {
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

  // ── Drift ─────────────────────────────────────────────────────────────────

  async listDriftSnapshots(modelId: string): Promise<DriftSnapshot[]> {
    try {
      const response = await api.get<RawDriftSnapshot[]>(`/mlops/drift/snapshots/${modelId}`)
      return (response.data || []).map(mapDriftSnapshot)
    } catch {
      return []
    }
  },

  async getDriftAlerts(modelId: string): Promise<DriftSnapshot[]> {
    try {
      const response = await api.get<RawDriftSnapshot[]>(`/mlops/drift/alerts/${modelId}`)
      return (response.data || []).map(mapDriftSnapshot)
    } catch {
      return []
    }
  },

  // ── Active Learning ───────────────────────────────────────────────────────

  async listActiveLearningCandidates(params?: {
    strategy?: string
    status?: string
    limit?: number
  }): Promise<ActiveLearningCandidate[]> {
    try {
      const queryParams = new URLSearchParams()
      if (params?.strategy) queryParams.set('strategy', params.strategy)
      if (params?.status) queryParams.set('status', params.status)
      if (params?.limit) queryParams.set('limit', String(params.limit))

      const qs = queryParams.toString()
      const response = await api.get<RawActiveLearning[]>(
        `/mlops/active-learning/candidates${qs ? `?${qs}` : ''}`,
      )
      return (response.data || []).map(mapActiveLearning)
    } catch {
      return []
    }
  },

  async annotateCandidate(
    candidateId: string,
    annotation: string,
    annotatedBy: string,
  ): Promise<boolean> {
    try {
      await api.post(`/mlops/active-learning/candidates/${candidateId}/annotate`, {
        annotation,
        annotated_by: annotatedBy,
      })
      return true
    } catch {
      return false
    }
  },

  async skipCandidate(candidateId: string): Promise<boolean> {
    try {
      await api.post(`/mlops/active-learning/candidates/${candidateId}/skip`)
      return true
    } catch {
      return false
    }
  },

  // ── Pipeline Status ───────────────────────────────────────────────────────

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
}

// ─── Evaluation Mapper ───────────────────────────────────────────────────────

function mapEvaluation(raw: Record<string, unknown>): EvaluationRun {
  const metrics = (raw['metrics'] as Record<string, number>) || {}
  const split = (raw['split'] as EvaluationRun['split']) || 'test'

  const evaluationMetrics: EvaluationMetrics = {
    accuracy: (metrics['accuracy'] as number) || 0,
    precision: (metrics['precision'] as number) || 0,
    recall: (metrics['recall'] as number) || 0,
    f1Score: (metrics['f1_score'] as number) || 0,
    aucRoc: metrics['auc_roc'] as number | undefined,
    loss: metrics['loss'] as number | undefined,
    calibrationError: metrics['calibration_error'] as number | undefined,
    confusionMatrix:
      metrics['true_positive'] !== undefined
        ? {
            truePositive: (metrics['true_positive'] as number) || 0,
            falsePositive: (metrics['false_positive'] as number) || 0,
            trueNegative: (metrics['true_negative'] as number) || 0,
            falseNegative: (metrics['false_negative'] as number) || 0,
          }
        : undefined,
  }

  const calibration: CalibrationMetrics = {
    expectedCalibrationError: (metrics['calibration_error'] as number) || 0,
    maximumCalibrationError: (metrics['max_calibration_error'] as number) || 0,
    brierScore: (metrics['brier_score'] as number) || 0,
    reliabilityDiagram: [],
  }

  return {
    id: (raw['id'] as string) || '',
    trainingJobId: (raw['training_job_id'] as string) || '',
    modelVersionId: (raw['model_version_id'] as string) || '',
    datasetVersionId: (raw['dataset_version_id'] as string) || '',
    split,
    metrics: evaluationMetrics,
    perModality: [],
    perLanguage: [],
    perClass: [],
    calibration,
    falsePositiveRate: (metrics['false_positive_rate'] as number) || 0,
    falseNegativeRate: (metrics['false_negative_rate'] as number) || 0,
    regressionDetected: (raw['regression_detected'] as boolean) || false,
    regressionDetails: (raw['regression_details'] as string[]) || [],
    passedGates: (raw['passed_gates'] as boolean) || false,
    gateResults: (raw['gate_results'] as QualityGateResult[]) || [],
    createdAt: (raw['created_at'] as string) || new Date().toISOString(),
  }
}
