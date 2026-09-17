import api from '../lib/axios'

export interface TrainingStatus {
  total_samples: number
  labeled_samples: number
  label_counts: Record<string, number>
  model_ready: boolean
  corpus_records_synced: number
  total_training_runs: number
  last_run: {
    status: string
    sample_count: number
    model_version: string
    metrics: {
      accuracy?: number
      f1?: number
      roc_auc?: number
      model_used?: string
      cv_scores?: Record<string, number>
      total_samples?: number
      human_samples?: number
      ai_samples?: number
      feature_count?: number
      models_trained?: string[]
    }
    completed_at: string | null
  } | null
}

export interface TrainingRun {
  id: string
  status: string
  sample_count: number
  model_version: string
  metrics: Record<string, unknown>
  error: string | null
  created_at: string
  completed_at: string | null
}

export interface DashboardStats {
  total_samples: number
  label_distribution: Record<string, number>
  source_distribution: Record<string, number>
  training_runs: {
    total: number
    completed: number
    failed: number
  }
  corpus_synced: number
  recent_samples: Array<{
    id: string
    filename: string
    media_type: string
    label: string
    source: string
    created_at: string
  }>
}

export interface PredictionResult {
  ai_score: number
  model: string
  confidence: number
  linguistic_features: number[]
}

export const trainingService = {
  async getStatus(): Promise<TrainingStatus> {
    const response = await api.get<TrainingStatus>('/training/status')
    return response.data
  },

  async getHistory(limit = 20): Promise<{ runs: TrainingRun[] }> {
    const response = await api.get('/training/history', { params: { limit } })
    return response.data
  },

  async getDashboard(): Promise<DashboardStats> {
    const response = await api.get<DashboardStats>('/training/dashboard')
    return response.data
  },

  async generateSamples(count = 100): Promise<{ generated: number; total_ai_samples: number }> {
    const response = await api.post('/training/generate-samples', null, { params: { count } })
    return response.data
  },

  async triggerTraining(): Promise<{ status: string; message: string }> {
    const response = await api.post('/training/trigger-training')
    return response.data
  },

  async predict(text: string): Promise<PredictionResult> {
    const response = await api.post('/training/predict', null, { params: { text } })
    return response.data
  },
}
