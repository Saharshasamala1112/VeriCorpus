import api from '../lib/axios'

export interface AuthenticitySignal {
  name: string
  value: string
  detail: string
}

export interface PlagiarismMatch {
  source_id: string
  source: string
  matched_text: string
  input_span: {
    text: string
    start_offset: number
    end_offset: number
    page?: number | null
    paragraph?: number | null
    sentence?: number | null
  }
  source_span: {
    text: string
    start_offset: number
    end_offset: number
    page?: number | null
    paragraph?: number | null
    sentence?: number | null
  }
  match_type: 'exact' | 'near_duplicate' | 'ngram' | 'lexical' | 'paraphrase' | 'semantic'
  similarity_score: number
  confidence: number
  source_url?: string | null
  retrieved_at: string
  confirmed_plagiarism: boolean
}

export interface AuthenticityExplanation {
  primary: string
  secondary: string
  language: string
}

export interface AuthenticityLearning {
  stored: boolean
  model_prediction: { ai_score: number; model: string } | null
  status: {
    total_samples: number
    labeled_samples: number
    label_counts: Record<string, number>
    model_ready: boolean
    last_run: {
      status: string
      sample_count: number
      metrics: { accuracy?: number; f1?: number }
      completed_at?: string | null
    } | null
  }
}

export interface AuthenticityDetector {
  name: string
  status: 'active' | 'unavailable'
  runtime: { configured: boolean; ready: boolean; model_path: string; error: string | null }
  raw: Record<string, unknown> | null
}

export interface AuthenticityResult {
  status: 'inconclusive' | 'likely_authentic' | 'likely_manipulated'
  verdict: string
  confidence: number
  model_probability?: number | null
  calibrated_probability?: number | null
  evidence_strength?: number | null
  manipulation_probability: number | null
  media_type: string
  filename: string
  size_bytes: number
  sha256: string
  source_url?: string | null
  sample_id: string
  learning: AuthenticityLearning
  detector: AuthenticityDetector
  signals: AuthenticitySignal[]
  explanation: AuthenticityExplanation
  limitations: string[]
  plagiarism_matches?: PlagiarismMatch[]
  corpus_context: {
    available: boolean
    language_count: number
    languages: Array<{ id?: string; name?: string }>
    note: string
  }
}

export interface LearningStatus {
  total_samples: number
  labeled_samples: number
  label_counts: Record<string, number>
  model_ready: boolean
  last_run: {
    status: string
    sample_count: number
    metrics: { accuracy?: number; f1?: number }
    completed_at?: string | null
  } | null
}

export interface CorpusLanguage {
  id: string
  name: string
}

export const authenticityService = {
  async analyze(input: {
    file?: File
    text?: string
    sourceUrl?: string
    language: string
  }): Promise<AuthenticityResult> {
    const form = new FormData()
    if (input.file) form.append('file', input.file)
    if (input.text) form.append('text', input.text)
    if (input.sourceUrl) form.append('source_url', input.sourceUrl)
    form.append('language', input.language)
    const response = await api.post<AuthenticityResult>('/authenticity/analyze', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  async translate(
    explanation: string,
    targetLanguage: string,
  ): Promise<{ original: string; translated: string; language: string }> {
    const form = new FormData()
    form.append('explanation', explanation)
    form.append('target_language', targetLanguage)
    const response = await api.post('/authenticity/translate', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },

  async getLanguages(): Promise<CorpusLanguage[]> {
    const response = await api.get<{ languages: CorpusLanguage[] }>('/authenticity/languages')
    return response.data.languages || []
  },

  async getLearningStatus(): Promise<LearningStatus> {
    const response = await api.get<LearningStatus>('/authenticity/learning-status')
    return response.data
  },

  async getModelStatus(): Promise<{
    forensic: Record<string, unknown>
    learning: LearningStatus
  }> {
    const response = await api.get('/authenticity/model-status')
    return response.data
  },

  async labelSample(
    sampleId: string,
    label: 'authentic' | 'manipulated' | 'human_written' | 'ai_written',
  ) {
    const form = new FormData()
    form.append('sample_id', sampleId)
    form.append('label', label)
    const response = await api.post('/authenticity/feedback', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    return response.data
  },
}
