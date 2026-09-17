import api from '../lib/axios'

export interface LearningSample {
  id: string
  filename: string
  media_type: string
  label: string | null
  source: string | null
  created_at: string
}

export interface CorpusSyncStatus {
  total_human_samples: number
  total_synced_records: number
  by_source: Record<string, number>
}

export interface EvaluationReport {
  timestamp?: string
  total_samples?: number
  human_samples?: number
  ai_samples?: number
  cv_results?: Record<string, { mean_f1: number; std_f1: number; mean_accuracy: number }>
  test_results?: Record<
    string,
    {
      accuracy: number
      f1: number
      roc_auc: number
      confusion_matrix: number[][]
    }
  >
  best_model?: string
  best_f1?: number
  best_accuracy?: number
}

export const corpusService = {
  async getSyncStatus(): Promise<CorpusSyncStatus> {
    const response = await api.get<CorpusSyncStatus>('/corpus/sync-status')
    return response.data
  },

  async syncBatch(
    records: Array<{ id?: string; title: string; description: string; media_type?: string }>,
  ) {
    const response = await api.post('/corpus/sync-batch', records)
    return response.data
  },

  async storeRecord(recordId: string, title: string, description: string, mediaType = 'text') {
    const response = await api.post('/corpus/store-record', null, {
      params: { record_id: recordId, title, description, media_type: mediaType },
    })
    return response.data
  },

  async getSamples(params: { label?: string; limit?: number; offset?: number } = {}) {
    const response = await api.get<{
      samples: LearningSample[]
      total: number
      limit: number
      offset: number
    }>('/corpus/samples', { params })
    return response.data
  },

  async deleteSample(sampleId: string) {
    const response = await api.delete(`/corpus/samples/${sampleId}`)
    return response.data
  },

  async getEvaluation(): Promise<EvaluationReport> {
    const response = await api.get<EvaluationReport>('/corpus/evaluation')
    return response.data
  },
}
