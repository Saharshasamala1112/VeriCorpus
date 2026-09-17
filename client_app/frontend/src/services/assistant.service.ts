import api from '../lib/axios'
import type { LearningStatus } from './authenticity.service'

export const assistantService = {
  async ask(question: string, language: string) {
    const response = await api.post<{
      answer: string
      language: string
      grounded: boolean
      sources: Array<{ filename: string; label: string }>
      learning_status: LearningStatus
    }>('/assistant/public-chat', {
      question,
      language,
    })
    return response.data
  },
}
