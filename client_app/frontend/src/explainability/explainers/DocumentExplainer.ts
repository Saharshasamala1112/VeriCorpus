import type {
  ExplanationObject,
  ExplanationSignalObject,
  EvidenceObject,
} from '../types'
import { ExplanationBuilder } from '../providers/ExplanationBuilder'
import { LocalizationProvider } from '../providers/LocalizationProvider'
import { EvidenceVisualizer } from '../providers/EvidenceVisualizer'

// ─── Document Explainer ──────────────────────────────────────────────────────

export class DocumentExplainer {
  private readonly builder: ExplanationBuilder
  private readonly localization: LocalizationProvider
  private readonly visualizer: EvidenceVisualizer

  constructor() {
    this.builder = new ExplanationBuilder()
    this.localization = new LocalizationProvider()
    this.visualizer = new EvidenceVisualizer()
  }

  async explainDocumentAnalysis(
    analysisResult: DocumentAnalysisResult,
    documentContent: DocumentContent,
  ): Promise<ExplanationObject> {
    // Extract signals from analysis
    const signals = this.extractSignals(analysisResult)

    // Extract evidence
    const evidence = this.extractEvidence(analysisResult)

    // Localize signals in document
    const { regions, segments } = await this.localization.localize(
      signals,
      documentContent,
      'document',
    )

    // Build explanation
    return this.builder.buildExplanation(
      signals,
      evidence,
      regions,
      segments,
      'document',
      analysisResult.verdict || 'UNCERTAIN',
      analysisResult.confidence || 0.5,
    )
  }

  // ── Signal Extraction ──────────────────────────────────────────────────────

