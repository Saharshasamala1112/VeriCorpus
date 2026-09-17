import type {
  IImageExplainer,
  ExplanationObject,
  ExplanationSignalObject,
  EvidenceObject,
  BoundingBox,
  AttributionResult,
} from '../types'
import { ExplanationBuilder } from '../providers/ExplanationBuilder'
import { LocalizationProvider } from '../providers/LocalizationProvider'
import { AttributionProvider } from '../providers/AttributionProvider'

// ─── Image Explainer ─────────────────────────────────────────────────────────

export class ImageExplainer implements IImageExplainer {
  private readonly builder: ExplanationBuilder
  private readonly localization: LocalizationProvider
  private readonly attribution: AttributionProvider

  constructor() {
    this.builder = new ExplanationBuilder()
    this.localization = new LocalizationProvider()
    this.attribution = new AttributionProvider()
  }

  async explainImageAnalysis(
    analysisResult: ImageAnalysisResult,
    imageData: ImageData,
    model?: unknown,
  ): Promise<ExplanationObject> {
    // Extract signals from analysis
    const signals = this.extractSignals(analysisResult)

    // Extract evidence
    const evidence = this.extractEvidence(analysisResult)

    // Localize signals
    const { regions, segments } = await this.localization.localize(signals, imageData, 'image')

    // Compute attribution if model is available
    let attributionResult: AttributionResult | undefined
    if (model) {
      try {
        attributionResult = await this.computeAttribution(model, imageData)
        // Merge attribution regions
        regions.push(...attributionResult.affected_regions)
      } catch {
        // Attribution failed, continue without it
      }
    }

    // Build explanation
    const explanation = await this.builder.buildExplanation(
      signals,
      evidence,
      regions,
      segments,
      'image',
      analysisResult.verdict || 'UNCERTAIN',
      analysisResult.confidence || 0.5,
    )

    // Add attribution data if available
    if (attributionResult) {
      explanation.attribution.method = attributionResult.method
      explanation.attribution.heatmap = attributionResult.heatmap
    }

    return explanation
  }

  // ── Signal Extraction ──────────────────────────────────────────────────────

  private extractSignals(analysisResult: ImageAnalysisResult): ExplanationSignalObject[] {
    const signals: ExplanationSignalObject[] = []

    // Visual artifact signals
    if (analysisResult.visual_artifacts) {
      const artifacts = analysisResult.visual_artifacts

      if (artifacts.has_artifacts) {
        signals.push({
          id: `artifacts-${Date.now()}`,
          name: 'Visual Artifacts',
          score: artifacts.severity || 0.5,
          explanation: this.explainVisualArtifacts(artifacts),
          signal_type: 'manipulation',
          affected_region_ids: artifacts.affected_regions?.map((r) => r.id) || [],
        })
      }
    }

    // Compression analysis signals
    if (analysisResult.compression_analysis) {
      const compression = analysisResult.compression_analysis

      if (compression.double_compression_detected) {
        signals.push({
          id: `double-compression-${Date.now()}`,
          name: 'Double Compression',
          score: 0.7,
          explanation:
            'Image shows signs of double compression, which may indicate re-saving after manipulation',
          signal_type: 'manipulation',
          affected_region_ids: [],
        })
      }

      if (compression.anomaly_score && compression.anomaly_score > 0.5) {
        signals.push({
          id: `compression-anomaly-${Date.now()}`,
          name: 'Compression Anomaly',
          score: compression.anomaly_score,
          explanation: `Compression pattern anomaly detected (score: ${(compression.anomaly_score * 100).toFixed(1)}%)`,
          signal_type: 'manipulation',
          affected_region_ids: [],
        })
      }
    }

    // Metadata signals
    if (analysisResult.metadata) {
      const metadata = analysisResult.metadata

      if (metadata.ai_generator_detected) {
        signals.push({
          id: `ai-generator-${Date.now()}`,
          name: 'AI Generator Detected',
          score: metadata.generator_confidence || 0.8,
          explanation: `Metadata indicates AI generator: ${metadata.generator_name || 'unknown'}`,
          signal_type: 'ai_generation',
          affected_region_ids: [],
        })
      }

      if (metadata.inconsistencies && metadata.inconsistencies.length > 0) {
        signals.push({
          id: `metadata-inconsistency-${Date.now()}`,
          name: 'Metadata Inconsistencies',
          score: 0.6,
          explanation: `Found ${metadata.inconsistencies.length} metadata inconsistency(ies)`,
          signal_type: 'metadata_anomaly',
          affected_region_ids: [],
        })
      }
    }

    // Frequency domain signals
    if (analysisResult.frequency_analysis) {
      const freq = analysisResult.frequency_analysis

      if (freq.anomaly_detected) {
        signals.push({
          id: `freq-anomaly-${Date.now()}`,
          name: 'Frequency Domain Anomaly',
          score: freq.confidence || 0.5,
          explanation: this.explainFrequencyAnomaly(freq),
          signal_type: 'manipulation',
          affected_region_ids: [],
        })
      }
    }

    // Model-based signals
    if (analysisResult.model_signals) {
      const models = analysisResult.model_signals

      for (const modelSignal of models) {
        if (modelSignal.detected) {
          signals.push({
            id: `model-${modelSignal.model_name}-${Date.now()}`,
            name: `${modelSignal.model_name} Detection`,
            score: modelSignal.confidence,
            explanation: `${modelSignal.model_name} patterns detected with ${(modelSignal.confidence * 100).toFixed(1)}% confidence`,
            signal_type: 'ai_generation',
            affected_region_ids: [],
          })
        }
      }
    }

    return signals
  }

