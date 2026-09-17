// ─── LLM Reasoning Engine ────────────────────────────────────────────────────

export { LLMReasoningEngine } from './LLMReasoningEngine'

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  LLMProviderType,
  LLMProviderConfig,
  PrivacyPolicy,
  LLMRequest,
  LLMResponse,
  StructuredEvidence,
  LLMContext,
  RAGContext,
  CorpusContext,
  GlobalRetrieval,
  ReasoningConfig,
  ReasoningRequest,
  ReasoningResult,
  LLMReasoningOutput,
} from './types'

// ─── Schemas ─────────────────────────────────────────────────────────────────

export { LLMReasoningOutputSchema } from './types'

// ─── Providers ───────────────────────────────────────────────────────────────

export type { ILLMProvider } from './providers/LLMProvider'
export { BaseLLMProvider } from './providers/LLMProvider'
export { OllamaProvider } from './providers/OllamaProvider'
export { ExternalProvider } from './providers/ExternalProvider'

// ─── Utilities ───────────────────────────────────────────────────────────────

export { ContextBuilder } from './ContextBuilder'
export { PromptTemplates } from './PromptTemplates'
export { SchemaValidator } from './SchemaValidator'
export type { ValidationResult } from './SchemaValidator'
