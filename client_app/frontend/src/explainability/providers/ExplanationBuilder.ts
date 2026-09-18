import type { MediaType } from '../../config/media-registry'
import type {
  ExplanationObject,
  ExplanationSignalObject,
  EvidenceObject,
  AffectedRegion,
  AffectedSegment,
} from '../types'

// ─── Explanation Builder ─────────────────────────────────────────────────────

export class ExplanationBuilder {
  private readonly limitationsMap: Record<MediaType, string[]> = {
    text: [
      'Text analysis relies on statistical patterns and may not detect sophisticated paraphrasing',
      'Attribution at token level is approximate',
      'Cannot determine authorship certainty',
    ],
    image: [
      'Heatmaps show model focus areas, not definitive proof of manipulation',
      'Attribution may not capture all manipulation types',
      'Performance depends on model training data',
    ],
    video: [
      'Frame-level analysis may miss brief manipulation artifacts',
      'Temporal attribution provides approximate time ranges',
      'Cannot detect all deepfake techniques',
    ],
    audio: [
      'Audio analysis may miss sophisticated voice synthesis',
      'Temporal localization is approximate',
      'Background noise can affect detection accuracy',
    ],
    document: [
      'Document analysis focuses on metadata and structural consistency',
      'Cannot verify content accuracy',
      'OCR quality affects text-based analysis',
    ],
  }

  async buildExplanation(
    signals: ExplanationSignalObject[],
    evidence: EvidenceObject[],
    regions: AffectedRegion[],
    segments: AffectedSegment[],
    modality: MediaType,
    verdict: string,
    _confidence: number,
  ): Promise<ExplanationObject> {
    const limitations = this.limitationsMap[modality] || []

    return {
      explanation_id: `expl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      modality,
      method: this.getAttributionMethod(modality),
      target: verdict,
      affected_regions: regions,
      affected_segments: segments,
      signals,
      evidence,
      limitations,
      model_version: '1.0.0',
      created_at: new Date().toISOString(),
    }
  }

  private getAttributionMethod(modality: MediaType): string {
    const methods: Record<MediaType, string> = {
      text: 'token_analysis',
      image: 'grad_cam',
      video: 'frame_analysis',
      audio: 'spectral_analysis',
      document: 'structural_analysis',
    }

    return methods[modality]
  }
}
