import type { MediaType } from '../config/media-registry'

// ─── Verdict & Confidence ────────────────────────────────────────────────────

export type VerdictCategory = 'likely_manipulated' | 'likely_authentic' | 'inconclusive'

export type ConfidenceLevel = 'very_high' | 'high' | 'moderate' | 'low' | 'very_low'

// ─── Core Explanation Model ───────────────────────────────────────────────────

export interface ExplanationResult {
  assessment: string
  confidence: number
  confidenceLevel: ConfidenceLevel
  verdictCategory: VerdictCategory
  supportingSignals: ExplanationSignal[]
  counterSignals: ExplanationSignal[]
  evidence: EvidenceItem[]
  sourceGroups: ClaimGroup[]
  methodology: MethodologyInfo
  modelVersion: string
  datasetVersion: string
  limitations: string[]
  modality: MediaType
  language: string
  rawVerdict?: string
  manipulationProbability?: number | null
  humanExplanation: HumanExplanation
}

// ─── Human-Readable Explanation ───────────────────────────────────────────────

export interface HumanExplanation {
  summary: string
  why: string
  keyFactors: string[]
  confidenceBreakdown: string
  limitations: string
}

// ─── Signals ─────────────────────────────────────────────────────────────────

export interface ExplanationSignal {
  name: string
  value: string
  detail: string
  severity: 'supporting' | 'counter' | 'neutral'
  score?: number
  weight?: number
}

// ─── Evidence ─────────────────────────────────────────────────────────────────

export type EvidenceType =
  | 'text_span'
  | 'sentence_indicator'
  | 'similarity_match'
  | 'saliency_map'
  | 'suspicious_region'
  | 'temporal_segment'
  | 'spectrogram_region'
  | 'acoustic_indicator'
  | 'suspicious_frame'
  | 'suspicious_section'
  | 'extracted_text'
  | 'metadata_anomaly'
  | 'classifier_output'
  | 'linguistic_signal'

export interface EvidenceItem {
  type: EvidenceType
  content: string
  relevance: number
  description: string
  metadata?: Record<string, unknown>
}

// ─── Methodology ──────────────────────────────────────────────────────────────

export interface MethodologyInfo {
  name: string
  description: string
  version: string
}

// ─── Modality-Specific Evidence Types ─────────────────────────────────────────

export interface TextEvidence extends EvidenceItem {
  type:
    | 'text_span'
    | 'sentence_indicator'
    | 'similarity_match'
    | 'classifier_output'
    | 'linguistic_signal'
  metadata?: {
    startOffset?: number
    endOffset?: number
    sentenceIndex?: number
    aiProbability?: number
    sourceDocument?: string
    similarityScore?: number
    classifierProbabilities?: Record<string, number>
    linguisticFeatures?: Record<string, number>
  }
}

export interface ImageEvidence extends EvidenceItem {
  type: 'saliency_map' | 'suspicious_region' | 'metadata_anomaly'
  metadata?: {
    region?: { x: number; y: number; width: number; height: number }
    gradcamAvailable?: boolean
    confidenceMap?: boolean
  }
}

export interface AudioEvidence extends EvidenceItem {
  type: 'temporal_segment' | 'spectrogram_region' | 'acoustic_indicator'
  metadata?: {
    startTime?: number
    endTime?: number
    frequencyRange?: [number, number]
    energy?: number
  }
}

export interface VideoEvidence extends EvidenceItem {
  type: 'suspicious_frame' | 'temporal_segment'
  metadata?: {
    frameIndex?: number
    timestamp?: number
    duration?: number
    faceSwapDetected?: boolean
  }
}

export interface DocumentEvidence extends EvidenceItem {
  type: 'suspicious_section' | 'similarity_match' | 'extracted_text'
  metadata?: {
    sectionIndex?: number
    pageNumbers?: number[]
    sourceDocument?: string
    similarityScore?: number
  }
}

// ─── Source Explorer ──────────────────────────────────────────────────────────

export type SourceOrigin =
  'user_input' | 'local_corpus' | 'global_source' | 'model' | 'llm_inference'

export type VerificationStatus = 'verified' | 'unverified' | 'contradicted' | 'expired' | 'pending'

export interface TemporalInfo {
  published_at: string | null
  retrieved_at: string | null
  last_verified_at: string | null
}

export interface SourceItem {
  id: string
  claim: string
  title: string
  publisher: string
  sourceType: string
  temporal: TemporalInfo
  relevance: number
  matchedClaim: string
  excerpt: string | null
  url: string | null
  verificationStatus: VerificationStatus
  origin: SourceOrigin
}

export interface ClaimGroup {
  claim: string
  supporting: SourceItem[]
  contradicting: SourceItem[]
  unverified: SourceItem[]
}

