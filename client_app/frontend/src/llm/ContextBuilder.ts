import type {
  AuthenticityAssessment,
  ModalitySignal,
  EvidenceItem,
  AffectedRegion,
} from '../engine/types'
import type {
  StructuredEvidence,
  LLMContext,
  RAGContext,
  CorpusContext,
  GlobalRetrieval,
  PrivacyPolicy,
} from '../types'

// ─── Context Builder ─────────────────────────────────────────────────────────

export class ContextBuilder {
  /**
   * Build structured evidence from an authenticity assessment
   */
  buildStructuredEvidence(
    assessment: AuthenticityAssessment,
    privacyPolicy?: PrivacyPolicy,
  ): StructuredEvidence {
    const filteredEvidence = this.filterEvidenceByPrivacy(assessment.evidence, privacyPolicy)

    const filteredSignals = this.filterSignalsByPrivacy(assessment.signals, privacyPolicy)

    const filteredCounterSignals = this.filterSignalsByPrivacy(
      assessment.counterSignals,
      privacyPolicy,
    )

    return {
      modality: assessment.modality,
      inputMetadata: {
        filename: assessment.input.filename,
        sizeBytes: assessment.input.sizeBytes,
        sha256: assessment.input.sha256,
      },
      signals: filteredSignals,
      counterSignals: filteredCounterSignals,
      evidence: filteredEvidence,
      affectedRegions: assessment.affectedRegions,
      affectedSegments: assessment.affectedSegments,
      confidence: assessment.confidence,
      limitations: assessment.limitations,
      engineMetadata: assessment.metadata,
    }
  }

  /**
   * Build LLM context from structured evidence and optional external sources
   */
  buildContext(
    evidence: StructuredEvidence,
    options?: {
      ragContext?: RAGContext
      corpusContext?: CorpusContext
      globalRetrieval?: GlobalRetrieval
    },
  ): LLMContext {
    return {
      evidence,
      ragContext: options?.ragContext,
      corpusContext: options?.corpusContext,
      globalRetrieval: options?.globalRetrieval,
    }
  }

  /**
   * Serialize context to a prompt-friendly string
   */
  serializeContext(context: LLMContext): string {
    const parts: string[] = []

    // Evidence section
    parts.push(this.serializeEvidence(context.evidence))

    // RAG context
    if (context.ragContext && context.ragContext.retrievedDocuments.length > 0) {
      parts.push(this.serializeRAGContext(context.ragContext))
    }

    // Corpus context
    if (context.corpusContext && context.corpusContext.similarItems.length > 0) {
      parts.push(this.serializeCorpusContext(context.corpusContext))
    }

    // Global retrieval
    if (context.globalRetrieval && context.globalRetrieval.webResults.length > 0) {
      parts.push(this.serializeGlobalRetrieval(context.globalRetrieval))
    }

    return parts.join('\n\n')
  }

  // ── Evidence Serialization ──────────────────────────────────────────────────

  private serializeEvidence(evidence: StructuredEvidence): string {
    const parts: string[] = []

    parts.push(`## Media Analysis Evidence`)
    parts.push(`Modality: ${evidence.modality}`)
    parts.push(`Filename: ${evidence.inputMetadata.filename}`)
    parts.push(`Size: ${evidence.inputMetadata.sizeBytes} bytes`)

    if (evidence.inputMetadata.sha256) {
      parts.push(`SHA-256: ${evidence.inputMetadata.sha256}`)
    }

    if (evidence.inputMetadata.language) {
      parts.push(`Language: ${evidence.inputMetadata.language}`)
    }

    // Signals
    if (evidence.signals.length > 0) {
      parts.push(`\n### Supporting Signals (${evidence.signals.length})`)
      for (const signal of evidence.signals) {
        parts.push(this.serializeSignal(signal))
      }
    }

    // Counter signals
    if (evidence.counterSignals.length > 0) {
      parts.push(`\n### Counter Signals (${evidence.counterSignals.length})`)
      for (const signal of evidence.counterSignals) {
        parts.push(this.serializeSignal(signal))
      }
    }

    // Evidence items
    if (evidence.evidence.length > 0) {
      parts.push(`\n### Evidence Items (${evidence.evidence.length})`)
      for (const item of evidence.evidence) {
        parts.push(this.serializeEvidenceItem(item))
      }
    }

    // Affected regions
    if (evidence.affectedRegions.length > 0) {
      parts.push(`\n### Affected Regions (${evidence.affectedRegions.length})`)
      for (const region of evidence.affectedRegions) {
        parts.push(this.serializeAffectedRegion(region))
      }
    }

    // Confidence
    parts.push(`\n### Confidence Metrics`)
    parts.push(`Overall: ${(evidence.confidence.overall * 100).toFixed(1)}%`)
    parts.push(`Model Agreement: ${(evidence.confidence.modelAgreement * 100).toFixed(1)}%`)
    parts.push(`Signal Strength: ${(evidence.confidence.signalStrength * 100).toFixed(1)}%`)
    parts.push(`Evidence Coverage: ${(evidence.confidence.evidenceCoverage * 100).toFixed(1)}%`)

    // Limitations
    if (evidence.limitations.length > 0) {
      parts.push(`\n### Limitations`)
      for (const limitation of evidence.limitations) {
        parts.push(`- ${limitation}`)
      }
    }

    return parts.join('\n')
  }

