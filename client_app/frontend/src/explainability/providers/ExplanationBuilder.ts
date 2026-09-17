import type { MediaType } from '../../config/media-registry'
import type {
  IExplanationBuilder,
  ExplanationObject,
  ExplanationSignalObject,
  EvidenceObject,
  AffectedRegion,
  AffectedSegment,
  ExplanationSignals,
  Evidence,
  Confidence,
  Attribution,
  ModalityLimitations,
  Visualizations,
} from '../types'

// ─── Explanation Builder ─────────────────────────────────────────────────────

export class ExplanationBuilder implements IExplanationBuilder {
  private readonly limitationsMap: Record<MediaType, ModalityLimitations> = {
    text: {
      supported: true,
      attribution_method: 'token_analysis',
      limitations: [
        'Text analysis relies on statistical patterns and may not detect sophisticated paraphrasing',
        'Attribution at token level is approximate',
        'Cannot determine authorship certainty',
      ],
      granularity: 'token',
    },
    image: {
      supported: true,
      attribution_method: 'grad_cam',
      limitations: [
        'Heatmaps show model focus areas, not definitive proof of manipulation',
        'Attribution may not capture all manipulation types',
        'Performance depends on model training data',
      ],
      granularity: 'spatial',
    },
    video: {
      supported: true,
      attribution_method: 'frame_analysis',
      limitations: [
        'Frame-level analysis may miss brief manipulation artifacts',
        'Temporal attribution provides approximate time ranges',
        'Cannot detect all deepfake techniques',
      ],
      granularity: 'temporal',
    },
    audio: {
      supported: true,
      attribution_method: 'spectral_analysis',
      limitations: [
        'Audio analysis may miss sophisticated voice synthesis',
        'Temporal localization is approximate',
        'Background noise can affect detection accuracy',
      ],
      granularity: 'temporal',
    },
    document: {
      supported: true,
      attribution_method: 'structural_analysis',
      limitations: [
        'Document analysis focuses on metadata and structural consistency',
        'Cannot verify content accuracy',
        'OCR quality affects text-based analysis',
      ],
      granularity: 'page',
    },
  }

  async buildExplanation(
    signals: ExplanationSignalObject[],
    evidence: EvidenceObject[],
    regions: AffectedRegion[],
    segments: AffectedSegment[],
    modality: MediaType,
    verdict: string,
    confidence: number,
  ): Promise<ExplanationObject> {
    const explanationSignals = this.buildSignals(signals)
    const explanationEvidence = this.buildEvidence(evidence)
    const explanationConfidence = this.buildConfidence(confidence, regions, segments)
    const attribution = this.buildAttribution(regions, segments, modality)
    const limitations = this.limitationsMap[modality]
    const visualizations: Visualizations = {
      available: true,
      types: [],
    }

    return {
      summary: this.buildSummary(verdict, confidence, modality, signals),
      detailed: this.buildDetailedExplanation(signals, evidence, regions, segments, modality),
      signals: explanationSignals,
      evidence: explanationEvidence,
      confidence: explanationConfidence,
      attribution,
      limitations,
      visualizations,
    }
  }

  // ── Summary Building ───────────────────────────────────────────────────────

  private buildSummary(
    verdict: string,
    confidence: number,
    modality: MediaType,
    signals: ExplanationSignalObject[],
  ): string {
    const confidenceText = this.getConfidenceText(confidence)
    const significantSignals = signals.filter((s) => s.score > 0.6)

    let summary = `Analysis of this ${modality} content yielded a verdict of **${this.formatVerdict(verdict)}** with ${confidenceText} confidence.`

    if (significantSignals.length > 0) {
      summary += ` ${significantSignals.length} significant ${significantSignals.length === 1 ? 'signal was' : 'signals were'} detected, including: ${significantSignals.map((s) => s.name).join(', ')}.`
    } else {
      summary += ` No significant manipulation signals were detected.`
    }

    summary += ` The analysis identified ${regions.length} affected region${regions.length !== 1 ? 's' : ''} and ${segments.length} relevant segment${segments.length !== 1 ? 's' : ''}.`

    return summary
  }

  private formatVerdict(verdict: string): string {
    const verdictMap: Record<string, string> = {
      LIKELY_AUTHENTIC: 'Likely Authentic',
      LIKELY_MANIPULATED: 'Likely Manipulated',
      UNCERTAIN: 'Uncertain',
      INSUFFICIENT_EVIDENCE: 'Insufficient Evidence',
    }

    return verdictMap[verdict] || verdict
  }

