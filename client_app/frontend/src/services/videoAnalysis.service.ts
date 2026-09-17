import api from '../lib/axios'
import { apiUrl } from '../config/env'
import type { VideoAnalysisFullResponse } from '../types/video-analysis'

// ─── Service ────────────────────────────────────────────────────────────────

export const videoAnalysisService = {
  async getAnalysis(jobId: string): Promise<VideoAnalysisFullResponse> {
    const response = await api.get<VideoAnalysisFullResponse>(`/api/v1/analysis-v2/${jobId}`)
    return response.data
  },

  getMediaUrl(assetId: string): string {
    return apiUrl(`/api/v1/media/${assetId}`)
  },
}
