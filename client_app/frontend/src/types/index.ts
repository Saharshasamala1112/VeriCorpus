export interface User {
  user_id: string
  username: string
  phone: string
  roles: string[]
  corpus_connected?: boolean
}

export interface LoginRequest {
  phone: string
  password: string
}

export interface OTPRequest {
  phone: string
}

export interface OTPVerifyRequest {
  phone: string
  otp_code: string
}

export interface SignupOTPVerifyRequest {
  phone: string
  otp_code: string
  name: string
  email: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user_id: string
  username: string
  phone: string
  roles: string[]
}

export interface OTPSendResponse {
  message: string
  reference_id?: string
}

export interface TokenRefreshResponse {
  access_token: string
  token_type: string
}

export interface UserProfile {
  id: string
  phone: string
  name?: string
  username?: string
  email?: string
  is_active: boolean
  roles?: string[]
  last_login_at?: string
}

export interface MatchedPassage {
  source_text: string
  matched_text: string
  similarity_score: number
  source_document_id: string
  source_document_title: string
}

export interface MatchedSource {
  document_id: string
  document_title: string
  document_url: string
  similarity_score: number
  matched_passages: MatchedPassage[]
  summary: string
}

export interface WebSource {
  title: string
  url: string
  snippet: string
  similarity_score: number
}

export interface StyleAnalysis {
  vocabulary_level?: string
  sentence_complexity?: string
  tone_consistency?: string
  writing_quality?: string
}

export interface PlagiarismAnalysis {
  overall_similarity: number
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  confidence: number
  sources_checked: number
  matches_found: number
  matched_sources: MatchedSource[]
  ai_analysis: string
  recommendations: string[]
  ml_score?: number
  gemini_score?: number
  standalone_score?: number
  ai_generated_score?: number
  web_score?: number
  web_sources?: WebSource[]
  rag_matches?: number
  rag_sources?: RAGSource[]
  suspicious_patterns?: string[]
  style_analysis?: StyleAnalysis
}

export interface RAGSource {
  title: string
  score: number
}

export interface Report {
  id: string
  document_id: string
  document_title: string
  analysis: PlagiarismAnalysis
  created_at: string
  status: string
}

export interface ReportListResponse {
  reports: Report[]
  total: number
}

export interface CorpusDocument {
  uid: string
  title: string
  description: string
  media_type: string
  language: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface CorpusSearchResult {
  uid: string
  title: string
  description: string
  language: string
  media_type: string
  score?: number
}

export interface ParagraphAnalysis {
  text: string
  ai_probability: number
  indicators: string[]
}

export interface StyleBreakdown {
  vocabulary_diversity: number
  sentence_length_variance: number
  transition_phrase_density: number
  personal_voice_score: number
  error_naturalness: number
}

export interface AIDetectionResult {
  ai_score: number
  human_score: number
  confidence: number
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  summary: string
  key_indicators: string[]
  style_analysis: StyleBreakdown
  paragraph_analyses: ParagraphAnalysis[]
  recommendations: string[]
  model_used: string
}

export interface AIDetectionResponse {
  id: string
  text_length: number
  result: AIDetectionResult
  created_at: string
  status: string
}

export interface AIDetectionHistoryResponse {
  detections: AIDetectionResponse[]
  total: number
}

export interface KnowledgeEntry {
  id: string
  title: string
  summary: string | null
  file_type: string
  category_id: string | null
  category_name: string | null
  uploader_id: string
  uploader_name: string | null
  tags: string[]
  access_count: number
  chunk_count: number
  created_at: string | null
}

export interface KnowledgeSearchResult {
  entry: KnowledgeEntry
  relevance_score: number
  snippet: string
}

export interface KnowledgeSearchResponse {
  results: KnowledgeSearchResult[]
  total: number
  query: string
}

export interface KnowledgeCategory {
  id: string
  name: string
  description: string | null
  icon: string | null
  document_count: number
  created_at: string | null
}

export interface KnowledgeAskResponse {
  answer: string
  sources: KnowledgeEntry[]
  query_id: string
}

export interface KnowledgeStats {
  total_documents: number
  total_chunks: number
  total_queries: number
  total_categories: number
  top_categories: KnowledgeCategory[]
  recent_uploads: KnowledgeEntry[]
}

export interface KnowledgeContribution {
  id: string
  knowledge_entry_id: string
  entry_title: string | null
  contribution_type: string
  description: string | null
  created_at: string | null
}

// ─── Explainability Engine Types ──────────────────────────────────────────────
export type {
  ExplanationResult,
  ExplanationSignal,
  EvidenceItem,
  EvidenceType,
  MethodologyInfo,
  TextEvidence,
  ImageEvidence,
  AudioEvidence,
  VideoEvidence,
  DocumentEvidence,
  ExplanationTemplate,
  HumanExplanation,
  VerdictCategory,
  ConfidenceLevel,
} from './explainability'

export type {
  PrivacyPolicy,
  StructuredEvidence,
  LLMContext,
  RAGContext,
  CorpusContext,
  GlobalRetrieval,
  LLMProviderConfig,
  LLMProviderType,
  LLMRequest,
  LLMResponse,
  ReasoningConfig,
  ReasoningRequest,
  ReasoningResult,
  LLMReasoningOutput,
} from '../llm/types'
