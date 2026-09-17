import type { MediaType } from '../config/media-registry'
import type {
  ExplanationObject,
  ExplanationSignalObject,
  EvidenceObject,
  AffectedRegion,
  AffectedSegment,
  VisualizationData,
  VisualizationOptions,
} from './types'
import { TextExplainer } from './explainers/TextExplainer'
import { ImageExplainer } from './explainers/ImageExplainer'
import { VideoExplainer } from './explainers/VideoExplainer'
import { AudioExplainer } from './explainers/AudioExplainer'
import { DocumentExplainer } from './explainers/DocumentExplainer'
import { ExplanationBuilder } from './providers/ExplanationBuilder'
import { LocalizationProvider } from './providers/LocalizationProvider'
import { EvidenceVisualizer } from './providers/EvidenceVisualizer'
import { AttributionProvider } from './providers/AttributionProvider'

// ─── Explainability Engine ───────────────────────────────────────────────────

export class ExplainabilityEngine {
  private static instance: ExplainabilityEngine | null = null

  private readonly textExplainer: TextExplainer
  private readonly imageExplainer: ImageExplainer
  private readonly videoExplainer: VideoExplainer
  private readonly audioExplainer: AudioExplainer
  private readonly documentExplainer: DocumentExplainer

  private readonly attributionProvider: AttributionProvider
  private readonly localizationProvider: LocalizationProvider
  private readonly evidenceVisualizer: EvidenceVisualizer
  private readonly explanationBuilder: ExplanationBuilder

  private constructor() {
    this.textExplainer = new TextExplainer()
    this.imageExplainer = new ImageExplainer()
    this.videoExplainer = new VideoExplainer()
    this.audioExplainer = new AudioExplainer()
    this.documentExplainer = new DocumentExplainer()

    this.attributionProvider = new AttributionProvider()
    this.localizationProvider = new LocalizationProvider()
    this.evidenceVisualizer = new EvidenceVisualizer()
    this.explanationBuilder = new ExplanationBuilder()
  }

  static getInstance(): ExplainabilityEngine {
    if (!ExplainabilityEngine.instance) {
      ExplainabilityEngine.instance = new ExplainabilityEngine()
    }
    return ExplainabilityEngine.instance
  }

  // ── Public Methods ─────────────────────────────────────────────────────────

  async explainAnalysis(
    analysisResult: unknown,
    content: unknown,
    modality: MediaType,
    model?: unknown,
  ): Promise<ExplanationObject> {
    switch (modality) {
      case 'text':
        return this.textExplainer.explainTextAnalysis(analysisResult as any, content as string)

      case 'image':
        return this.imageExplainer.explainImageAnalysis(
          analysisResult as any,
          content as ImageData,
          model,
        )

      case 'video':
        return this.videoExplainer.explainVideoAnalysis(analysisResult as any, content as any)

      case 'audio':
        return this.audioExplainer.explainAudioAnalysis(analysisResult as any, content as any)

      case 'document':
        return this.documentExplainer.explainDocumentAnalysis(analysisResult as any, content as any)

      default:
        throw new Error(`Unsupported modality: ${modality}`)
    }
  }

  async explainWithSignals(
    signals: ExplanationSignalObject[],
    evidence: EvidenceObject[],
    modality: MediaType,
    verdict: string,
    confidence: number,
    content?: unknown,
  ): Promise<ExplanationObject> {
    // Localize signals
    const { regions, segments } = await this.localizationProvider.localize(
      signals,
      content || null,
      modality,
    )

    // Build explanation
    return this.explanationBuilder.buildExplanation(
      signals,
      evidence,
      regions,
      segments,
      modality,
      verdict,
      confidence,
    )
  }

  async computeAttribution(
    input: {
      model: unknown
      input_data: unknown
      input_size?: { width: number; height: number }
      target_class?: string
      target_layer?: string
    },
    method: 'grad_cam' | 'grad_cam_plus_plus' | 'integrated_gradients' | 'saliency' | 'occlusion',
  ): Promise<import('./types').AttributionResult> {
    return this.attributionProvider.computeAttribution(input, method)
  }

  async localizeSignals(
    signals: ExplanationSignalObject[],
    content: unknown,
    modality: MediaType,
  ): Promise<{ regions: AffectedRegion[]; segments: AffectedSegment[] }> {
    return this.localizationProvider.localize(signals, content, modality)
  }

  async visualizeEvidence(
    evidence: EvidenceObject[],
    modality: MediaType,
    options?: VisualizationOptions,
  ): Promise<VisualizationData[]> {
    return this.evidenceVisualizer.visualize(evidence, modality, options)
  }

  getSupportedModalities(): MediaType[] {
    return ['text', 'image', 'video', 'audio', 'document']
  }

  getAttributionMethods(): string[] {
    return this.attributionProvider.getSupportedMethods()
  }

  // ── Factory Methods ────────────────────────────────────────────────────────

  createSignal(params: {
    name: string
    score: number
    explanation: string
    signal_type: string
    direction?: 'supporting' | 'counter' | 'neutral'
    severity?: 'high' | 'medium' | 'low' | 'info'
    affected_region_ids?: string[]
  }): ExplanationSignalObject {
    return {
      id: `signal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: params.name,
      signal_type: params.signal_type as ExplanationSignalObject['signal_type'],
      direction: params.direction ?? 'neutral',
      severity: params.severity ?? 'medium',
      score: params.score,
      explanation: params.explanation,
      affected_region_ids: params.affected_region_ids || [],
    }
  }

  createEvidence(params: {
    type: EvidenceObject['type']
    content: string
    description: string
    confidence: number
    location?: {
      start_offset?: number
      end_offset?: number
      start_time?: number
      end_time?: number
      x?: number
      y?: number
      width?: number
      height?: number
      page?: number
    }
  }): EvidenceObject {
    return {
      id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: params.type,
      content: params.content,
      description: params.description,
      confidence: params.confidence,
      location: params.location,
    }
  }

  createRegion(params: {
    label: string
    importance: number
    explanation: string
    signal_type: AffectedRegion['signal_type']
    coordinates: AffectedRegion['coordinates']
    type?: AffectedRegion['type']
  }): AffectedRegion {
    return {
      id: `region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: params.label,
      importance: params.importance,
      explanation: params.explanation,
      signal_type: params.signal_type,
      coordinates: params.coordinates,
      type: params.type || 'attribution',
    }
  }

  createSegment(params: {
    label: string
    importance: number
    explanation: string
    signal_type: AffectedSegment['signal_type']
    location: AffectedSegment['location']
    type: AffectedSegment['type']
  }): AffectedSegment {
    return {
      id: `segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label: params.label,
      importance: params.importance,
      explanation: params.explanation,
      signal_type: params.signal_type,
      location: params.location,
      type: params.type,
    }
  }
}
