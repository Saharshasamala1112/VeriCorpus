import type { MediaType } from '../config/media-registry'
import type {
  ExplanationResult,
  ExplanationSignal,
  EvidenceItem,
  EvidenceType,
  MethodologyInfo,
  HumanExplanation,
  VerdictCategory,
  ConfidenceLevel,
  ClaimGroup,
  SourceItem,
  VerificationStatus,
} from '../types/explainability'
import type { AuthenticityResult } from './authenticity.service'

/**
 * ExplanationCache stores previously computed explanations to avoid re-computation.
 * Uses a simple Map with TTL-based expiration.
 */
class ExplanationCache {
  private cache = new Map<string, { result: ExplanationResult; timestamp: number }>()
  private readonly ttlMs: number

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs
  }

  get(key: string): ExplanationResult | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key)
      return null
    }
    return entry.result
  }

  set(key: string, result: ExplanationResult): void {
    this.cache.set(key, { result, timestamp: Date.now() })
    // Evict oldest entries if cache exceeds 100 items
    if (this.cache.size > 100) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}

/**
 * ExplanationEngine transforms a raw AuthenticityResult into a structured
 * ExplanationResult with modality-specific evidence, supporting/counter signals,
 * methodology information, and a human-readable explanation.
 *
 * This is a language-independent transformation. Localization is handled
 * separately by the ExplanationLocalization layer.
 */
export class ExplanationEngine {
  private static cache = new ExplanationCache()

  /**
   * Main entry point: transform raw result into structured explanation.
   * Uses caching to avoid re-computation for identical inputs.
   */
  static explain(result: AuthenticityResult): ExplanationResult {
    // Handle missing or invalid result
    if (!result) {
      return ExplanationEngine.createEmptyExplanation()
    }

    // Generate cache key from result properties
    const cacheKey = ExplanationEngine.generateCacheKey(result)
    const cached = ExplanationEngine.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    const modality = (result.media_type as MediaType) || 'text'
    const verdictCategory = ExplanationEngine.classifyVerdict(result.status)
    const confidenceLevel = ExplanationEngine.classifyConfidence(result.confidence)
    const signals = ExplanationEngine.classifySignals(result)
    const evidence = ExplanationEngine.extractEvidence(result, modality)
    const supporting = signals.filter((s) => s.severity === 'supporting')
    const counter = signals.filter((s) => s.severity === 'counter')

    // Apply Bayesian confidence adjustment based on signal correlation
    const adjustedConfidence = ExplanationEngine.bayesianConfidenceAdjustment(
      result.confidence,
      supporting,
      counter,
    )

    const explanation: ExplanationResult = {
      assessment: result.verdict || 'Analysis result unavailable',
      confidence: adjustedConfidence,
      confidenceLevel: ExplanationEngine.classifyConfidence(adjustedConfidence),
      verdictCategory,
      supportingSignals: supporting,
      counterSignals: counter,
      evidence,
      sourceGroups: ExplanationEngine.buildSourceGroups(result),
      methodology: ExplanationEngine.getMethodology(result, modality),
      modelVersion: ExplanationEngine.getModelVersion(result),
      datasetVersion: ExplanationEngine.getDatasetVersion(result),
      limitations: result.limitations || ['No limitations data available.'],
      modality,
      language: result.explanation?.language ?? 'en',
      rawVerdict: result.status,
      manipulationProbability: result.manipulation_probability,
      humanExplanation: ExplanationEngine.buildHumanExplanation(
        result,
        verdictCategory,
        confidenceLevel,
        supporting,
        counter,
        evidence,
      ),
    }

    // Cache the result
    ExplanationEngine.cache.set(cacheKey, explanation)

    return explanation
  }

  /**
   * Generates a cache key from result properties.
   */
  private static generateCacheKey(result: AuthenticityResult): string {
    const signalsHash = result.signals
      ? result.signals
          .map((s) => `${s.name}:${s.value}`)
          .sort()
          .join('|')
      : 'none'
    return [
      result.media_type,
      result.status,
      result.confidence?.toFixed(6),
      result.verdict,
      signalsHash,
    ].join('::')
  }

