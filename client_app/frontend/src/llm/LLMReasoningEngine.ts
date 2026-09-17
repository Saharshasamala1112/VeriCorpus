import type { AuthenticityAssessment, AssessmentVerdict } from '../engine/types'
import type {
  LLMProviderConfig,
  LLMProviderType,
  ReasoningConfig,
  ReasoningResult,
  LLMReasoningOutput,
  RAGContext,
  CorpusContext,
  GlobalRetrieval,
} from './types'
import type { ILLMProvider } from './providers/LLMProvider'
import { OllamaProvider } from './providers/OllamaProvider'
import { ExternalProvider } from './providers/ExternalProvider'
import { ContextBuilder } from './ContextBuilder'
import { PromptTemplates } from './PromptTemplates'
import { SchemaValidator } from './SchemaValidator'

// ─── LLM Reasoning Engine ────────────────────────────────────────────────────

export class LLMReasoningEngine {
  private static instance: LLMReasoningEngine | null = null

  private readonly providers: Map<LLMProviderType, ILLMProvider> = new Map()
  private readonly contextBuilder: ContextBuilder
  private readonly promptTemplates: PromptTemplates
  private readonly schemaValidator: SchemaValidator
  private readonly config: ReasoningConfig

  private constructor(config: ReasoningConfig) {
    this.config = config
    this.contextBuilder = new ContextBuilder()
    this.promptTemplates = new PromptTemplates()
    this.schemaValidator = new SchemaValidator()

    // Initialize providers
    for (const providerConfig of config.providers) {
      this.addProvider(providerConfig)
    }
  }

  static getInstance(config?: ReasoningConfig): LLMReasoningEngine {
    if (!LLMReasoningEngine.instance) {
      if (!config) {
        throw new Error('Config required for first initialization')
      }
      LLMReasoningEngine.instance = new LLMReasoningEngine(config)
    }
    return LLMReasoningEngine.instance
  }

  static resetInstance(): void {
    LLMReasoningEngine.instance = null
  }

  // ── Provider Management ────────────────────────────────────────────────────

  addProvider(config: LLMProviderConfig): void {
    let provider: ILLMProvider

    if (config.type === 'ollama') {
      provider = new OllamaProvider(config)
    } else {
      provider = new ExternalProvider(config)
    }

    this.providers.set(config.type, provider)
  }

  getProvider(type: LLMProviderType): ILLMProvider | undefined {
    return this.providers.get(type)
  }

  async checkProviderHealth(type: LLMProviderType): Promise<boolean> {
    const provider = this.providers.get(type)
    if (!provider) return false
    return provider.healthCheck()
  }

  // ── Main Reasoning Method ──────────────────────────────────────────────────

  async reason(
    assessment: AuthenticityAssessment,
    options?: {
      ragContext?: RAGContext
      corpusContext?: CorpusContext
      globalRetrieval?: GlobalRetrieval
      provider?: LLMProviderType
      temperature?: number
      maxTokens?: number
    },
  ): Promise<ReasoningResult> {
    const startTime = Date.now()

    // Step 1: Build structured evidence
    const evidence = this.contextBuilder.buildStructuredEvidence(assessment)

    // Step 2: Build context
    const context = this.contextBuilder.buildContext(evidence, {
      ragContext: options?.ragContext,
      corpusContext: options?.corpusContext,
      globalRetrieval: options?.globalRetrieval,
    })

    // Step 3: Serialize context
    const serializedContext = this.contextBuilder.serializeContext(context)

    // Step 4: Select provider
    const provider = this.selectProvider(options?.provider)

    // Step 5: Build prompts
    const systemPrompt = this.promptTemplates.buildSystemPrompt(assessment.modality)
    const userPrompt = this.promptTemplates.buildUserPrompt(serializedContext)

    // Step 6: Call LLM with retry logic
    let lastError: Error | null = null
    let attempts = 0

    while (attempts < this.config.maxRetries) {
      try {
        const response = await provider.complete({
          prompt: userPrompt,
          systemPrompt,
          temperature: options?.temperature,
          maxTokens: options?.maxTokens,
          responseFormat: 'json',
        })

        // Step 7: Validate output
        const validation = this.schemaValidator.validate(response.content)

        if (validation.success && validation.data) {
          return {
            output: validation.data,
            provider: provider.type as LLMProviderType,
            model: response.model,
            latencyMs: Date.now() - startTime,
            usage: response.usage,
            validationPassed: true,
            validationErrors: undefined,
            fromEngineFallback: false,
          }
        }

        // Try to fix the output
        const fixedOutput = this.schemaValidator.tryFix(response.content)
        const retryValidation = this.schemaValidator.validate(fixedOutput)

        if (retryValidation.success && retryValidation.data) {
          return {
            output: retryValidation.data,
            provider: provider.type as LLMProviderType,
            model: response.model,
            latencyMs: Date.now() - startTime,
            usage: response.usage,
            validationPassed: true,
            validationErrors: validation.errors,
            fromEngineFallback: false,
          }
        }

        lastError = new Error(`Validation failed: ${validation.errors?.join(', ')}`)
      } catch (error) {
        lastError = error as Error
      }

      attempts++
    }

    // Step 8: Fallback to engine assessment
    if (this.config.fallbackToEngine) {
      return this.buildEngineFallback(assessment, lastError, Date.now() - startTime)
    }

    throw lastError || new Error('LLM reasoning failed after all retries')
  }

