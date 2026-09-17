import type { MediaType } from '../config/media-registry'
import type {
  VerdictCategory,
  ConfidenceLevel,
  ExplanationSignal,
  MethodologyInfo,
} from '../types/explainability'

export type AnalysisStatus = 'processing' | 'completed' | 'failed' | 'needs_review'

export type AssessmentLabel =
  'Likely AI-generated' | 'Likely authentic' | 'Inconclusive' | 'Partially AI-generated'

export interface AnalysisBreakdownCard {
  id: string
  title: string
  status: 'pass' | 'warning' | 'fail' | 'info'
  confidence: number
  modelProbability: number | null
  calibratedConfidence: number | null
  evidenceStrength: number | null
  keySignal: string
  description: string
}

export interface EvidenceEntry {
  id: string
  type: 'region' | 'temporal' | 'passage' | 'frame' | 'segment' | 'indicator'
  label: string
  timestamp?: string
  startTime?: number
  endTime?: number
  region?: { x: number; y: number; width: number; height: number }
  confidence: number
  description: string
  content?: string
  matchType?: 'exact' | 'near_duplicate' | 'ngram' | 'lexical' | 'paraphrase' | 'semantic'
  sourceUrl?: string | null
  page?: number | null
  paragraph?: number | null
  sentence?: number | null
  startOffset?: number
  endOffset?: number
}

export interface ModelInformation {
  name: string
  version: string
  datasetVersion: string
  analysisTimestamp: string
  methodology: MethodologyInfo
}

export interface AnalysisResultData {
  id: string
  filename: string
  mediaType: MediaType
  status: AnalysisStatus
  timestamp: string
  sizeBytes: number
  sha256: string

  // Hero
  assessment: AssessmentLabel
  verdictCategory: VerdictCategory
  confidence: number
  modelProbability: number | null
  calibratedConfidence: number | null
  evidenceStrength: number | null
  confidenceLevel: ConfidenceLevel
  manipulationProbability: number | null
  explanation: string

  // Breakdown
  breakdownCards: AnalysisBreakdownCard[]

  // Evidence
  evidenceEntries: EvidenceEntry[]

  // Signals
  supportingSignals: ExplanationSignal[]
  counterSignals: ExplanationSignal[]

  // Model
  modelInfo: ModelInformation

  // Limitations
  limitations: string[]

  // Language
  language: string
}

export interface AnalysisHistoryItem {
  id: string
  filename: string
  mediaType: MediaType
  status: AnalysisStatus
  confidence: number
  assessment: AssessmentLabel
  timestamp: string
  sizeBytes: number
}