  private serializeSignal(signal: ModalitySignal): string {
    const direction =
      signal.direction === 'supporting' ? '+' : signal.direction === 'counter' ? '-' : '~'

    return (
      `  ${direction} [${signal.severity.toUpperCase()}] ${signal.name} (${signal.category}): ` +
      `value=${signal.value.toFixed(2)}, direction=${signal.direction}\n` +
      `    Detail: ${signal.detail}`
    )
  }

  private serializeEvidenceItem(item: EvidenceItem): string {
    let locationStr = ''
    if (item.location) {
      locationStr = ` | Location: ${JSON.stringify(item.location)}`
    }

    return (
      `  - [${item.category}] ${item.description} ` +
      `(confidence: ${(item.confidence * 100).toFixed(1)}%)${locationStr}`
    )
  }

  private serializeAffectedRegion(region: AffectedRegion): string {
    return (
      `  - [${region.severity.toUpperCase()}] ${region.label} (${region.type}): ` +
      `${region.description}`
    )
  }

  // ── Context Serialization ───────────────────────────────────────────────────

  private serializeRAGContext(context: RAGContext): string {
    const parts: string[] = []

    parts.push(`## RAG Context`)
    parts.push(`Query: ${context.query}`)
    parts.push(`Retrieved Documents (${context.retrievedDocuments.length}):`)

    for (const doc of context.retrievedDocuments) {
      parts.push(
        `  - [${doc.source}] (score: ${doc.score.toFixed(2)}) ${doc.content.substring(0, 200)}...`,
      )
    }

    return parts.join('\n')
  }

  private serializeCorpusContext(context: CorpusContext): string {
    const parts: string[] = []

    parts.push(`## Corpus Context`)
    parts.push(`Similar Items (${context.similarItems.length}):`)

    for (const item of context.similarItems) {
      parts.push(
        `  - [${item.source}] (similarity: ${item.similarity.toFixed(2)}) ${item.content.substring(0, 200)}...`,
      )
    }

    return parts.join('\n')
  }

  private serializeGlobalRetrieval(context: GlobalRetrieval): string {
    const parts: string[] = []

    parts.push(`## Global Retrieval`)
    parts.push(`Web Results (${context.webResults.length}):`)

    for (const result of context.webResults) {
      parts.push(
        `  - [${result.url}] (score: ${result.score.toFixed(2)}) ${result.title}: ${result.snippet.substring(0, 150)}...`,
      )
    }

    return parts.join('\n')
  }

  // ── Privacy Filtering ──────────────────────────────────────────────────────

  private filterEvidenceByPrivacy(
    evidence: EvidenceItem[],
    policy?: PrivacyPolicy,
  ): EvidenceItem[] {
    if (!policy || policy.allowSendingEvidence) {
      return evidence
    }

    // Filter out evidence that contains raw content
    return evidence.map((item) => {
      if (item.rawValue && typeof item.rawValue === 'string') {
        // Replace raw content with a placeholder
        return {
          ...item,
          rawValue: '[CONTENT_RESTRICTED]',
          description: this.sanitizeDescription(item.description),
        }
      }
      return item
    })
  }

  private filterSignalsByPrivacy(
    signals: ModalitySignal[],
    policy?: PrivacyPolicy,
  ): ModalitySignal[] {
    if (!policy || policy.allowSendingEvidence) {
      return signals
    }

    return signals.map((signal) => ({
      ...signal,
      detail: this.sanitizeDescription(signal.detail),
    }))
  }

  private sanitizeDescription(description: string): string {
    // Remove any potential raw content from descriptions
    return description
      .replace(/\[RAW_CONTENT\]/g, '[CONTENT]')
      .replace(/\[ORIGINAL_TEXT\]/g, '[TEXT]')
      .replace(/["']([^"']{50,})["']/g, '"[LONG_TEXT]"')
  }
}