  private getConfidenceText(confidence: number): string {
    if (confidence >= 0.9) return 'very high'
    if (confidence >= 0.75) return 'high'
    if (confidence >= 0.5) return 'moderate'
    if (confidence >= 0.25) return 'low'
    return 'very low'
  }

  // ── Detailed Explanation ───────────────────────────────────────────────────

  private buildDetailedExplanation(
    signals: ExplanationSignalObject[],
    evidence: EvidenceObject[],
    regions: AffectedRegion[],
    segments: AffectedSegment[],
    modality: MediaType,
  ): string {
    const parts: string[] = []

    // Signal analysis
    if (signals.length > 0) {
      parts.push('## Signal Analysis\n')
      for (const signal of signals) {
        const scoreText = (signal.score * 100).toFixed(1)
        parts.push(`### ${signal.name} (${scoreText}%)\n`)
        parts.push(`${signal.explanation}\n`)

        if (signal.signal_type === 'manipulation' || signal.signal_type === 'ai_generation') {
          parts.push(
            `⚠️ This signal indicates potential ${signal.signal_type === 'ai_generation' ? 'AI generation' : 'manipulation'}.\n`,
          )
        }
      }
    }

    // Evidence summary
    if (evidence.length > 0) {
      parts.push('## Evidence\n')
      const evidenceByType = this.groupEvidenceByType(evidence)

      for (const [type, items] of Object.entries(evidenceByType)) {
        parts.push(`### ${this.formatEvidenceType(type)}\n`)
        for (const item of items.slice(0, 3)) {
          parts.push(`- ${item.description}`)
        }
        if (items.length > 3) {
          parts.push(`- ... and ${items.length - 3} more items`)
        }
        parts.push('')
      }
    }

    // Localization summary
    if (regions.length > 0 || segments.length > 0) {
      parts.push('## Localization\n')
      parts.push(this.generateLocalizationSummary(regions, segments, modality))
    }

    // Important disclaimer
    parts.push(this.generateDisclaimer(modality))

    return parts.join('\n')
  }

  private groupEvidenceByType(evidence: EvidenceObject[]): Record<string, EvidenceObject[]> {
    const grouped: Record<string, EvidenceObject[]> = {}

    for (const item of evidence) {
      const type = item.type || 'unknown'
      if (!grouped[type]) {
        grouped[type] = []
      }
      grouped[type].push(item)
    }

    return grouped
  }

  private formatEvidenceType(type: string): string {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
  }

  private generateLocalizationSummary(
    regions: AffectedRegion[],
    segments: AffectedSegment[],
    _modality: MediaType,
  ): string {
    const parts: string[] = []

    if (regions.length > 0) {
      parts.push(
        `**${regions.length} affected region${regions.length !== 1 ? 's' : ''} identified:**`,
      )
      for (const region of regions.slice(0, 3)) {
        const importanceText = (region.importance * 100).toFixed(0)
        parts.push(`- ${region.label} (${importanceText}% importance)`)
      }
    }

    if (segments.length > 0) {
      parts.push(
        `\n**${segments.length} relevant segment${segments.length !== 1 ? 's' : ''} identified:**`,
      )
      for (const segment of segments.slice(0, 5)) {
        const locationText = this.formatSegmentLocation(segment)
        parts.push(`- ${segment.label} at ${locationText}`)
      }
    }

    if (segments.length > 5) {
      parts.push(`\n*${segments.length - 5} additional segments available in detailed view*`)
    }

    parts.push('')
    return parts.join('\n')
  }

  private formatSegmentLocation(segment: AffectedSegment): string {
    const loc = segment.location
    if (!loc) return 'unknown location'

    if (segment.type === 'temporal') {
      return `${loc.start.toFixed(1)}s - ${loc.end.toFixed(1)}s`
    }

    if (segment.type === 'textual' || segment.type === 'paragraph') {
      return `character ${loc.start}-${loc.end}`
    }

    if (segment.type === 'page') {
      return `page ${loc.page || '?'}`
    }

    return `${loc.start}-${loc.end}`
  }

  private generateDisclaimer(modality: MediaType): string {
    const disclaimers: Record<string, string> = {
      image: `\n---\n\n**Important Note:** The heatmap and attribution visualizations show model focus areas and should NOT be interpreted as definitive proof of manipulation. These are interpretability tools that help understand the model's reasoning, not evidence of tampering.\n`,
      video: `\n---\n\n**Important Note:** Temporal localization provides approximate time ranges where signals were detected. These should be used as a guide for manual review, not as definitive evidence of manipulation.\n`,
      audio: `\n---\n\n**Important Note:** Audio analysis identifies patterns that may indicate synthesis or manipulation but cannot definitively confirm authenticity. Results should be considered alongside other evidence.\n`,
    }

    return (
      disclaimers[modality] ||
      '\n---\n\n**Important Note:** Analysis results should be interpreted with caution and are not definitive proof of authenticity or manipulation.\n'
    )
  }