  private extractSignals(analysisResult: DocumentAnalysisResult): ExplanationSignalObject[] {
    const signals: ExplanationSignalObject[] = []

    // Metadata signals
    if (analysisResult.metadata) {
      const metadata = analysisResult.metadata

      if (metadata.ai_generator_detected) {
        signals.push({
          id: `ai-generator-${Date.now()}`,
          name: 'AI Generator Detected',
          score: metadata.generator_confidence || 0.8,
          explanation: `Document metadata indicates AI generator: ${metadata.generator_name || 'unknown'}`,
          signal_type: 'ai_generation',
          direction: 'supporting',
          severity: 'high',
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
          direction: 'supporting',
          severity: 'medium',
          affected_region_ids: [],
        })
      }

      if (metadata.creation_software !== undefined) {
        signals.push({
          id: `creation-software-${Date.now()}`,
          name: 'Creation Software Detected',
          score: 0.3,
          explanation: `Document was created with: ${metadata.creation_software}`,
          signal_type: 'provenance',
          direction: 'neutral',
          severity: 'info',
          affected_region_ids: [],
        })
      }
    }

    // Structural anomalies
    if (analysisResult.structural_anomalies) {
      const structural = analysisResult.structural_anomalies

      if (structural.has_anomalies) {
        signals.push({
          id: `structural-anomaly-${Date.now()}`,
          name: 'Structural Anomalies',
          score: structural.severity || 0.5,
          explanation: this.explainStructuralAnomalies(structural),
          signal_type: 'manipulation',
          direction: 'supporting',
          severity: structural.severity && structural.severity > 0.7 ? 'high' : 'medium',
          affected_region_ids: [],
        })
      }
    }

    // Text consistency signals
    if (analysisResult.text_consistency) {
      const text = analysisResult.text_consistency

      if (text.font_inconsistencies && text.font_inconsistencies.length > 0) {
        signals.push({
          id: `font-inconsistency-${Date.now()}`,
          name: 'Font Inconsistencies',
          score: 0.5,
          explanation: `Found ${text.font_inconsistencies.length} font inconsistency(ies)`,
          signal_type: 'manipulation',
          direction: 'supporting',
          severity: 'medium',
          affected_region_ids: [],
        })
      }

      if (text.spacing_anomalies && text.spacing_anomalies.length > 0) {
        signals.push({
          id: `spacing-anomaly-${Date.now()}`,
          name: 'Spacing Anomalies',
          score: 0.4,
          explanation: `Detected ${text.spacing_anomalies.length} spacing anomaly(ies)`,
          signal_type: 'manipulation',
          direction: 'supporting',
          severity: 'low',
          affected_region_ids: [],
        })
      }

      if (text.style_inconsistencies && text.style_inconsistencies.length > 0) {
        signals.push({
          id: `style-inconsistency-${Date.now()}`,
          name: 'Style Inconsistencies',
          score: 0.5,
          explanation: `Found ${text.style_inconsistencies.length} style inconsistency(ies)`,
          signal_type: 'manipulation',
          direction: 'supporting',
          severity: 'medium',
          affected_region_ids: [],
        })
      }
    }

    // OCR analysis signals
    if (analysisResult.ocr_analysis) {
      const ocr = analysisResult.ocr_analysis

      if (ocr.quality_score !== undefined && ocr.quality_score < 0.7) {
        signals.push({
          id: `low-ocr-quality-${Date.now()}`,
          name: 'Low OCR Quality',
          score: 1 - ocr.quality_score,
          explanation: `OCR quality score: ${(ocr.quality_score * 100).toFixed(1)}%`,
          signal_type: 'artifact',
          direction: 'supporting',
          severity: 'low',
          affected_region_ids: [],
        })
      }

      if (ocr.text_image_mismatch !== undefined && ocr.text_image_mismatch > 0.5) {
        signals.push({
          id: `text-image-mismatch-${Date.now()}`,
          name: 'Text-Image Mismatch',
          score: ocr.text_image_mismatch,
          explanation: `Text and image content mismatch detected (${(ocr.text_image_mismatch * 100).toFixed(1)}% mismatch)`,
          signal_type: 'manipulation',
          direction: 'supporting',
          severity: 'medium',
          affected_region_ids: [],
        })
      }
    }

    // Source comparison signals
    if (analysisResult.source_comparison) {
      const source = analysisResult.source_comparison

      if (source.similar_documents && source.similar_documents.length > 0) {
        signals.push({
          id: `similar-documents-${Date.now()}`,
          name: 'Similar Documents Found',
          score: source.overall_similarity || 0.5,
          explanation: `Found ${source.similar_documents.length} similar document(s)`,
          signal_type: 'similarity',
          direction: 'supporting',
          severity: 'medium',
          affected_region_ids: [],
        })
      }

      if (source.modification_score !== undefined && source.modification_score > 0.5) {
        signals.push({
          id: `modification-detected-${Date.now()}`,
          name: 'Document Modifications Detected',
          score: source.modification_score,
          explanation: `Modification score: ${(source.modification_score * 100).toFixed(1)}%`,
          signal_type: 'manipulation',
          direction: 'supporting',
          severity: 'medium',
          affected_region_ids: [],
        })
      }
    }

    return signals
  }

  private explainStructuralAnomalies(structural: {
    has_anomalies: boolean
    severity?: number
    anomaly_types?: string[]
    affected_elements?: string[]
  }): string {
    const types = structural.anomaly_types || ['unknown']
    const elements = structural.affected_elements || []

    return `Structural anomalies detected (${types.join(', ')}). Severity: ${((structural.severity || 0.5) * 100).toFixed(0)}%. ${
      elements.length > 0 ? `Affected elements: ${elements.join(', ')}.` : ''
    }`
  }

  // ── Evidence Extraction ────────────────────────────────────────────────────