// ─── Localization ─────────────────────────────────────────────────────────────

export interface ExplanationTemplate {
  assessment: string
  confidenceLabel: string
  supportingSignalsLabel: string
  counterSignalsLabel: string
  evidenceLabel: string
  methodologyLabel: string
  modelInfoLabel: string
  limitationsLabel: string
  technicalDetailsLabel: string
  whyThisAssessment: string
  noExplanationAvailable: string
  confidenceDescription: string
  signalsDescription: string
  evidenceDescription: string
  limitationsDescription: string
  modelVersionLabel: string
  datasetVersionLabel: string
  mediaTypeLabel: string
  manipulationProbabilityLabel: string
  viewTechnicalDetails: string
  hideTechnicalDetails: string
  expandAll: string
  collapseAll: string
  keyFactorsLabel: string
  confidenceBreakdownLabel: string
  verdict: {
    likelyManipulated: string
    likelyAuthentic: string
    inconclusive: string
  }
  confidenceLevel: {
    veryHigh: string
    high: string
    moderate: string
    low: string
    veryLow: string
  }
  humanExplanation: {
    summaryPrefix: string
    highConfidenceManipulated: string
    moderateConfidenceManipulated: string
    lowConfidenceManipulated: string
    highConfidenceAuthentic: string
    moderateConfidenceAuthentic: string
    lowConfidenceAuthentic: string
    inconclusive: string
    keyFactorsIntro: string
    confidenceBreakdownHigh: string
    confidenceBreakdownModerate: string
    confidenceBreakdownLow: string
    limitationsIntro: string
  }
  text: {
    highlightedSpansLabel: string
    sentenceIndicatorsLabel: string
    similarityEvidenceLabel: string
    classifierOutputLabel: string
    linguisticSignalsLabel: string
  }
  image: {
    saliencyMapLabel: string
    suspiciousRegionsLabel: string
    metadataAnomaliesLabel: string
  }
  audio: {
    temporalSegmentsLabel: string
    spectrogramRegionsLabel: string
    acousticIndicatorsLabel: string
  }
  video: {
    suspiciousFramesLabel: string
    temporalSegmentsLabel: string
  }
  document: {
    suspiciousSectionsLabel: string
    similarityEvidenceLabel: string
    extractedTextLabel: string
  }
  panel: {
    supportingEvidence: string
    counterEvidence: string
    overallConfidence: string
    weightedSupportingSignals: string
    counterSignalImpact: string
    rawEvidence: string
    allSignals: string
    metadata: string
    language: string
  }
  hero: {
    completed: string
    processing: string
    failed: string
    needsReview: string
    calibratedConfidence: string
    manipulationProbability: string
    modelProbability: string
    evidenceStrength: string
  }
  breakdown: {
    confidence: string
    pass: string
    warning: string
    fail: string
    info: string
  }
  explainability: {
    whyAssessment: string
    interactiveExplanation: string
    methodologyDisclaimer: string
    limitationsAndCaveats: string
    importantContext: string
  }
  modelInfo: {
    model: string
    version: string
    analysisEngineVersion: string
    datasetVersion: string
    analysisTimestamp: string
    whenAnalysisPerformed: string
    methodology: string
  }
  evidenceTimeline: {
    noEvidence: string
    confidence: string
    regionCoordinates: string
    evidenceContent: string
    region: string
    temporal: string
    passage: string
    frame: string
    segment: string
    indicator: string
  }
  plagiarism: {
    exactMatch: string
    nearDuplicate: string
    ngramMatch: string
    lexicalMatch: string
    paraphrase: string
    semanticSimilarity: string
  }
  exportMenu: {
    export: string
    exportFormat: string
    jsonDescription: string
    pdfDescription: string
    csvDescription: string
    soon: string
  }
  page: {
    analysisResult: string
    noResult: string
    noResultDescription: string
    startAnalysis: string
    breakdown: string
    evidence: string
    explain: string
    model: string
    history: string
    evidenceTimeline: string
    evidenceTimelineDesc: string
    analysisHistory: string
    viewAllAnalyses: string
    viewFullHistory: string
  }
  sourceExplorer: {
    title: string
    subtitle: string
    supportingSources: string
    contradictingSources: string
    unverifiedSources: string
    noSources: string
    published: string
    retrieved: string
    lastVerified: string
    freshness: string
    fresh: string
    stale: string
    relevance: string
    matchedClaim: string
    supportingExcerpt: string
    viewSource: string
    verificationStatus: string
    verified: string
    unverified: string
    contradicted: string
    expired: string
    pending: string
    origin: string
    userInput: string
    localCorpus: string
    globalSource: string
    model: string
    llmInference: string
    sourceType: string
    publisher: string
  }
}
