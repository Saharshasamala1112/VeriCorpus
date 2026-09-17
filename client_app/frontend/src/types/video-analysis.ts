// ─── Enums ──────────────────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info'

export type AssessmentLabel =
  | 'Likely AI-generated'
  | 'Likely manipulated'
  | 'Likely authentic'
  | 'Inconclusive'
  | 'Partially AI-generated'

// ─── Signal Response ────────────────────────────────────────────────────────

export interface SignalResponse {
  id: string
  signal_type: string
  analyzer_type: string
  severity: string
  confidence: number
  title: string
  description: string
  evidence?: Record<string, unknown> | null
  model_id?: string | null
  model_version?: string | null
  created_at: string
}

// ─── Explanation Response ────────────────────────────────────────────────────

export interface ExplanationResponseV2 {
  narrative: string
  key_factors: string[]
  recommendations: string[]
  language: string
}

// ─── Affected Region ────────────────────────────────────────────────────────

export interface AffectedRegionResponse {
  id: string
  signal_id: string | null
  x: number
  y: number
  width: number
  height: number
  score: number | null
  explanation: string | null
}

// ─── Affected Segment ───────────────────────────────────────────────────────

export interface AffectedSegmentResponse {
  id: string
  signal_id: string | null
  start_seconds: number
  end_seconds: number
  score: number | null
  explanation: string | null
  signal_type: string | null
  severity: string | null
}

// ─── Video Frame ────────────────────────────────────────────────────────────

export interface VideoFrameResponse {
  frame_id: string
  frame_number: number
  timestamp: number
  thumbnail_url: string | null
  signal_type: string | null
  severity: string | null
  description: string | null
  regions: AffectedRegionResponse[]
}

// ─── Video Metadata ─────────────────────────────────────────────────────────

export interface VideoMetadataResponse {
  duration_seconds: number | null
  width: number | null
  height: number | null
  fps: number | null
  codec: string | null
  audio_codec: string | null
  bit_rate: number | null
  sample_rate: number | null
  channels: number | null
  frame_count: number | null
  has_audio: boolean
  resolution_class: string | null
}

// ─── Model Info ─────────────────────────────────────────────────────────────

export interface ModelInfoResponse {
  model_id: string | null
  display_name: string | null
  version: string | null
  architecture: string | null
  modality: string | null
  framework: string | null
  dataset_version: string | null
  training_run_id: string | null
  status: string | null
}

// ─── Signal Breakdown ───────────────────────────────────────────────────────

export interface SignalBreakdownResponse {
  signal_type: string
  label: string
  detected: boolean
  strength: number | null
  description: string | null
  signal_count: number
}

// ─── Video Analysis Full Response ───────────────────────────────────────────

export interface VideoAnalysisFullResponse {
  analysis_id: string
  asset_id: string | null
  assessment: string
  model_probability: number | null
  calibrated_probability: number | null
  evidence_strength: number | null
  risk_level: string | null
  summary: string | null
  duration: number | null
  metadata: VideoMetadataResponse | null
  segments: AffectedSegmentResponse[]
  frames: VideoFrameResponse[]
  signals: SignalResponse[]
  signal_breakdown: SignalBreakdownResponse[]
  evidence: Record<string, unknown>[]
  sources: Record<string, unknown>[]
  claims: Record<string, unknown>[]
  explanation: ExplanationResponseV2 | null
  limitations: string[]
  model_info: ModelInfoResponse | null
  processing_status: string | null
  processing_metadata: Record<string, unknown> | null
  created_at: string
}

// ─── UI State ───────────────────────────────────────────────────────────────

export interface VideoAnalysisUIState {
  selectedSegmentId: string | null
  selectedFrameId: string | null
  selectedRegionId: string | null
  isPlaying: boolean
  currentTime: number
  playbackRate: number
  volume: number
  isMuted: boolean
  showRegions: boolean
  showSegments: boolean
  showSignalOverlay: boolean
  activeSignalFilter: string | null
  timelineZoom: { start: number; end: number }
  panelTab: 'overview' | 'signals' | 'evidence' | 'frames' | 'metadata'
}

// ─── Timeline Marker ────────────────────────────────────────────────────────

export interface TimelineMarker {
  id: string
  time: number
  type: 'segment_start' | 'segment_end' | 'frame' | 'anomaly' | 'event'
  label: string
  severity: Severity
  color: string
  signalType?: string
  segmentId?: string
  frameId?: string
}
