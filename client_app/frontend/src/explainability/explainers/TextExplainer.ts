import type {
  ExplanationObject,
  ExplanationSignalObject,
  EvidenceObject,
} from '../types'
import { ExplanationBuilder } from '../providers/ExplanationBuilder'
import { LocalizationProvider } from '../providers/LocalizationProvider'

// ─── Text Explainer ──────────────────────────────────────────────────────────

export class TextExplainer {
  private readonly builder: ExplanationBuilder
  private readonly localization: LocalizationProvider

  constructor() {
    this.builder = new ExplanationBuilder()
    this.localization = new LocalizationProvider()
  }

  async explainTextAnalysis(
    analysisResult: TextAnalysisResult,
    text: string,
  ): Promise<ExplanationObject> {
    // Convert analysis result to explanation signals
    const signals = this.extractSignals(analysisResult)

    // Extract evidence from analysis
    const evidence = this.extractEvidence(analysisResult, text)

    // Localize signals in text
    const { regions, segments } = await this.localization.localize(signals, text, 'text')

    // Build the explanation object
    return this.builder.buildExplanation(
      signals,
      evidence,
      regions,
      segments,
      'text',
      analysisResult.verdict || 'UNCERTAIN',
      analysisResult.confidence || 0.5,
    )
  }

  // ── Signal Extraction ──────────────────────────────────────────────────────

  private extractSignals(analysisResult: TextAnalysisResult): ExplanationSignalObject[] {
    const signals: ExplanationSignalObject[] = []

    // Linguistic signals
    if (analysisResult.linguistic_indicators) {
      const linguistic = analysisResult.linguistic_indicators

      if (linguistic.burstiness !== undefined) {
        signals.push({
          id: `burstiness-${Date.now()}`,
          name: 'Burstiness Analysis',
          score: this.normalizeBurstiness(linguistic.burstiness),
          explanation: this.explainBurstiness(linguistic.burstiness),
          signal_type: 'manipulation',
          direction: 'supporting',
          severity: 'medium',
          affected_region_ids: [],
        })
      }

      if (linguistic.perplexity !== undefined) {
        signals.push({
          id: `perplexity-${Date.now()}`,
          name: 'Perplexity Analysis',
          score: this.normalizePerplexity(linguistic.perplexity),
          explanation: this.explainPerplexity(linguistic.perplexity),
          signal_type: 'ai_generation',
          direction: 'supporting',
          severity: 'medium',
          affected_region_ids: [],
        })
      }

      if (linguistic.hedging_ratio !== undefined) {
        signals.push({
          id: `hedging-${Date.now()}`,
          name: 'Hedging Language',
          score: linguistic.hedging_ratio,
          explanation: `Text contains hedging language at ${(linguistic.hedging_ratio * 100).toFixed(1)}% rate`,
          signal_type: 'pattern',
          direction: 'neutral',
          severity: 'low',
          affected_region_ids: [],
        })
      }

      if (linguistic.human_markers_ratio !== undefined) {
        signals.push({
          id: `human-markers-${Date.now()}`,
          name: 'Human Expression Markers',
          score: linguistic.human_markers_ratio,
          explanation: `Human expression markers detected at ${(linguistic.human_markers_ratio * 100).toFixed(1)}% rate`,
          signal_type: 'authenticity_indicator',
          direction: 'counter',
          severity: 'info',
          affected_region_ids: [],
        })
      }
    }

    // Provenance signals
    if (analysisResult.provenance) {
      const provenance = analysisResult.provenance

      if (provenance.extraction_confidence !== undefined) {
        signals.push({
          id: `provenance-${Date.now()}`,
          name: 'Text Provenance',
          score: provenance.extraction_confidence,
          explanation: `Text extraction confidence: ${(provenance.extraction_confidence * 100).toFixed(1)}%`,
          signal_type: 'provenance',
          direction: 'neutral',
          severity: 'info',
          affected_region_ids: [],
        })
      }
    }

    // Consistency signals
    if (analysisResult.consistency) {
      const consistency = analysisResult.consistency

      if (consistency.semantic_consistency !== undefined) {
        signals.push({
          id: `semantic-${Date.now()}`,
          name: 'Semantic Consistency',
          score: consistency.semantic_consistency,
          explanation: `Semantic consistency score: ${(consistency.semantic_consistency * 100).toFixed(1)}%`,
          signal_type:
            consistency.semantic_consistency < 0.5 ? 'manipulation' : 'authenticity_indicator',
          direction: consistency.semantic_consistency < 0.5 ? 'supporting' : 'counter',
          severity: consistency.semantic_consistency < 0.5 ? 'medium' : 'info',
          affected_region_ids: [],
        })
      }
    }

    // Generated content signals
    if (analysisResult.generated_content) {
      const generated = analysisResult.generated_content

      if (generated.ai_probability !== undefined) {
        signals.push({
          id: `ai-prob-${Date.now()}`,
          name: 'AI Generation Probability',
          score: generated.ai_probability,
          explanation: `Probability of AI generation: ${(generated.ai_probability * 100).toFixed(1)}%`,
          signal_type: 'ai_generation',
          direction: 'supporting',
          severity: generated.ai_probability > 0.7 ? 'high' : 'medium',
          affected_region_ids: [],
        })
      }
    }

    return signals
  }

