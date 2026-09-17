// ─── Main Engine ─────────────────────────────────────────────────────────────

export {
  AuthenticityEngine,
  getAuthenticityEngine,
  resetAuthenticityEngine,
} from './AuthenticityEngine'

// ─── Analyzers ───────────────────────────────────────────────────────────────

export { TextAnalyzer } from './analyzers/TextAnalyzer'
export { ImageAnalyzer } from './analyzers/ImageAnalyzer'
export { AudioAnalyzer } from './analyzers/AudioAnalyzer'
export { VideoAnalyzer } from './analyzers/VideoAnalyzer'
export { DocumentAnalyzer } from './analyzers/DocumentAnalyzer'

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  // Assessment
  AssessmentVerdict,
  SignalSeverity,
  SignalDirection,

  // Core Signal
  ModalitySignal,

  // Evidence
  EvidenceCategory,
  EvidenceItem,
  SpatialLocation,
  TemporalLocation,
  TextLocation,

  // Regions
  AffectedRegion,

  // Confidence
  ConfidenceMetrics,

  // Input Types
  BaseInput,
  TextInput,
  ImageInput,
  ImageMetadata,
  AudioInput,
  AudioMetadata,
  VideoInput,
  VideoMetadata,
  DocumentInput,
  DocumentMetadata,
  MediaInput,

  // Output
  AuthenticityAssessment,

  // Analyzer Interface
  ModalityAnalyzer,
  ModalityAnalysisResult,

  // Configuration
  EngineConfig,
} from './types'