  /**
   * Creates an empty explanation when data is unavailable.
   */
  private static createEmptyExplanation(): ExplanationResult {
    return {
      assessment: 'Analysis result unavailable',
      confidence: 0,
      confidenceLevel: 'very_low',
      verdictCategory: 'inconclusive',
      supportingSignals: [],
      counterSignals: [],
      evidence: [],
      sourceGroups: [],
      methodology: {
        name: 'Unknown',
        description: 'No methodology information available.',
        version: 'unknown',
      },
      modelVersion: 'unknown',
      datasetVersion: 'unknown',
      limitations: ['Detailed model explanation is unavailable for this analysis.'],
      modality: 'text',
      language: 'en',
      humanExplanation: {
        summary: 'Detailed model explanation is unavailable for this analysis.',
        why: 'No explanation data is available.',
        keyFactors: [],
        confidenceBreakdown: 'No confidence data available.',
        limitations: 'No limitations data available.',
      },
    }
  }

  // ─── Verdict & Confidence Classification ──────────────────────────────────

  static classifyVerdict(status: string): VerdictCategory {
    switch (status) {
      case 'likely_manipulated':
        return 'likely_manipulated'
      case 'likely_authentic':
        return 'likely_authentic'
      default:
        return 'inconclusive'
    }
  }

  static classifyConfidence(confidence: number): ConfidenceLevel {
    if (confidence >= 0.9) return 'very_high'
    if (confidence >= 0.75) return 'high'
    if (confidence >= 0.5) return 'moderate'
    if (confidence >= 0.3) return 'low'
    return 'very_low'
  }

  // ─── Bayesian Confidence Adjustment ───────────────────────────────────────

  /**
   * Applies Bayesian confidence adjustment based on signal correlation and consistency.
   * When multiple independent signals agree, confidence increases.
   * When signals conflict, confidence decreases.
   */
  private static bayesianConfidenceAdjustment(
    baseConfidence: number,
    supporting: ExplanationSignal[],
    counter: ExplanationSignal[],
  ): number {
    const totalSignals = supporting.length + counter.length
    if (totalSignals === 0) return baseConfidence

    // Calculate signal agreement ratio
    const agreementRatio = supporting.length / totalSignals

    // Calculate weighted signal strength
    const supportingWeight = supporting.reduce((sum, s) => sum + (s.weight ?? 0.5), 0)
    const counterWeight = counter.reduce((sum, s) => sum + (s.weight ?? 0.5), 0)
    const totalWeight = supportingWeight + counterWeight

    if (totalWeight === 0) return baseConfidence

    // Bayesian prior: base confidence
    // Likelihood: signal agreement and strength
    const signalStrength = Math.abs(supportingWeight - counterWeight) / totalWeight
    const priorStrength = 0.4 // How much we trust the base confidence
    const likelihoodStrength = 0.6 // How much we trust the signal analysis

    // Calculate posterior confidence
    // Use weighted average that preserves more of the base confidence
    const posterior =
      priorStrength * baseConfidence + likelihoodStrength * agreementRatio * signalStrength

    // Clamp to [0, 1]
    return Math.max(0, Math.min(1, posterior))
  }

  // ─── Signal Classification ────────────────────────────────────────────────

  /**
   * Classifies raw signals into supporting/counter/neutral categories with weights.
   * Uses weighted voting and cross-signal correlation analysis.
   */
  private static classifySignals(result: AuthenticityResult): ExplanationSignal[] {
    const classified = result.signals.map((sig) => {
      const severity = ExplanationEngine.inferSignalSeverity(sig, result)
      const weight = ExplanationEngine.computeSignalWeight(sig, result)
      return {
        name: sig.name,
        value: sig.value,
        detail: sig.detail,
        severity,
        weight,
      }
    })

    // Apply cross-signal correlation adjustment
    return ExplanationEngine.applyCrossSignalCorrelation(classified, result)
  }

  /**
   * Applies cross-signal correlation to adjust weights based on signal agreement.
   */
  private static applyCrossSignalCorrelation(
    signals: ExplanationSignal[],
    result: AuthenticityResult,
  ): ExplanationSignal[] {
    const isManipulated = result.status === 'likely_manipulated'

    // Group signals by category
    const categories = new Map<string, ExplanationSignal[]>()
    for (const sig of signals) {
      const category = ExplanationEngine.categorizeSignal(sig.name)
      const existing = categories.get(category) ?? []
      existing.push(sig)
      categories.set(category, existing)
    }

    // Boost weights for signals in categories where majority agrees with verdict
    return signals.map((sig) => {
      const category = ExplanationEngine.categorizeSignal(sig.name)
      const categorySignals = categories.get(category) ?? []
      const agreeCount = categorySignals.filter(
        (s) => s.severity === (isManipulated ? 'supporting' : 'counter'),
      ).length
      const agreementRatio = agreeCount / categorySignals.length

      // Boost weight if category has strong agreement
      const weightBoost = agreementRatio > 0.7 ? 0.15 : agreementRatio < 0.3 ? -0.1 : 0
      const adjustedWeight = Math.max(0, Math.min(1, (sig.weight ?? 0.5) + weightBoost))

      return { ...sig, weight: adjustedWeight }
    })
  }