  private explainVisualArtifacts(artifacts: {
    has_artifacts: boolean
    severity?: number
    artifact_types?: string[]
    affected_regions?: Array<{ id: string }>
  }): string {
    const types = artifacts.artifact_types || ['unknown']
    const severity = artifacts.severity || 0.5

    return `Visual artifacts detected (${types.join(', ')}). Severity: ${(severity * 100).toFixed(0)}%. ${
      artifacts.affected_regions && artifacts.affected_regions.length > 0
        ? `${artifacts.affected_regions.length} affected region(s) identified.`
        : ''
    }`
  }

  private explainFrequencyAnomaly(freq: {
    anomaly_detected: boolean
    confidence?: number
    description?: string
  }): string {
    return (
      freq.description ||
      `Frequency domain analysis detected anomalies with ${(freq.confidence || 0.5) * 100}% confidence. This may indicate manipulation or processing artifacts.`
    )
  }

  // ── Evidence Extraction ────────────────────────────────────────────────────

  private extractEvidence(analysisResult: ImageAnalysisResult): EvidenceObject[] {
    const evidence: EvidenceObject[] = []

    // Visual artifact evidence
    if (analysisResult.visual_artifacts?.affected_regions) {
      for (const region of analysisResult.visual_artifacts.affected_regions) {
        evidence.push({
          id: `artifact-evidence-${region.id}`,
          type: 'heatmap',
          content: 'Visual artifact region',
          description: `Region showing visual artifacts`,
          confidence: region.score || 0.5,
          location: region.bbox
            ? {
                x: region.bbox.x,
                y: region.bbox.y,
                width: region.bbox.width,
                height: region.bbox.height,
              }
            : undefined,
        })
      }
    }

    // Inconsistent region evidence
    if (analysisResult.inconsistent_regions) {
      for (const region of analysisResult.inconsistent_regions) {
        evidence.push({
          id: `inconsistent-${region.id}`,
          type: 'attribution_map',
          content: 'Inconsistent region',
          description: region.description || `Region with inconsistent characteristics`,
          confidence: region.confidence || 0.5,
          location: region.bbox
            ? {
                x: region.bbox.x,
                y: region.bbox.y,
                width: region.bbox.width,
                height: region.bbox.height,
              }
            : undefined,
        })
      }
    }

    // Metadata evidence
    if (analysisResult.metadata?.exif_data) {
      evidence.push({
        id: `exif-${Date.now()}`,
        type: 'metadata',
        content: JSON.stringify(analysisResult.metadata.exif_data),
        description: 'EXIF metadata analysis',
        confidence: 0.8,
      })
    }

    // Embedding evidence
    if (analysisResult.embedding_analysis?.outlier_score !== undefined) {
      evidence.push({
        id: `embedding-${Date.now()}`,
        type: 'feature_vector',
        content: `Outlier score: ${analysisResult.embedding_analysis.outlier_score}`,
        description: `Embedding space analysis shows outlier score of ${(analysisResult.embedding_analysis.outlier_score * 100).toFixed(1)}%`,
        confidence: analysisResult.embedding_analysis.outlier_score,
      })
    }

    return evidence
  }

  // ── Attribution Computation ────────────────────────────────────────────────

  private async computeAttribution(
    model: unknown,
    imageData: ImageData,
  ): Promise<AttributionResult> {
    const input = {
      model,
      input_data: imageData,
      input_size: { width: imageData.width, height: imageData.height },
    }

    // Try Grad-CAM first (most common for CNNs)
    if (this.attribution.isSupported('cnn')) {
      return this.attribution.computeAttribution(input, 'grad_cam')
    }

    // Fallback to saliency
    return this.attribution.computeAttribution(input, 'saliency')
  }
}

// ─── Image Analysis Result Type ──────────────────────────────────────────────

interface ImageAnalysisResult {
  verdict?: string
  confidence?: number
  visual_artifacts?: {
    has_artifacts: boolean
    severity?: number
    artifact_types?: string[]
    affected_regions?: Array<{
      id: string
      score?: number
      bbox?: BoundingBox
    }>
  }
  compression_analysis?: {
    double_compression_detected: boolean
    anomaly_score?: number
    compression_type?: string
  }
  metadata?: {
    ai_generator_detected: boolean
    generator_name?: string
    generator_confidence?: number
    inconsistencies?: string[]
    exif_data?: Record<string, unknown>
  }
  frequency_analysis?: {
    anomaly_detected: boolean
    confidence?: number
    description?: string
  }
  model_signals?: Array<{
    model_name: string
    detected: boolean
    confidence: number
    features?: string[]
  }>
  inconsistent_regions?: Array<{
    id: string
    description?: string
    confidence?: number
    bbox?: BoundingBox
  }>
  embedding_analysis?: {
    outlier_score?: number
    cluster_id?: number
    distance_to_center?: number
  }
}