  /**
   * Build reasoning result directly from engine assessment (no LLM)
   */
  buildEngineFallback(
    assessment: AuthenticityAssessment,
    error?: Error | null,
    latencyMs = 0,
  ): ReasoningResult {
    const output = this.buildEngineOutput(assessment, error)

    return {
      output,
      provider: 'ollama',
      model: 'engine-fallback',
      latencyMs,
      validationPassed: true,
      fromEngineFallback: true,
    }
  }

  // ── Provider Selection ─────────────────────────────────────────────────────

  private selectProvider(preferred?: LLMProviderType): ILLMProvider {
    // Try preferred provider first
    if (preferred) {
      const provider = this.providers.get(preferred)
      if (provider && provider.isAvailable) {
        return provider
      }
    }

    // Try providers in order: Ollama first (local), then external
    const preferredOrder: LLMProviderType[] = ['ollama', 'groq', 'openai', 'anthropic', 'gemini']

    for (const type of preferredOrder) {
      const provider = this.providers.get(type)
      if (provider && provider.isAvailable) {
        return provider
      }
    }

    // Return any available provider
    for (const provider of this.providers.values()) {
      if (provider.isAvailable) {
        return provider
      }
    }

    throw new Error('No available LLM provider')
  }

  // ── Engine Fallback Output ─────────────────────────────────────────────────