  /**
   * Categorizes a signal by its name for correlation analysis.
   */
  private static categorizeSignal(name: string): string {
    const lower = name.toLowerCase()
    if (lower.includes('detection') || lower.includes('verdict') || lower.includes('confidence'))
      return 'detection'
    if (lower.includes('vocabulary') || lower.includes('burstiness') || lower.includes('entropy'))
      return 'linguistic'
    if (lower.includes('metadata') || lower.includes('header') || lower.includes('format'))
      return 'metadata'
    if (lower.includes('pattern') || lower.includes('uniformity') || lower.includes('variation'))
      return 'pattern'
    return 'other'
  }

  /**
   * Infers whether a signal supports or counters the main assessment.
   * Uses signal name heuristics and the raw verdict to determine direction.
   */
  private static inferSignalSeverity(
    sig: { name: string; value: string; detail: string },
    result: AuthenticityResult,
  ): 'supporting' | 'counter' | 'neutral' {
    const isManipulated = result.status === 'likely_manipulated'
    const name = sig.name.toLowerCase()

    // Explicitly neutral signals
    if (
      name.includes('explainability') ||
      name.includes('integrity') ||
      name.includes('input integrity') ||
      name.includes('sample stored')
    ) {
      return 'neutral'
    }

    // Detection-related signals: direction depends on verdict
    if (
      name.includes('detection') ||
      name.includes('verdict') ||
      name.includes('confidence') ||
      name.includes('ai-writing') ||
      name.includes('ai_writing') ||
      name.includes('ai score') ||
      name.includes('ai score')
    ) {
      return isManipulated ? 'supporting' : 'counter'
    }

    // Pattern-based signals: presence of anomaly indicators supports manipulation
    if (
      name.includes('vocabulary') ||
      name.includes('burstiness') ||
      name.includes('uniformity') ||
      name.includes('variation') ||
      name.includes('entropy')
    ) {
      return isManipulated ? 'supporting' : 'counter'
    }

    // Default: supporting if manipulated, counter if authentic
    return isManipulated ? 'supporting' : 'counter'
  }

  /**
   * Computes a weight for the signal based on its relevance to the verdict.
   * Uses weighted voting across signal categories.
   */
  private static computeSignalWeight(
    sig: { name: string; value: string; detail: string },
    _result: AuthenticityResult,
  ): number {
    const name = sig.name.toLowerCase()
    if (name.includes('detection') || name.includes('confidence') || name.includes('ai-writing')) {
      return 0.9
    }
    if (name.includes('vocabulary') || name.includes('burstiness')) {
      return 0.7
    }
    if (name.includes('model') || name.includes('classifier')) {
      return 0.8
    }
    return 0.5
  }

  // ─── Human-Readable Explanation Builder ────────────────────────────────────

  /**
   * Builds a structured human-readable explanation from the analysis results.
   * This is language-independent; templates handle localization.
   */
  static buildHumanExplanation(
    result: AuthenticityResult,
    verdictCategory: VerdictCategory,
    confidenceLevel: ConfidenceLevel,
    supporting: ExplanationSignal[],
    counter: ExplanationSignal[],
    evidence: EvidenceItem[],
  ): HumanExplanation {
    const confidence = result.confidence
    const modality = result.media_type

    const summary = ExplanationEngine.buildSummary(result, verdictCategory, confidenceLevel)
    const why = ExplanationEngine.buildWhy(result, verdictCategory, confidence, supporting, counter)
    const keyFactors = ExplanationEngine.buildKeyFactors(supporting, counter, evidence)
    const confidenceBreakdown = ExplanationEngine.buildConfidenceBreakdown(
      confidence,
      confidenceLevel,
      supporting,
      counter,
      modality,
    )
    const limitations = ExplanationEngine.buildLimitationsText(result.limitations)

    return { summary, why, keyFactors, confidenceBreakdown, limitations }
  }

