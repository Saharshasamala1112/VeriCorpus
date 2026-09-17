// ─── Explainability Engine ───────────────────────────────────────────────────

export { ExplainabilityEngine } from './ExplainabilityEngine'

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  ExplanationObject,
  AffectedRegion,
  AffectedSegment,
  ExplanationSignalObject,
  EvidenceObject,
  VisualizationData,
  VisualizationOptions,
  VisualizationType,
  HeatmapData,
  OverlayData,
  TimelineData,
  TimelineSegment,
  TimelineLabel,
  WaveformData,
  WaveformMarker,
  TextHighlightData,
  TextHighlight,
  VisualizationMetadata,
  IExplanationBuilder,
  IAttributionProvider,
  ILocalizationProvider,
  IEvidenceVisualizer,
  ITextExplainer,
  IImageExplainer,
  IVideoExplainer,
  IAudioExplainer,
  IDocumentExplainer,
  ExplanationSignals,
  Evidence,
  Confidence,
  ConfidenceFactor,
  Attribution,
  ModalityLimitations,
  Visualizations,
  AttributionInput,
  AttributionResult,
  AttributionMethod,
  AttributionMetadata,
  BoundingBox,
  SegmentLocation,
} from './types'

// ─── Constants ───────────────────────────────────────────────────────────────

export { LOCALIZATION_UNAVAILABLE, ATTRIBUTION_UNAVAILABLE, GRADCAM_UNAVAILABLE } from './types'

// ─── Providers ───────────────────────────────────────────────────────────────

export { AttributionProvider } from './providers/AttributionProvider'
export { LocalizationProvider } from './providers/LocalizationProvider'
export { EvidenceVisualizer } from './providers/EvidenceVisualizer'
export { ExplanationBuilder } from './providers/ExplanationBuilder'

// ─── Explainers ──────────────────────────────────────────────────────────────

export { TextExplainer } from './explainers/TextExplainer'
export { ImageExplainer } from './explainers/ImageExplainer'
export { VideoExplainer } from './explainers/VideoExplainer'
export { AudioExplainer } from './explainers/AudioExplainer'
export { DocumentExplainer } from './explainers/DocumentExplainer'