  private normalizeBurstiness(value: number): number {
    // Burstiness typically ranges from 0-100
    // Lower values suggest more uniform, AI-like text
    if (value < 30) return 0.8 // Very uniform, likely AI
    if (value < 50) return 0.6
    if (value < 70) return 0.4
    return 0.2 // Natural variation
  }

  private normalizePerplexity(value: number): number {
    // Very low perplexity suggests predictable, potentially generated text
    if (value < 10) return 0.9
    if (value < 20) return 0.7
    if (value < 40) return 0.4
    return 0.2
  }

  private explainBurstiness(value: number): string {
    if (value < 30) {
      return 'Text shows very uniform sentence structure, which is characteristic of AI-generated content'
    }
    if (value < 50) {
      return 'Text shows moderate uniformity in sentence structure'
    }
    return 'Text shows natural variation in sentence structure, typical of human writing'
  }

  private explainPerplexity(value: number): string {
    if (value < 10) {
      return 'Very low perplexity indicates highly predictable text patterns, suggesting AI generation'
    }
    if (value < 20) {
      return 'Low perplexity suggests somewhat predictable text patterns'
    }
    return 'Higher perplexity indicates natural text variation'
  }

  // ── Evidence Extraction ────────────────────────────────────────────────────

  private extractEvidence(analysisResult: TextAnalysisResult, text: string): EvidenceObject[] {
    const evidence: EvidenceObject[] = []

    // Contradiction evidence
    if (analysisResult.contradiction_analysis) {
      const contradiction = analysisResult.contradiction_analysis

      if (contradiction.has_contradictions) {
        evidence.push({
          id: `contradiction-${Date.now()}`,
          type: 'contradiction',
          content: contradiction.contradicting_claims?.join('; ') || 'Contradictions detected',
          description: `Found ${contradiction.contradicting_claims?.length || 0} contradictory claim(s) in the text`,
          confidence: contradiction.confidence || 0.5,
          location: contradiction.contradicting_claims?.[0]
            ? this.findTextLocation(text, contradiction.contradicting_claims[0])
            : undefined,
        })
      }
    }

    // Source evidence
    if (analysisResult.source_evidence) {
      const source = analysisResult.source_evidence

      if (source.known_sources && source.known_sources.length > 0) {
        evidence.push({
          id: `source-${Date.now()}`,
          type: 'source_comparison',
          content: source.known_sources.join(', '),
          description: `Text references ${source.known_sources.length} known source(s)`,
          confidence: source.reference_confidence || 0.5,
        })
      }

      if (source.originality_score !== undefined) {
        evidence.push({
          id: `originality-${Date.now()}`,
          type: 'text_span',
          content: 'Originality analysis',
          description: `Originality score: ${(source.originality_score * 100).toFixed(1)}%`,
          confidence: source.originality_score,
        })
      }
    }

    // Language quality evidence
    if (analysisResult.language_quality) {
      const quality = analysisResult.language_quality

      if (quality.grammar_errors && quality.grammar_errors.length > 0) {
        for (const error of quality.grammar_errors.slice(0, 3)) {
          evidence.push({
            id: `grammar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'text_span',
            content: error.text,
            description: `Grammar: ${error.suggestion}`,
            confidence: 1 - error.severity,
            location: error.position
              ? {
                  start_offset: error.position.start,
                  end_offset: error.position.end,
                }
              : undefined,
          })
        }
      }
    }

    // Copy-paste detection
    if (analysisResult.consistency?.copy_paste_segments) {
      for (const segment of analysisResult.consistency.copy_paste_segments.slice(0, 3)) {
        evidence.push({
          id: `copypaste-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'text_span',
          content: segment.text,
          description: `Potentially copied text: ${segment.text.substring(0, 50)}...`,
          confidence: segment.similarity || 0.5,
          location: this.findTextLocation(text, segment.text),
        })
      }
    }

    return evidence
  }

  private findTextLocation(
    text: string,
    searchText: string,
  ): { start_offset: number; end_offset: number } | undefined {
    const index = text.toLowerCase().indexOf(searchText.toLowerCase())
    if (index === -1) return undefined

    return {
      start_offset: index,
      end_offset: index + searchText.length,
    }
  }
}

// ─── Text Analysis Result Type ───────────────────────────────────────────────

interface TextAnalysisResult {
  verdict?: string
  confidence?: number
  linguistic_indicators?: {
    burstiness?: number
    perplexity?: number
    hedging_ratio?: number
    human_markers_ratio?: number
    sentence_length_variance?: number
  }
  provenance?: {
    extraction_confidence?: number
    source_type?: string
  }
  consistency?: {
    semantic_consistency?: number
    copy_paste_segments?: Array<{
      text: string
      similarity?: number
      source?: string
    }>
  }
  generated_content?: {
    ai_probability?: number
    model_signatures?: string[]
  }
  contradiction_analysis?: {
    has_contradictions: boolean
    contradicting_claims?: string[]
    confidence?: number
  }
  source_evidence?: {
    known_sources?: string[]
    reference_confidence?: number
    originality_score?: number
  }
  language_quality?: {
    grammar_errors?: Array<{
      text: string
      suggestion: string
      severity: number
      position?: { start: number; end: number }
    }>
  }
}