  private static buildSummary(
    result: AuthenticityResult,
    verdictCategory: VerdictCategory,
    _confidenceLevel: ConfidenceLevel,
  ): string {
    const mediaType = result.media_type
    const confidence = (result.confidence * 100).toFixed(0)

    switch (verdictCategory) {
      case 'likely_manipulated':
        return `This ${mediaType} analysis shows patterns consistent with AI-generated or manipulated content with ${confidence}% confidence.`
      case 'likely_authentic':
        return `This ${mediaType} analysis shows patterns consistent with human-created content with ${confidence}% confidence.`
      case 'inconclusive':
        return `This ${mediaType} analysis could not reach a definitive conclusion. The confidence level is ${confidence}%.`
    }
  }

  private static buildWhy(
    result: AuthenticityResult,
    verdictCategory: VerdictCategory,
    confidence: number,
    supporting: ExplanationSignal[],
    counter: ExplanationSignal[],
  ): string {
    const parts: string[] = []

    if (verdictCategory === 'likely_manipulated') {
      parts.push('The system detected several indicators suggesting non-human origin:')
      for (const sig of supporting.slice(0, 3)) {
        parts.push(`${sig.name}: ${sig.value} — ${sig.detail}`)
      }
      if (supporting.length > 3) {
        parts.push(`...and ${supporting.length - 3} additional supporting signal(s).`)
      }
    } else if (verdictCategory === 'likely_authentic') {
      parts.push('The analysis found patterns consistent with human-created content:')
      for (const sig of supporting.slice(0, 3)) {
        parts.push(`${sig.name}: ${sig.value} — ${sig.detail}`)
      }
      if (supporting.length > 3) {
        parts.push(`...and ${supporting.length - 3} additional supporting signal(s).`)
      }
    } else {
      parts.push('The analysis found mixed signals that prevent a clear verdict:')
      if (supporting.length > 0) {
        parts.push(`Supporting evidence: ${supporting.map((s) => s.name).join(', ')}`)
      }
      if (counter.length > 0) {
        parts.push(`Contradicting evidence: ${counter.map((s) => s.name).join(', ')}`)
      }
    }

    if (counter.length > 0 && confidence < 0.8) {
      parts.push(
        `Note: ${counter.length} counter-signal(s) were detected, which reduce overall confidence.`,
      )
    }

    // Add methodology context
    if (result.explanation?.secondary) {
      parts.push(`\nMethodology: ${result.explanation.secondary}`)
    }

    return parts.join('\n')
  }

  private static buildKeyFactors(
    supporting: ExplanationSignal[],
    counter: ExplanationSignal[],
    evidence: EvidenceItem[],
  ): string[] {
    const factors: string[] = []

    // Sort supporting signals by weight (highest first)
    const sorted = [...supporting].sort((a, b) => (b.weight ?? 0.5) - (a.weight ?? 0.5))
    for (const sig of sorted.slice(0, 4)) {
      factors.push(`${sig.name}: ${sig.value}`)
    }

    // Add counter-signals as caveats
    for (const sig of counter.slice(0, 2)) {
      factors.push(`Counter: ${sig.name} — ${sig.value}`)
    }

    // Add evidence summary
    if (evidence.length > 0) {
      const evidenceTypes = [...new Set(evidence.map((e) => e.type))]
      factors.push(
        `${evidence.length} evidence item(s) analyzed across ${evidenceTypes.length} type(s)`,
      )
    }

    return factors
  }

