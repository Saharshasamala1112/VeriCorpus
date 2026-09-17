import type { MediaType } from '../config/media-registry'
import type {
  MediaInput,
  TextInput,
  ImageInput,
  AudioInput,
  VideoInput,
  DocumentInput,
  AuthenticityAssessment,
  ModalitySignal,
  EvidenceItem,
  AffectedRegion,
  ConfidenceMetrics,
  EngineConfig,
  AssessmentVerdict,
} from './types'
import { TextAnalyzer } from './analyzers/TextAnalyzer'
import { ImageAnalyzer } from './analyzers/ImageAnalyzer'
import { AudioAnalyzer } from './analyzers/AudioAnalyzer'
import { VideoAnalyzer } from './analyzers/VideoAnalyzer'
import { DocumentAnalyzer } from './analyzers/DocumentAnalyzer'

// ─── Default Configuration ───────────────────────────────────────────────────

const DEFAULT_CONFIG: EngineConfig = {
  enabledModalities: ['text', 'image', 'audio', 'video', 'document'],
  confidenceThresholds: {
    high: 0.75,
    moderate: 0.5,
    low: 0.25,
  },
  maxEvidencePerModality: 20,
  enableLogging: false,
}

// ─── SHA-256 Hash Utility ────────────────────────────────────────────────────