  // ── Signal Building ────────────────────────────────────────────────────────

  private buildSignals(signals: ExplanationSignalObject[]): ExplanationSignals {
    const significant = signals.filter((s) => s.score > 0.6)
    const supporting = signals.filter((s) => s.score > 0.3 && s.score <= 0.6)

    return {
      items: signals,
      significant,
      supporting,
    }
  }

  // ── Evidence Building ──────────────────────────────────────────────────────

  private buildEvidence(evidence: EvidenceObject[]): Evidence {
    const byType = this.groupEvidenceByType(evidence)

    return {
      items: evidence,
      by_type: byType,
    }
  }

  // ── Confidence Building ────────────────────────────────────────────────────

  private buildConfidence(
    confidence: number,
    regions: AffectedRegion[],
    segments: AffectedSegment[],
  ): Confidence {
    const factors = this.computeConfidenceFactors(confidence, regions, segments)

    return {
      score: confidence,
      factors,
      overall_assessment: this.assessConfidence(confidence, factors),
    }
  }

  private computeConfidenceFactors(
    _confidence: number,
    regions: AffectedRegion[],
    segments: AffectedSegment[],
  ): Array<{
    name: string
    contribution: number
    description: string
  }> {
    const factors: Array<{
      name: string
      contribution: number
      description: string
    }> = []

    // Region concentration factor
    if (regions.length > 0) {
      const maxImportance = Math.max(...regions.map((r) => r.importance))
      factors.push({
        name: 'Region Concentration',
        contribution: maxImportance * 0.3,
        description: `Highest importance region scored ${(maxImportance * 100).toFixed(0)}%`,
      })
    }

    // Temporal consistency factor
    if (segments.length > 0) {
      const temporalSegments = segments.filter((s) => s.type === 'temporal')
      if (temporalSegments.length > 1) {
        const consistency = this.computeTemporalConsistency(temporalSegments)
        factors.push({
          name: 'Temporal Consistency',
          contribution: consistency * 0.3,
          description: `Signals show ${consistency > 0.7 ? 'consistent' : 'inconsistent'} temporal patterns`,
        })
      }
    }

    // Evidence quantity factor
    const evidenceFactor = Math.min(1, regions.length / 5)
    factors.push({
      name: 'Evidence Quantity',
      contribution: evidenceFactor * 0.2,
      description: `${regions.length} regions provide spatial evidence`,
    })

    // Localization quality factor
    const localizationFactor = segments.length > 0 ? 0.2 : 0
    factors.push({
      name: 'Localization Quality',
      contribution: localizationFactor,
      description:
        segments.length > 0
          ? 'Temporal/textual localization available'
          : 'Limited localization available',
    })

    return factors
  }

  private computeTemporalConsistency(segments: AffectedSegment[]): number {
    if (segments.length <= 1) return 1

    const sorted = [...segments].sort((a, b) => a.location.start - b.location.start)
    let consistency = 1

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]

      // Check for significant gaps or overlaps
      const gap = curr.location.start - prev.location.end
      if (gap > 2) {
        consistency *= 0.8
      }

      // Check for importance consistency
      const importanceDiff = Math.abs(curr.importance - prev.importance)
      if (importanceDiff > 0.3) {
        consistency *= 0.9
      }
    }

    return consistency
  }

  private assessConfidence(confidence: number, factors: Array<{ contribution: number }>): string {
    const totalContribution = factors.reduce((sum, f) => sum + f.contribution, 0)

    if (confidence >= 0.9 && totalContribution >= 0.7) {
      return 'Very high confidence with strong supporting factors'
    }
    if (confidence >= 0.7) {
      return 'High confidence with adequate supporting evidence'
    }
    if (confidence >= 0.5) {
      return 'Moderate confidence; additional evidence may strengthen assessment'
    }
    if (confidence >= 0.3) {
      return 'Low confidence; results should be interpreted with caution'
    }
    return 'Very low confidence; insufficient evidence for reliable assessment'
  }

  // ── Attribution Building ───────────────────────────────────────────────────

  private buildAttribution(
    regions: AffectedRegion[],
    segments: AffectedSegment[],
    modality: MediaType,
  ): Attribution {
    return {
      method: this.getAttributionMethod(modality),
      affected_regions: regions,
      affected_segments: segments,
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
