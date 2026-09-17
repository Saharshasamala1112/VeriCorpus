import { z } from 'zod'
import type { MediaType } from '../config/media-registry'
import type {
  ModalitySignal,
  EvidenceItem,
  AffectedRegion,
  ConfidenceMetrics,
} from '../engine/types'

// ─── LLM Provider Types ─────────────────────────────────────────────────────

export type LLMProviderType = 'ollama' | 'openai' | 'anthropic' | 'groq' | 'gemini'

export interface LLMProviderConfig {
  type: LLMProviderType
  baseUrl: string
  apiKey?: string
  model: string
  temperature?: number
  maxTokens?: number
  timeout?: number
  privacyPolicy?: PrivacyPolicy
}

export interface PrivacyPolicy {
  allowSendingContent: boolean
  allowSendingMetadata: boolean
  allowSendingEvidence: boolean
  dataRetentionDays?: number
  requiresConsent: boolean
}

export interface LLMRequest {
  prompt: string
  systemPrompt: string
  temperature?: number
  maxTokens?: number
  responseFormat?: 'json' | 'text'
}

export interface LLMResponse {
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  latencyMs: number
}

// ─── Context Builder Types ───────────────────────────────────────────────────

export interface StructuredEvidence {
  modality: MediaType
  inputMetadata: {
    filename: string
    sizeBytes: number
    sha256?: string
    language?: string
  }
  signals: ModalitySignal[]
  counterSignals: ModalitySignal[]
  evidence: EvidenceItem[]
  affectedRegions: AffectedRegion[]
  affectedSegments: AffectedRegion[]
  confidence: ConfidenceMetrics
  limitations: string[]
  engineMetadata: Record<string, unknown>
}

export interface LLMContext {
  evidence: StructuredEvidence
  ragContext?: RAGContext
  corpusContext?: CorpusContext
  globalRetrieval?: GlobalRetrieval
}

export interface RAGContext {
  query: string
  retrievedDocuments: Array<{
    id: string
    content: string
    score: number
    source: string
  }>
}

export interface CorpusContext {
  similarItems: Array<{
    id: string
    content: string
    similarity: number
    source: string
  }>
}

export interface GlobalRetrieval {
  webResults: Array<{
    url: string
    title: string
    snippet: string
    score: number
  }>
}

// ─── LLM Output Schema (Zod) ────────────────────────────────────────────────

const AssessmentReasoningSchema = z.object({
  verdict: z.enum(['LIKELY_AUTHENTIC', 'LIKELY_MANIPULATED', 'UNCERTAIN', 'INSUFFICIENT_EVIDENCE']),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().describe('Step-by-step reasoning based on provided evidence'),
  evidenceInterpretation: z
    .array(
      z.object({
        evidenceId: z.string(),
        interpretation: z.string(),
        isDirectEvidence: z.boolean().describe('True if directly observed, false if inferred'),
      }),
    )
    .describe('How each evidence item was interpreted'),
  confidenceFactors: z.array(
    z.object({
      name: z.string(),
      contribution: z.number().min(0).max(1),
      description: z.string(),
    }),
  ),
  uncertaintyNote: z.string().optional().describe('Any uncertainty in the assessment'),
})

const SignalInterpretationSchema = z.object({
  signalName: z.string(),
  interpretation: z.string(),
  agreement: z.enum(['supports', 'contradicts', 'neutral']),
  confidence: z.number().min(0).max(1),
  isDirectObservation: z
    .boolean()
    .describe('Whether this is directly from model output or LLM inference'),
})

const SourceSchema = z.object({
  type: z.enum(['evidence', 'inference', 'external']),
  description: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  evidenceIds: z
    .array(z.string())
    .optional()
    .describe('IDs of evidence items this source is based on'),
})

const LimitationSchema = z.object({
  category: z.string(),
  description: z.string(),
  impact: z.enum(['high', 'medium', 'low']),
})

const FollowUpSchema = z.object({
  type: z.string().describe('Type of follow-up action'),
  description: z.string(),
  priority: z.enum(['high', 'medium', 'low']),
  reason: z.string(),
})

// ─── Final Output Schema ─────────────────────────────────────────────────────

export const LLMReasoningOutputSchema = z.object({
  assessment: AssessmentReasoningSchema,
  summary: z.string().describe('Human-readable summary of the assessment'),
  confidence: z.number().min(0).max(1).describe('Overall confidence in the assessment'),
  signals: z.array(SignalInterpretationSchema).describe('Interpretation of supporting signals'),
  counterSignals: z.array(SignalInterpretationSchema).describe('Interpretation of counter signals'),
  evidence: z
    .array(
      z.object({
        id: z.string(),
        category: z.string(),
        description: z.string(),
        confidence: z.number().min(0).max(1),
        isDirectEvidence: z.boolean(),
        llmInterpretation: z.string().optional(),
      }),
    )
    .describe('Evidence items with LLM interpretation'),
  contradictingEvidence: z
    .array(
      z.object({
        description: z.string(),
        evidenceIds: z.array(z.string()),
        strength: z.enum(['strong', 'moderate', 'weak']),
      }),
    )
    .describe('Evidence items that contradict each other'),
  sources: z.array(SourceSchema).describe('Sources of information used in the assessment'),
  similarityMatches: z
    .array(
      z.object({
        id: z.string(),
        description: z.string(),
        similarity: z.number().min(0).max(1),
        source: z.string(),
        isDirectMatch: z.boolean(),
      }),
    )
    .describe('Similar items found in corpus or external sources'),
  affectedRegions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        type: z.enum(['spatial', 'temporal', 'textual']),
        importance: z.number().min(0).max(1),
        explanation: z.string(),
        isDirectObservation: z.boolean(),
      }),
    )
    .describe('Regions of interest with LLM explanation'),
  affectedSegments: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        type: z.enum(['temporal', 'textual', 'page']),
        location: z.string().describe('Human-readable location description'),
        importance: z.number().min(0).max(1),
        explanation: z.string(),
        isDirectObservation: z.boolean(),
      }),
    )
    .describe('Segments of interest with LLM explanation'),
  limitations: z.array(LimitationSchema).describe('Limitations of the assessment'),
  recommendedFollowUp: z.array(FollowUpSchema).describe('Recommended follow-up actions'),
})

export type LLMReasoningOutput = z.infer<typeof LLMReasoningOutputSchema>

// ─── Reasoning Engine Types ──────────────────────────────────────────────────

export interface ReasoningConfig {
  providers: LLMProviderConfig[]
  fallbackToEngine: boolean
  maxRetries: number
  timeout: number
  enablePrivacyFilter: boolean
  logPrompt: boolean
}

export interface ReasoningRequest {
  evidence: StructuredEvidence
  ragContext?: RAGContext
  corpusContext?: CorpusContext
  globalRetrieval?: GlobalRetrieval
  options?: {
    temperature?: number
    maxTokens?: number
    provider?: LLMProviderType
  }
}

export interface ReasoningResult {
  output: LLMReasoningOutput
  provider: LLMProviderType
  model: string
  latencyMs: number
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  validationPassed: boolean
  validationErrors?: string[]
  fromEngineFallback: boolean
}