  private extractEvidence(analysisResult: DocumentAnalysisResult): EvidenceObject[] {
    const evidence: EvidenceObject[] = []

    // Metadata evidence
    if (analysisResult.metadata?.creation_software) {
      evidence.push({
        id: `software-evidence-${Date.now()}`,
        type: 'metadata',
        content: analysisResult.metadata.creation_software,
        description: `Document created with: ${analysisResult.metadata.creation_software}`,
        confidence: 0.8,
      })
    }

    if (analysisResult.metadata?.modification_history) {
      for (const mod of analysisResult.metadata.modification_history.slice(0, 3)) {
        evidence.push({
          id: `modification-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'metadata',
          content: mod.description || 'Document modification',
          description: mod.description || `Modification at ${mod.date || 'unknown date'}`,
          confidence: mod.confidence || 0.5,
          location: mod.page_number
            ? {
                start_offset: 0,
                end_offset: 0,
                page: mod.page_number,
              }
            : undefined,
        })
      }
    }

    // Structural evidence
    if (analysisResult.structural_anomalies?.affected_elements) {
      for (const element of analysisResult.structural_anomalies.affected_elements) {
        evidence.push({
          id: `structural-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'document_section',
          content: element,
          description: `Structural anomaly in element: ${element}`,
          confidence: analysisResult.structural_anomalies.severity || 0.5,
        })
      }
    }

    // Text consistency evidence
    if (analysisResult.text_consistency?.font_inconsistencies) {
      for (const font of analysisResult.text_consistency.font_inconsistencies) {
        evidence.push({
          id: `font-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'text_span',
          content: font.text || 'Font inconsistency',
          description: font.description || `Inconsistent font detected`,
          confidence: font.confidence || 0.5,
          location: font.position
            ? {
                start_offset: font.position.start || 0,
                end_offset: font.position.end || 0,
                page: font.page_number,
              }
            : undefined,
        })
      }
    }

    // OCR evidence
    if (analysisResult.ocr_analysis?.low_confidence_regions) {
      for (const region of analysisResult.ocr_analysis.low_confidence_regions.slice(0, 3)) {
        evidence.push({
          id: `ocr-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'text_span',
          content: region.text || 'Low confidence OCR',
          description: `Low OCR confidence region: ${region.text?.substring(0, 50) || 'unknown'}`,
          confidence: region.confidence || 0.3,
          location: {
            start_offset: region.start_offset || 0,
            end_offset: region.end_offset || 0,
            page: region.page_number,
          },
        })
      }
    }

    // Source comparison evidence
    if (analysisResult.source_comparison?.similar_documents) {
      for (const doc of analysisResult.source_comparison.similar_documents.slice(0, 3)) {
        evidence.push({
          id: `similar-doc-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'source_comparison',
          content: doc.title || 'Similar document',
          description: `Similar document found: ${doc.title || 'Untitled'} (similarity: ${((doc.similarity || 0) * 100).toFixed(1)}%)`,
          confidence: doc.similarity || 0.5,
        })
      }
    }

    return evidence
  }
}

// ─── Document Content Type ───────────────────────────────────────────────────

interface DocumentContent {
  text: string
  pages: Array<{
    text: string
    page_number: number
    paragraphs: Array<{
      text: string
      index: number
    }>
  }>
  metadata?: Record<string, unknown>
}

// ─── Document Analysis Result Type ───────────────────────────────────────────

interface DocumentAnalysisResult {
  verdict?: string
  confidence?: number
  metadata?: {
    ai_generator_detected: boolean
    generator_name?: string
    generator_confidence?: number
    creation_software?: string
    inconsistencies?: string[]
    modification_history?: Array<{
      date?: string
      description?: string
      confidence?: number
      page_number?: number
    }>
  }
  structural_anomalies?: {
    has_anomalies: boolean
    severity?: number
    anomaly_types?: string[]
    affected_elements?: string[]
  }
  text_consistency?: {
    font_inconsistencies?: Array<{
      text?: string
      description?: string
      confidence?: number
      page_number?: number
      position?: { start?: number; end?: number }
    }>
    spacing_anomalies?: Array<{
      description?: string
      confidence?: number
      page_number?: number
    }>
    style_inconsistencies?: Array<{
      description?: string
      confidence?: number
      page_number?: number
    }>
  }
  ocr_analysis?: {
    quality_score?: number
    text_image_mismatch?: number
    low_confidence_regions?: Array<{
      text?: string
      confidence?: number
      start_offset?: number
      end_offset?: number
      page_number?: number
    }>
  }
  source_comparison?: {
    similar_documents?: Array<{
      title?: string
      similarity?: number
      source?: string
    }>
    overall_similarity?: number
    modification_score?: number
  }
}
