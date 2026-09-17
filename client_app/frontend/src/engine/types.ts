import type { MediaType } from '../config/media-registry'

// ─── Assessment Outcomes ─────────────────────────────────────────────────────

export type AssessmentVerdict =
  'LIKELY_AUTHENTIC' | 'LIKELY_MANIPULATED' | 'UNCERTAIN' | 'INSUFFICIENT_EVIDENCE'

export type SignalSeverity = 'high' | 'medium' | 'low' | 'info'

export type SignalDirection = 'supporting' | 'counter' | 'neutral'

// ─── Core Signal ─────────────────────────────────────────────────────────────

export interface ModalitySignal {
  name: string
  category: string
  value: number
  direction: SignalDirection
  severity: SignalSeverity
  detail: string
  evidence?: EvidenceItem[]
}

// ─── Evidence ────────────────────────────────────────────────────────────────

export type EvidenceCategory =
  | 'visual_artifact'
  | 'compression_artifact'
  | 'frequency_anomaly'
  | 'metadata_anomaly'
  | 'region_inconsistency'
  | 'model_artifact'
  | 'embedding_anomaly'
  | 'source_mismatch'
  | 'spectral_anomaly'
  | 'acoustic_artifact'
  | 'speech_inconsistency'
  | 'temporal_anomaly'
  | 'sync_anomaly'
  | 'scene_inconsistency'
  | 'facial_artifact'
  | 'structural_anomaly'
  | 'ocr_mismatch'
  | 'text_visual_mismatch'
  | 'provenance_gap'
  | 'semantic_inconsistency'
  | 'generated_content_signal'
  | 'contradiction'
  | 'linguistic_signal'

export interface EvidenceItem {
  id: string
  category: EvidenceCategory
  description: string
  confidence: number
  location?: SpatialLocation | TemporalLocation | TextLocation
  rawValue?: string | number | Record<string, unknown>
}

export interface SpatialLocation {
  type: 'bounding_box' | 'point' | 'region'
  x: number
  y: number
  width?: number
  height?: number
  label?: string
}

export interface TemporalLocation {
  type: 'segment' | 'frame_range' | 'timestamp'
  startSeconds: number
  endSeconds: number
  frameIndex?: number
  label?: string
}

export interface TextLocation {
  type: 'span' | 'paragraph' | 'sentence'
  startIndex: number
  endIndex: number
  text?: string
}

// ─── Affected Regions / Segments ─────────────────────────────────────────────

export interface AffectedRegion {
  id: string
  label: string
  type: 'spatial' | 'temporal' | 'textual'
  location: SpatialLocation | TemporalLocation | TextLocation
  severity: SignalSeverity
  description: string
}

// ─── Confidence ──────────────────────────────────────────────────────────────

export interface ConfidenceMetrics {
  overall: number
  modelAgreement: number
  signalStrength: number
  evidenceCoverage: number
  limitations: string[]
}

// ─── Modality Input ──────────────────────────────────────────────────────────

export interface BaseInput {
  mediaType: MediaType
  filename: string
  sizeBytes: number
  sha256?: string
  language?: string
  sourceUrl?: string
}

export interface TextInput extends BaseInput {
  mediaType: 'text'
  content: string
  metadata?: Record<string, unknown>
}

export interface ImageInput extends BaseInput {
  mediaType: 'image'
  file: File | Blob
  dataUrl?: string
  metadata?: ImageMetadata
}

export interface ImageMetadata {
  exif?: Record<string, unknown>
  width?: number
  height?: number
  format?: string
  colorSpace?: string
  bitDepth?: number
  compression?: string
  gps?: { latitude: number; longitude: number }
  camera?: { make: string; model: string; software: string }
  timestamp?: string
}

export interface AudioInput extends BaseInput {
  mediaType: 'audio'
  file: File | Blob
  metadata?: AudioMetadata
}

export interface AudioMetadata {
  duration?: number
  sampleRate?: number
  bitRate?: number
  channels?: number
  codec?: string
  format?: string
  artist?: string
  title?: string
  created?: string
}

export interface VideoInput extends BaseInput {
  mediaType: 'video'
  file: File | Blob
  metadata?: VideoMetadata
}

export interface VideoMetadata {
  duration?: number
  width?: number
  height?: number
  fps?: number
  sampleRate?: number
  codec?: string
  audioCodec?: string
  bitrate?: number
  created?: string
  hasAudio?: boolean
}

export interface DocumentInput extends BaseInput {
  mediaType: 'document'
  file: File | Blob
  textContent?: string
  metadata?: DocumentMetadata
}

export interface DocumentMetadata {
  author?: string
  creator?: string
  producer?: string
  created?: string
  modified?: string
  pageCount?: number
  title?: string
  subject?: string
  keywords?: string[]
  encryption?: string
  hasFormFields?: boolean
}

export type MediaInput = TextInput | ImageInput | AudioInput | VideoInput | DocumentInput

// ─── Final Assessment Result ─────────────────────────────────────────────────

export interface AuthenticityAssessment {
  verdict: AssessmentVerdict
  confidence: ConfidenceMetrics
  signals: ModalitySignal[]
  counterSignals: ModalitySignal[]
  evidence: EvidenceItem[]
  affectedRegions: AffectedRegion[]
  affectedSegments: AffectedRegion[]
  limitations: string[]
  modality: MediaType
  input: {
    filename: string
    sizeBytes: number
    sha256: string
  }
  metadata: Record<string, unknown>
  analysisTimestamp: string
}

// ─── Analyzer Interface ──────────────────────────────────────────────────────

export interface ModalityAnalyzer<T extends MediaInput> {
  modality: MediaType
  analyze(input: T): Promise<ModalityAnalysisResult>
}

export interface ModalityAnalysisResult {
  signals: ModalitySignal[]
  counterSignals: ModalitySignal[]
  evidence: EvidenceItem[]
  affectedRegions: AffectedRegion[]
  affectedSegments: AffectedRegion[]
  limitations: string[]
  metadata: Record<string, unknown>
}

// ─── Engine Configuration ────────────────────────────────────────────────────

export interface EngineConfig {
  enabledModalities: MediaType[]
  confidenceThresholds: {
    high: number
    moderate: number
    low: number
  }
  maxEvidencePerModality: number
  enableLogging: boolean
}