  private static buildConfidenceBreakdown(
    confidence: number,
    confidenceLevel: ConfidenceLevel,
    supporting: ExplanationSignal[],
    counter: ExplanationSignal[],
    modality: string,
  ): string {
    const parts: string[] = []
    const pct = (confidence * 100).toFixed(0)

    parts.push(`Overall confidence: ${pct}% (${confidenceLevel.replace('_', ' ')})`)
    parts.push(`Supporting signals: ${supporting.length}`)
    parts.push(`Counter-signals: ${counter.length}`)

    // Calculate weighted signal strength
    const totalWeight = supporting.reduce((sum, s) => sum + (s.weight ?? 0.5), 0)
    const counterWeight = counter.reduce((sum, s) => sum + (s.weight ?? 0.5), 0)
    const netWeight = totalWeight - counterWeight

    if (totalWeight > 0) {
      parts.push(`Weighted signal strength: ${totalWeight.toFixed(2)}`)
    }
    if (counterWeight > 0) {
      parts.push(`Counter-signal strength: ${counterWeight.toFixed(2)}`)
    }
    if (netWeight !== totalWeight) {
      parts.push(`Net signal strength: ${netWeight.toFixed(2)}`)
    }

    parts.push(`Analysis modality: ${modality}`)

    // Add confidence interpretation
    if (confidence >= 0.9) {
      parts.push('Interpretation: Very high confidence — strong, consistent signals.')
    } else if (confidence >= 0.75) {
      parts.push('Interpretation: High confidence — mostly consistent signals.')
    } else if (confidence >= 0.5) {
      parts.push(
        'Interpretation: Moderate confidence — some signals are consistent, others introduce uncertainty.',
      )
    } else if (confidence >= 0.3) {
      parts.push('Interpretation: Low confidence — signals are mixed or weak.')
    } else {
      parts.push('Interpretation: Very low confidence — insufficient or contradictory signals.')
    }

    return parts.join('\n')
  }

  private static buildLimitationsText(limitations: string[]): string {
    if (limitations.length === 0) {
      return 'No specific limitations have been identified for this analysis.'
    }
    return limitations.join(' ')
  }

  // ─── Evidence Extraction ──────────────────────────────────────────────────

  /**
   * Extracts modality-specific evidence from the raw result.
   */
  private static extractEvidence(result: AuthenticityResult, modality: MediaType): EvidenceItem[] {
    const evidence: EvidenceItem[] = []

    // Always include detector output as classifier evidence
    if (result.detector?.raw) {
      evidence.push(ExplanationEngine.buildClassifierEvidence(result))
    }

    // Modality-specific evidence
    switch (modality) {
      case 'text':
        evidence.push(...ExplanationEngine.buildTextEvidence(result))
        break
      case 'image':
        evidence.push(...ExplanationEngine.buildImageEvidence(result))
        break
      case 'audio':
        evidence.push(...ExplanationEngine.buildAudioEvidence(result))
        break
      case 'video':
        evidence.push(...ExplanationEngine.buildVideoEvidence(result))
        break
      case 'document':
        evidence.push(...ExplanationEngine.buildDocumentEvidence(result))
        break
    }

    return evidence
  }

  /**
   * Builds classifier output evidence from detector raw data.
   */
  private static buildClassifierEvidence(result: AuthenticityResult): EvidenceItem {
    const raw = result.detector?.raw as Record<string, unknown> | undefined
    return {
      type: 'classifier_output' as EvidenceType,
      content: JSON.stringify(raw ?? {}),
      relevance: result.confidence,
      description: `Classifier output from ${result.detector?.name ?? 'unknown'} detector.`,
      metadata: {
        detectorName: result.detector?.name,
        detectorStatus: result.detector?.status,
      },
    }
  }

  /**
   * Builds text-specific evidence items.
   */
  private static buildTextEvidence(result: AuthenticityResult): EvidenceItem[] {
    const items: EvidenceItem[] = []

    // Learning model prediction as linguistic signal
    if (result.learning?.model_prediction) {
      const pred = result.learning.model_prediction
      items.push({
        type: 'linguistic_signal',
        content: `AI score: ${(pred.ai_score * 100).toFixed(0)}% via ${pred.model}`,
        relevance: pred.ai_score,
        description: 'Statistical text classification model detected writing pattern indicators.',
        metadata: {
          aiProbability: pred.ai_score,
          classifierProbabilities: { ai: pred.ai_score, human: 1 - pred.ai_score },
        },
      })
    }

    // Explanation text as evidence
    if (result.explanation?.primary) {
      items.push({
        type: 'text_span',
        content: result.explanation.primary,
        relevance: result.confidence,
        description: 'Primary explanation from the analysis pipeline.',
      })
    }

    // Add sentence-level indicators if available
    if (result.signals?.length > 0) {
      const burstinessSignal = result.signals.find((s) =>
        s.name.toLowerCase().includes('burstiness'),
      )
      if (burstinessSignal) {
        items.push({
          type: 'sentence_indicator',
          content: `Sentence structure analysis: ${burstinessSignal.value}`,
          relevance: result.confidence,
          description: burstinessSignal.detail,
          metadata: {
            sentenceIndex: 0,
          },
        })
      }

      const vocabularySignal = result.signals.find((s) =>
        s.name.toLowerCase().includes('vocabulary'),
      )
      if (vocabularySignal) {
        items.push({
          type: 'linguistic_signal',
          content: `Vocabulary analysis: ${vocabularySignal.value}`,
          relevance: result.confidence,
          description: vocabularySignal.detail,
          metadata: {
            linguisticFeatures: {
              vocabularyConsistency: parseFloat(vocabularySignal.value) / 100 || 0,
            },
          },
        })
      }
    }

    return items
  }