  private buildEngineOutput(
    assessment: AuthenticityAssessment,
    error?: Error | null,
  ): LLMReasoningOutput {
    const { verdict, confidence, signals, counterSignals, evidence, limitations } = assessment

    // Build evidence interpretation
    const evidenceInterpretation = evidence.map((item) => ({
      evidenceId: item.id,
      interpretation: item.description,
      isDirectEvidence: true,
    }))

    // Build signal interpretations
    const signalInterpretations = signals.map((signal) => ({
      signalName: signal.name,
      interpretation: signal.detail,
      agreement: 'supports' as const,
      confidence: signal.value,
      isDirectObservation: true,
    }))

    const counterSignalInterpretations = counterSignals.map((signal) => ({
      signalName: signal.name,
      interpretation: signal.detail,
      agreement: 'contradicts' as const,
      confidence: signal.value,
      isDirectObservation: true,
    }))

    // Build confidence factors
    const confidenceFactors = [
      {
        name: 'Engine Confidence',
        contribution: confidence.overall,
        description: `Engine assessed confidence: ${(confidence.overall * 100).toFixed(1)}%`,
      },
      {
        name: 'Model Agreement',
        contribution: confidence.modelAgreement,
        description: `Model agreement score: ${(confidence.modelAgreement * 100).toFixed(1)}%`,
      },
    ]

    // Build limitations
    const limitationObjects: Array<{
      category: string
      description: string
      impact: 'high' | 'medium' | 'low'
    }> = [
      ...limitations.map((lim) => ({
        category: 'engine',
        description: lim,
        impact: 'medium' as const,
      })),
    ]

    if (error) {
      limitationObjects.push({
        category: 'llm',
        description: `LLM reasoning unavailable: ${error.message}`,
        impact: 'high',
      })
    }

    return {
      assessment: {
        verdict,
        confidence: confidence.overall,
        reasoning: `Assessment based on engine analysis. LLM reasoning ${error ? 'unavailable: ' + error.message : 'not performed'}.`,
        evidenceInterpretation,
        confidenceFactors,
        uncertaintyNote: error ? `LLM reasoning failed: ${error.message}` : undefined,
      },
      summary: this.buildSummary(
        verdict,
        confidence.overall,
        signals.length,
        counterSignals.length,
      ),
      confidence: confidence.overall,
      signals: signalInterpretations,
      counterSignals: counterSignalInterpretations,
      evidence: evidence.map((item) => ({
        id: item.id,
        category: item.category,
        description: item.description,
        confidence: item.confidence,
        isDirectEvidence: true,
      })),
      contradictingEvidence: this.buildContradictingEvidence(signals, counterSignals),
      sources: [
        {
          type: 'evidence',
          description: 'Assessment from authenticity engine',
          confidence: confidence.overall,
        },
      ],
      similarityMatches: [],
      affectedRegions: assessment.affectedRegions.map((region) => ({
        id: region.id,
        label: region.label,
        type: region.type,
        importance: region.severity === 'high' ? 0.9 : region.severity === 'medium' ? 0.6 : 0.3,
        explanation: region.description,
        isDirectObservation: true,
      })),
      affectedSegments: assessment.affectedSegments.map((segment) => ({
        id: segment.id,
        label: segment.label,
        type:
          segment.type === 'spatial' ? 'page' : (segment.type as 'temporal' | 'textual' | 'page'),
        location: JSON.stringify(segment.location),
        importance: segment.severity === 'high' ? 0.9 : segment.severity === 'medium' ? 0.6 : 0.3,
        explanation: segment.description,
        isDirectObservation: true,
      })),
      limitations: limitationObjects,
      recommendedFollowUp: this.buildFollowUp(verdict, confidence.overall),
    }
  }

  private buildSummary(
    verdict: AssessmentVerdict,
    confidence: number,
    signalCount: number,
    counterSignalCount: number,
  ): string {
    const verdictText = verdict.replace(/_/g, ' ').toLowerCase()
    return (
      `Analysis completed with verdict: ${verdictText} (confidence: ${(confidence * 100).toFixed(1)}%). ` +
      `Found ${signalCount} supporting signal(s) and ${counterSignalCount} counter signal(s).`
    )
  }

  private buildContradictingEvidence(
    signals: AuthenticityAssessment['signals'],
    counterSignals: AuthenticityAssessment['counterSignals'],
  ): LLMReasoningOutput['contradictingEvidence'] {
    const contradictions: LLMReasoningOutput['contradictingEvidence'] = []

    // Find signals that contradict each other
    for (const signal of signals) {
      for (const counter of counterSignals) {
        if (signal.category === counter.category) {
          contradictions.push({
            description: `${signal.name} supports authenticity while ${counter.name} suggests manipulation`,
            evidenceIds: [
              ...(signal.evidence?.map((e) => e.id) || []),
              ...(counter.evidence?.map((e) => e.id) || []),
            ],
            strength: signal.value > 0.7 || counter.value > 0.7 ? 'strong' : 'moderate',
          })
        }
      }
    }

    return contradictions
  }

  private buildFollowUp(
    verdict: AssessmentVerdict,
    confidence: number,
  ): LLMReasoningOutput['recommendedFollowUp'] {
    const followUp: LLMReasoningOutput['recommendedFollowUp'] = []

    if (confidence < 0.5) {
      followUp.push({
        type: 'additional_analysis',
        description: 'Consider running additional analysis with different models',
        priority: 'high',
        reason: 'Low confidence assessment',
      })
    }

    if (verdict === 'UNCERTAIN') {
      followUp.push({
        type: 'manual_review',
        description: 'Recommend manual expert review',
        priority: 'medium',
        reason: 'Assessment is uncertain',
      })
    }

    if (verdict === 'INSUFFICIENT_EVIDENCE') {
      followUp.push({
        type: 'gather_evidence',
        description: 'Collect additional evidence or use different analysis tools',
        priority: 'high',
        reason: 'Insufficient evidence for assessment',
      })
    }

    return followUp
  }
}