async function computeSHA256(input: File | Blob | string): Promise<string> {
  if (typeof input === 'string') {
    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  const buffer = await input.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ─── Main Engine ─────────────────────────────────────────────────────────────

export class AuthenticityEngine {
  private config: EngineConfig
  private analyzers: Map<
    MediaType,
    TextAnalyzer | ImageAnalyzer | AudioAnalyzer | VideoAnalyzer | DocumentAnalyzer
  >

  constructor(config?: Partial<EngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config }

    this.analyzers = new Map()
    this.analyzers.set('text', new TextAnalyzer())
    this.analyzers.set('image', new ImageAnalyzer())
    this.analyzers.set('audio', new AudioAnalyzer())
    this.analyzers.set('video', new VideoAnalyzer())
    this.analyzers.set('document', new DocumentAnalyzer())
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async analyze(input: MediaInput): Promise<AuthenticityAssessment> {
    if (!this.config.enabledModalities.includes(input.mediaType)) {
      return this.createInsufficientEvidenceResult(input, 'Modality not enabled')
    }

    const analyzer = this.analyzers.get(input.mediaType)
    if (!analyzer) {
      return this.createInsufficientEvidenceResult(input, 'No analyzer available')
    }

    try {
      const result = await analyzer.analyze(input as any)

      // Limit evidence per modality
      const limitedEvidence = result.evidence.slice(0, this.config.maxEvidencePerModality)

      // Compute verdict
      const verdict = this.computeVerdict(result.signals, result.counterSignals)

      // Compute confidence
      const confidence = this.computeConfidence(
        result.signals,
        result.counterSignals,
        limitedEvidence,
      )

      // Compute affected regions
      const affectedRegions = this.deduplicateRegions(result.affectedRegions)
      const affectedSegments = this.deduplicateRegions(result.affectedSegments)

      // Collect all limitations
      const limitations = [
        ...result.limitations,
        ...this.generateLimitations(input.mediaType, confidence, result.signals),
      ]

      // Compute SHA-256
      let sha256 = input.sha256 || ''
      if (!sha256) {
        if (input.mediaType === 'text') {
          sha256 = await computeSHA256((input as TextInput).content)
        } else {
          const file = (input as ImageInput | AudioInput | VideoInput | DocumentInput).file
          if (file) sha256 = await computeSHA256(file)
        }
      }

      return {
        verdict,
        confidence,
        signals: result.signals,
        counterSignals: result.counterSignals,
        evidence: limitedEvidence,
        affectedRegions,
        affectedSegments,
        limitations,
        modality: input.mediaType,
        input: {
          filename: input.filename,
          sizeBytes: input.sizeBytes,
          sha256,
        },
        metadata: result.metadata,
        analysisTimestamp: new Date().toISOString(),
      }
    } catch (error) {
      return this.createInsufficientEvidenceResult(
        input,
        `Analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }

  // ── Verdict Computation ───────────────────────────────────────────────────

  private computeVerdict(
    signals: ModalitySignal[],
    counterSignals: ModalitySignal[],
  ): AssessmentVerdict {
    const supportingScore = this.computeSignalScore(signals)
    const counterScore = this.computeSignalScore(counterSignals)

    const netScore = supportingScore - counterScore

    // No strong signals either way
    if (Math.abs(netScore) < 0.1 && signals.length === 0 && counterSignals.length === 0) {
      return 'INSUFFICIENT_EVIDENCE'
    }

    // Weak evidence
    if (Math.abs(netScore) < 0.15) {
      return 'UNCERTAIN'
    }

    // Strong manipulation signals
    if (netScore > 0.3) return 'LIKELY_MANIPULATED'
    if (netScore > 0.15) return 'LIKELY_MANIPULATED'

    // Strong authenticity signals
    if (netScore < -0.3) return 'LIKELY_AUTHENTIC'
    if (netScore < -0.15) return 'LIKELY_AUTHENTIC'

    return 'UNCERTAIN'
  }

  private computeSignalScore(signals: ModalitySignal[]): number {
    if (signals.length === 0) return 0

    let score = 0
    for (const signal of signals) {
      const weight = this.getSignalWeight(signal.severity)
      score += signal.value * weight
    }

    return Math.min(1, score / signals.length)
  }

  private getSignalWeight(severity: string): number {
    switch (severity) {
      case 'high':
        return 1.0
      case 'medium':
        return 0.6
      case 'low':
        return 0.3
      case 'info':
        return 0.1
      default:
        return 0.5
    }
  }

  // ── Confidence Computation ────────────────────────────────────────────────

  private computeConfidence(
    signals: ModalitySignal[],
    counterSignals: ModalitySignal[],
    evidence: EvidenceItem[],
  ): ConfidenceMetrics {
    const totalSignals = signals.length + counterSignals.length

    // Model agreement - how consistent are the signals
    const supportingWeights = signals.map((s) => s.value * this.getSignalWeight(s.severity))
    const counterWeights = counterSignals.map((s) => s.value * this.getSignalWeight(s.severity))
    const modelAgreement = this.computeAgreement(supportingWeights, counterWeights)

    // Signal strength - how strong are the signals
    const signalStrength =
      totalSignals > 0
        ? (supportingWeights.reduce((a, b) => a + b, 0) +
            counterWeights.reduce((a, b) => a + b, 0)) /
          totalSignals
        : 0

    // Evidence coverage - how much evidence do we have
    const evidenceCoverage = Math.min(1, evidence.length / 10)

    // Overall confidence
    const overall = modelAgreement * 0.4 + signalStrength * 0.3 + evidenceCoverage * 0.3

    // Limitations based on confidence
    const limitations: string[] = []
    if (overall < 0.3) {
      limitations.push('Low overall confidence in assessment')
    }
    if (evidenceCoverage < 0.3) {
      limitations.push('Limited evidence available')
    }
    if (modelAgreement < 0.5) {
      limitations.push('Mixed signals detected')
    }

    return {
      overall: Math.min(1, overall),
      modelAgreement,
      signalStrength,
      evidenceCoverage,
      limitations,
    }
  }

  private computeAgreement(supporting: number[], counter: number[]): number {
    if (supporting.length === 0 && counter.length === 0) return 0.5

    const supportingSum = supporting.reduce((a, b) => a + b, 0)
    const counterSum = counter.reduce((a, b) => a + b, 0)
    const total = supportingSum + counterSum

    if (total === 0) return 0.5

    const ratio = Math.max(supportingSum, counterSum) / total
    return ratio
  }

  // ── Region Deduplication ──────────────────────────────────────────────────

  private deduplicateRegions(regions: AffectedRegion[]): AffectedRegion[] {
    const seen = new Set<string>()
    const unique: AffectedRegion[] = []

    for (const region of regions) {
      const startSeconds = 'startSeconds' in region.location ? region.location.startSeconds : 0
      const xCoord = 'x' in region.location ? region.location.x : 0
      const key = `${region.type}-${Math.round(startSeconds || 0)}-${Math.round(xCoord || 0)}`
      if (!seen.has(key)) {
        seen.add(key)
        unique.push(region)
      }
    }

    return unique
  }

  // ── Limitations Generation ────────────────────────────────────────────────

  private generateLimitations(
    modality: MediaType,
    confidence: ConfidenceMetrics,
    signals: ModalitySignal[],
  ): string[] {
    const limitations: string[] = []

    // Modality-specific limitations
    switch (modality) {
      case 'text':
        limitations.push(
          'Text analysis relies on statistical patterns and may not detect sophisticated AI writing',
        )
        limitations.push('Short texts may not provide enough data for reliable analysis')
        break
      case 'image':
        limitations.push('Image analysis cannot detect all forms of manipulation')
        limitations.push('High-quality manipulations may evade detection')
        limitations.push(
          'Analysis is based on pixel-level features and may miss semantic manipulation',
        )
        break
      case 'audio':
        limitations.push('Audio analysis may not detect high-quality voice synthesis')
        limitations.push('Background noise can affect analysis accuracy')
        limitations.push('Short audio clips may not provide enough data')
        break
      case 'video':
        limitations.push('Video analysis is computationally intensive and samples frames')
        limitations.push('High-quality deepfakes may evade detection')
        limitations.push('Face detection may not work for all angles or lighting conditions')
        break
      case 'document':
        limitations.push('Document analysis may not detect all forms of content manipulation')
        limitations.push('Metadata can be spoofed or removed')
        limitations.push('OCR-based analysis depends on document format')
        break
    }

    // Confidence-based limitations
    if (confidence.overall < 0.5) {
      limitations.push('Overall confidence is moderate - consider additional verification')
    }

    if (signals.length < 3) {
      limitations.push('Limited number of signals detected')
    }

    return limitations
  }

  // ── Insufficient Evidence Result ──────────────────────────────────────────

  private createInsufficientEvidenceResult(
    input: MediaInput,
    reason: string,
  ): AuthenticityAssessment {
    return {
      verdict: 'INSUFFICIENT_EVIDENCE',
      confidence: {
        overall: 0,
        modelAgreement: 0,
        signalStrength: 0,
        evidenceCoverage: 0,
        limitations: [reason],
      },
      signals: [],
      counterSignals: [],
      evidence: [],
      affectedRegions: [],
      affectedSegments: [],
      limitations: [reason],
      modality: input.mediaType,
      input: {
        filename: input.filename,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256 || '',
      },
      metadata: {},
      analysisTimestamp: new Date().toISOString(),
    }
  }

  // ── Configuration ─────────────────────────────────────────────────────────

  updateConfig(config: Partial<EngineConfig>): void {
    this.config = { ...this.config, ...config }
  }

  getConfig(): EngineConfig {
    return { ...this.config }
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let engineInstance: AuthenticityEngine | null = null

export function getAuthenticityEngine(config?: Partial<EngineConfig>): AuthenticityEngine {
  if (!engineInstance) {
    engineInstance = new AuthenticityEngine(config)
  }
  return engineInstance
}

export function resetAuthenticityEngine(): void {
  engineInstance = null
}