  /**
   * Builds image-specific evidence items.
   */
  private static buildImageEvidence(result: AuthenticityResult): EvidenceItem[] {
    const items: EvidenceItem[] = []
    const raw = result.detector?.raw as Record<string, unknown> | undefined

    if (raw?.gradcam || raw?.reconstructed) {
      items.push({
        type: 'saliency_map',
        content: 'Saliency map data available from the forensic pipeline.',
        relevance: result.confidence,
        description: 'Grad-CAM visualization highlights regions contributing to the detection.',
        metadata: {
          gradcamAvailable: Boolean(raw.gradcam),
          confidenceMap: Boolean(raw.reconstructed),
        },
      })
    }

    if (raw?.suspicious_regions) {
      items.push({
        type: 'suspicious_region',
        content: JSON.stringify(raw.suspicious_regions),
        relevance: result.confidence,
        description: 'Regions flagged as potentially manipulated.',
      })
    }

    // Add metadata anomalies if available
    if (raw?.metadata_anomalies) {
      items.push({
        type: 'metadata_anomaly',
        content: JSON.stringify(raw.metadata_anomalies),
        relevance: result.confidence,
        description: 'Metadata anomalies detected in the image file.',
      })
    }

    return items
  }

  /**
   * Builds audio-specific evidence items.
   */
  private static buildAudioEvidence(result: AuthenticityResult): EvidenceItem[] {
    const items: EvidenceItem[] = []
    const raw = result.detector?.raw as Record<string, unknown> | undefined

    if (raw?.temporal_segments) {
      items.push({
        type: 'temporal_segment',
        content: JSON.stringify(raw.temporal_segments),
        relevance: result.confidence,
        description: 'Temporal segments analyzed for acoustic inconsistencies.',
      })
    }

    if (raw?.spectrogram) {
      items.push({
        type: 'spectrogram_region',
        content: JSON.stringify(raw.spectrogram),
        relevance: result.confidence,
        description: 'Spectrogram regions with anomalous frequency patterns.',
      })
    }

    // Add acoustic indicators if available
    if (raw?.acoustic_indicators) {
      items.push({
        type: 'acoustic_indicator',
        content: JSON.stringify(raw.acoustic_indicators),
        relevance: result.confidence,
        description: 'Acoustic indicators detected in the audio analysis.',
      })
    }

    return items
  }

  /**
   * Builds video-specific evidence items.
   */
  private static buildVideoEvidence(result: AuthenticityResult): EvidenceItem[] {
    const items: EvidenceItem[] = []
    const raw = result.detector?.raw as Record<string, unknown> | undefined

    if (raw?.suspicious_frames) {
      items.push({
        type: 'suspicious_frame',
        content: JSON.stringify(raw.suspicious_frames),
        relevance: result.confidence,
        description: 'Frames flagged as potentially manipulated.',
      })
    }

    if (raw?.temporal_segments) {
      items.push({
        type: 'temporal_segment',
        content: JSON.stringify(raw.temporal_segments),
        relevance: result.confidence,
        description: 'Temporal segments with face-swap or synthesis indicators.',
      })
    }

    return items
  }

  /**
   * Builds document-specific evidence items.
   */
  private static buildDocumentEvidence(result: AuthenticityResult): EvidenceItem[] {
    const items: EvidenceItem[] = []

    if (result.explanation?.primary) {
      items.push({
        type: 'extracted_text',
        content: result.explanation.primary,
        relevance: result.confidence,
        description: 'Extracted text analysis from the document.',
      })
    }

    // Learning model for document AI-writing detection
    if (result.learning?.model_prediction) {
      const pred = result.learning.model_prediction
      items.push({
        type: 'similarity_match',
        content: `Writing pattern similarity: ${(pred.ai_score * 100).toFixed(0)}% AI-likelihood`,
        relevance: pred.ai_score,
        description: 'Document writing patterns compared against trained AI-writing model.',
        metadata: {
          aiProbability: pred.ai_score,
          sourceDocument: result.filename,
        },
      })
    }

    // Add suspicious sections if available
    if (result.signals?.length > 0) {
      const suspiciousSections = result.signals.filter(
        (s) =>
          s.name.toLowerCase().includes('suspicious') || s.name.toLowerCase().includes('anomaly'),
      )
      for (const sig of suspiciousSections.slice(0, 3)) {
        items.push({
          type: 'suspicious_section',
          content: `${sig.name}: ${sig.value}`,
          relevance: result.confidence,
          description: sig.detail,
          metadata: {
            sectionIndex: 0,
          },
        })
      }
    }

    return items
  }

  // ─── Methodology ──────────────────────────────────────────────────────────

  /**
   * Returns methodology information based on the detector and modality.
   */
  private static getMethodology(result: AuthenticityResult, modality: MediaType): MethodologyInfo {
    const detectorName = result.detector?.name ?? 'VeriCorpus'
    const methods: Record<MediaType, MethodologyInfo> = {
      text: {
        name: `${detectorName} Text Classifier`,
        description:
          'TF-IDF + Logistic Regression text classification with continuous learning feedback loop.',
        version: 'v1.0',
      },
      image: {
        name: `${detectorName} Image Forensics`,
        description:
          'CNN-based image manipulation detection with optional Grad-CAM explainability.',
        version: 'v1.0',
      },
      audio: {
        name: `${detectorName} Audio Forensics`,
        description: 'Audio analysis pipeline for voice synthesis and manipulation detection.',
        version: 'v1.0',
      },
      video: {
        name: `${detectorName} Video Forensics`,
        description: 'Video deepfake detection with frame-level and temporal analysis.',
        version: 'v1.0',
      },
      document: {
        name: `${detectorName} Document Analysis`,
        description:
          'Document authenticity analysis combining metadata inspection and text classification.',
        version: 'v1.0',
      },
    }
    return (
      methods[modality] ?? {
        name: detectorName,
        description: 'Forensic analysis.',
        version: 'v1.0',
      }
    )
  }

  /**
   * Extracts model version from detector runtime info.
   */
  private static getModelVersion(result: AuthenticityResult): string {
    const runtime = result.detector?.runtime
    if (runtime?.model_path) {
      const match = runtime.model_path.match(/v?(\d+\.\d+(?:\.\d+)?)/)
      return match ? match[0] : 'v1.0'
    }
    return 'v1.0'
  }

  /**
   * Extracts dataset version from detector raw data.
   */
  private static getDatasetVersion(result: AuthenticityResult): string {
    const raw = result.detector?.raw as Record<string, unknown> | undefined
    return (raw?.dataset_version as string) ?? 'v1.0'
  }

  // ─── Source Group Builder ──────────────────────────────────────────────────

  /**
   * Builds claim-grouped source items from the raw result.
   * Sources are derived from signals, plagiarism matches, and detector output.
   */
  static buildSourceGroups(result: AuthenticityResult): ClaimGroup[] {
    const claimMap = new Map<string, SourceItem[]>()
    const now = new Date().toISOString()

    // 1. Evidence from plagiarism matches → global_source origin
    for (const match of result.plagiarism_matches ?? []) {
      const claim = match.source || 'External corpus match'
      const source: SourceItem = {
        id: `plagiarism-${match.source_id}-${match.match_type}-${match.similarity_score.toFixed(2)}`,
        claim,
        title: match.source,
        publisher: match.source_url ?? 'Unknown publisher',
        sourceType: match.match_type,
        temporal: {
          published_at: null,
          retrieved_at: match.retrieved_at,
          last_verified_at: null,
        },
        relevance: match.similarity_score,
        matchedClaim: match.input_span.text,
        excerpt: match.matched_text,
        url: match.source_url ?? undefined,
        verificationStatus: 'verified' as VerificationStatus,
        origin: 'global_source',
      }
      const existing = claimMap.get(claim) ?? []
      existing.push(source)
      claimMap.set(claim, existing)
    }

    // 2. Evidence from signals → model origin
    for (const signal of result.signals ?? []) {
      const claim = signal.name
      const source: SourceItem = {
        id: `signal-${signal.name}-${signal.value}`,
        claim,
        title: signal.name,
        publisher: 'VeriCorpus Analysis Engine',
        sourceType: 'model_signal',
        temporal: {
          published_at: null,
          retrieved_at: now,
          last_verified_at: now,
        },
        relevance: 0.5,
        matchedClaim: signal.detail,
        excerpt: null,
        url: null,
        verificationStatus: 'verified' as VerificationStatus,
        origin: 'model',
      }
      const existing = claimMap.get(claim) ?? []
      existing.push(source)
      claimMap.set(claim, existing)
    }

    // 3. Evidence from LLM explanation → llm_inference origin
    if (result.explanation?.primary) {
      const source: SourceItem = {
        id: 'llm-explanation-primary',
        claim: 'Content authenticity assessment',
        title: 'LLM Explanation',
        publisher: 'VeriCorpus LLM Pipeline',
        sourceType: 'inference',
        temporal: {
          published_at: null,
          retrieved_at: now,
          last_verified_at: now,
        },
        relevance: result.confidence,
        matchedClaim: result.explanation.primary,
        excerpt: result.explanation.secondary ?? null,
        url: null,
        verificationStatus: 'pending' as VerificationStatus,
        origin: 'llm_inference',
      }
      const existing = claimMap.get('Content authenticity assessment') ?? []
      existing.push(source)
      claimMap.set('Content authenticity assessment', existing)
    }

    // 4. Local corpus evidence from detector raw → local_corpus origin
    const raw = result.detector?.raw as Record<string, unknown> | undefined
    if (raw?.training_data_matches) {
      const matches = raw.training_data_matches as Array<{ name: string; score: number }>
      for (const match of matches) {
        const source: SourceItem = {
          id: `corpus-${match.name}-${match.score}`,
          claim: 'Training data similarity',
          title: match.name,
          publisher: 'VeriCorpus Training Corpus',
          sourceType: 'local_corpus',
          temporal: {
            published_at: null,
            retrieved_at: now,
            last_verified_at: null,
          },
          relevance: match.score,
          matchedClaim: `Similarity score: ${(match.score * 100).toFixed(0)}%`,
          excerpt: null,
          url: null,
          verificationStatus: 'unverified' as VerificationStatus,
          origin: 'local_corpus',
        }
        const existing = claimMap.get('Training data similarity') ?? []
        existing.push(source)
        claimMap.set('Training data similarity', existing)
      }
    }

    // 5. User-provided content evidence
    const userSource: SourceItem = {
      id: 'user-input',
      claim: 'Submitted content',
      title: result.filename || 'User input',
      publisher: 'User',
      sourceType: 'input',
      temporal: {
        published_at: null,
        retrieved_at: now,
        last_verified_at: null,
      },
      relevance: 1.0,
      matchedClaim: 'Primary input for analysis',
      excerpt: null,
      url: null,
      verificationStatus: 'verified' as VerificationStatus,
      origin: 'user_input',
    }
    const existing = claimMap.get('Submitted content') ?? []
    existing.push(userSource)
    claimMap.set('Submitted content', existing)

    // Build claim groups
    return ExplanationEngine.groupByClaim(claimMap, result)
  }

  /**
   * Groups sources by claim and classifies them as supporting/contradicting/unverified.
   */
  private static groupByClaim(
    claimMap: Map<string, SourceItem[]>,
    result: AuthenticityResult,
  ): ClaimGroup[] {
    const isManipulated = result.status === 'likely_manipulated'

    return Array.from(claimMap.entries()).map(([claim, sources]) => {
      const supporting: SourceItem[] = []
      const contradicting: SourceItem[] = []
      const unverified: SourceItem[] = []

      for (const source of sources) {
        if (source.verificationStatus === 'unverified' || source.verificationStatus === 'pending') {
          unverified.push(source)
        } else if (source.verificationStatus === 'contradicted') {
          contradicting.push(source)
        } else if (source.verificationStatus === 'expired') {
          unverified.push(source)
        } else {
          // verified — determine direction based on source origin and verdict alignment
          const sourceAlignsWithVerdict =
            (source.origin === 'model' && isManipulated) ||
            (source.origin === 'global_source' && source.relevance > 0.5) ||
            (source.origin === 'llm_inference' && isManipulated)

          if (sourceAlignsWithVerdict) {
            supporting.push(source)
          } else {
            contradicting.push(source)
          }
        }
      }

      return { claim, supporting, contradicting, unverified }
    })
  }
}
