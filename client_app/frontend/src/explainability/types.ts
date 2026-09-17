import type { MediaType } from '../config/media-registry'

// ─── Core Explanation Object ─────────────────────────────────────────────────

export interface ExplanationObject {
  explanation_id: string
  modality: MediaType
  method: string
  target: string
  affected_regions: AffectedRegion[]
  affected_segments: AffectedSegment[]
  signals: ExplanationSignalObject[]
  evidence: EvidenceObject[]
  limitations: string[]
  model_version: string
  created_at: string
}

// ─── Affected Regions (Spatial) ──────────────────────────────────────────────

export interface AffectedRegion {
  id: string
  type: 'bounding_box' | 'heatmap' | 'overlay' | 'attribution' | 'saliency'
  label: string
  coordinates: BoundingBox | Polygon | Point[]
  importance: number
  explanation: string
  signal_type: SignalType
  metadata?: Record<string, unknown>
}

export interface BoundingBox {
  x: number
  y: number
  width: number
  height: number
  normalized: boolean
}

export interface Polygon {
  points: Point[]
  normalized: boolean
}

export interface Point {
  x: number
  y: number
}

// ─── Affected Segments (Temporal/Structural) ─────────────────────────────────

export interface AffectedSegment {
  id: string
  type: 'temporal' | 'textual' | 'page' | 'paragraph' | 'sentence' | 'token'
  label: string
  location: SegmentLocation
  importance: number
  explanation: string
  signal_type: SignalType
  metadata?: Record<string, unknown>
}

export interface SegmentLocation {
  start: number
  end: number
  unit: 'seconds' | 'frames' | 'characters' | 'words' | 'paragraphs' | 'pages'
  text?: string
  page?: number
  paragraph_index?: number
  sentence_index?: number
  token_span?: { start: number; end: number }
}

// ─── Signal Types ────────────────────────────────────────────────────────────

export type SignalType =
  | 'ai_generation'
  | 'manipulation'
  | 'plagiarism'
  | 'similarity'
  | 'linguistic_anomaly'
  | 'visual_artifact'
  | 'acoustic_artifact'
  | 'temporal_anomaly'
  | 'metadata_anomaly'
  | 'structural_anomaly'
  | 'face_anomaly'
  | 'compression_artifact'
  | 'frequency_anomaly'
  | 'sync_anomaly'
  | 'provenance_gap'
  | 'semantic_inconsistency'
  | 'contradiction'
  | 'authenticity_indicator'

// ─── Explanation Signal Object ───────────────────────────────────────────────

export interface ExplanationSignalObject {
  id: string
  name: string
  signal_type: SignalType
  direction: 'supporting' | 'counter' | 'neutral'
  severity: 'high' | 'medium' | 'low' | 'info'
  score: number
  explanation: string
  affected_region_ids?: string[]
  affected_segment_ids?: string[]
}

// ─── Evidence Object ─────────────────────────────────────────────────────────

export interface EvidenceObject {
  id: string
  type: EvidenceObjectType
  content: string
  description: string
  confidence: number
  source?: string
  location?: EvidenceLocation
  metadata?: Record<string, unknown>
}

export type EvidenceObjectType =
  | 'text_span'
  | 'image_region'
  | 'audio_segment'
  | 'video_frame'
  | 'document_section'
  | 'heatmap'
  | 'attribution_map'
  | 'saliency_map'
  | 'metadata'
  | 'comparison'
  | 'pattern'

export interface EvidenceLocation {
  page?: number
  paragraph?: number
  sentence?: number
  start_offset?: number
  end_offset?: number
  x?: number
  y?: number
  width?: number
  height?: number
  start_time?: number
  end_time?: number
  frame_index?: number
}

// ─── Attribution Types ───────────────────────────────────────────────────────

export type AttributionMethod =
  | 'grad_cam'
  | 'grad_cam_plus_plus'
  | 'integrated_gradients'
  | 'saliency'
  | 'occlusion'
  | 'lime'
  | 'shap'
  | 'attention'

export interface AttributionResult {
  method: AttributionMethod
  layer?: string
  target_class?: string
  heatmap: Float32Array | number[][]
  overlay?: ImageData
  normalized_attribution: number[][]
  affected_regions: AffectedRegion[]
  metadata: AttributionMetadata
}

export interface AttributionMetadata {
  layer: string
  target_class: string
  attribution_method: AttributionMethod
  model_version: string
  normalization_method: string
  input_size?: { width: number; height: number }
}

// ─── Visualization Types ─────────────────────────────────────────────────────

export interface VisualizationData {
  type: VisualizationType
  data: HeatmapData | OverlayData | TimelineData | WaveformData | TextHighlightData
  metadata: VisualizationMetadata
}

export type VisualizationType =
  | 'heatmap'
  | 'overlay'
  | 'timeline'
  | 'waveform'
  | 'spectrogram'
  | 'text_highlight'
  | 'document_highlight'

export interface HeatmapData {
  width: number
  height: number
  values: number[][]
  colormap: string
  min: number
  max: number
}

export interface OverlayData {
  original: string | ImageData
  overlay: string | ImageData
  opacity: number
  blend_mode: string
}

export interface TimelineData {
  segments: TimelineSegment[]
  total_duration: number
  labels: TimelineLabel[]
}

export interface TimelineSegment {
  id: string
  start_time: number
  end_time: number
  status: 'normal' | 'review' | 'suspicious' | 'confirmed'
  importance: number
  label: string
  color: string
}

export interface TimelineLabel {
  position: number
  text: string
  type: 'timestamp' | 'event' | 'marker'
}

export interface WaveformData {
  samples: number[]
  sample_rate: number
  duration: number
  markers: WaveformMarker[]
}

export interface WaveformMarker {
  time: number
  type: 'anomaly' | 'event' | 'marker'
  label: string
  color: string
}

export interface TextHighlightData {
  text: string
  highlights: TextHighlight[]
}

export interface TextHighlight {
  id: string
  start_offset: number
  end_offset: number
  text: string
  signal_type: SignalType
  importance: number
  color: string
  explanation: string
  clickable: boolean
}

export interface VisualizationMetadata {
  title: string
  description: string
  interactive: boolean
  zoomable: boolean
  exportable: boolean
}

// ─── Provider Interfaces ─────────────────────────────────────────────────────

export interface IAttributionProvider {
  computeAttribution(input: AttributionInput, method: AttributionMethod): Promise<AttributionResult>
  getSupportedMethods(): AttributionMethod[]
  isSupported(modelType: string): boolean
}

export interface AttributionInput {
  model: unknown
  input_data: unknown
  target_layer?: string
  target_class?: string
  input_size?: { width: number; height: number }
}

export interface ILocalizationProvider {
  localize(
    signals: ExplanationSignalObject[],
    content: unknown,
    modality: MediaType,
  ): Promise<{ regions: AffectedRegion[]; segments: AffectedSegment[] }>
}

export interface IEvidenceVisualizer {
  visualize(
    evidence: EvidenceObject[],
    modality: MediaType,
    options?: VisualizationOptions,
  ): Promise<VisualizationData[]>
}

export interface VisualizationOptions {
  width?: number
  height?: number
  colormap?: string
  opacity?: number
  interactive?: boolean
}

export interface IExplanationBuilder {
  build(params: ExplanationBuilderParams): Promise<ExplanationObject>
}

export interface ExplanationBuilderParams {
  modality: MediaType
  method: string
  target: string
  signals: ExplanationSignalObject[]
  evidence: EvidenceObject[]
  regions: AffectedRegion[]
  segments: AffectedSegment[]
  limitations: string[]
  model_version: string
}

// ─── Modality-Specific Explainability Interfaces ─────────────────────────────

export interface ITextExplainer {
  explain(
    text: string,
    signals: ExplanationSignalObject[],
    evidence: EvidenceObject[],
  ): Promise<{
    highlights: TextHighlightData
    segments: AffectedSegment[]
    limitations: string[]
  }>
}

export interface IImageExplainer {
  explain(
    image: ImageData | HTMLCanvasElement,
    attribution?: AttributionResult,
    signals?: ExplanationSignalObject[],
    evidence?: EvidenceObject[],
  ): Promise<{
    visualizations: VisualizationData[]
    regions: AffectedRegion[]
    limitations: string[]
  }>
}

export interface IVideoExplainer {
  explain(
    frames: FrameData[],
    duration: number,
    signals: ExplanationSignalObject[],
    evidence: EvidenceObject[],
  ): Promise<{
    timeline: TimelineData
    segments: AffectedSegment[]
    limitations: string[]
  }>
}

export interface FrameData {
  index: number
  timestamp: number
  image_data: ImageData | HTMLCanvasElement
}

export interface IAudioExplainer {
  explain(
    audio: AudioBuffer | Float32Array,
    sample_rate: number,
    signals: ExplanationSignalObject[],
    evidence: EvidenceObject[],
  ): Promise<{
    waveform: WaveformData
    spectrogram?: VisualizationData
    segments: AffectedSegment[]
    limitations: string[]
  }>
}

export interface IDocumentExplainer {
  explain(
    document: DocumentContent,
    signals: ExplanationSignalObject[],
    evidence: EvidenceObject[],
  ): Promise<{
    highlights: TextHighlightData
    segments: AffectedSegment[]
    page_markers: PageMarker[]
    limitations: string[]
  }>
}

export interface DocumentContent {
  text: string
  pages: PageContent[]
  metadata?: Record<string, unknown>
}

export interface PageContent {
  page_number: number
  text: string
  paragraphs: ParagraphContent[]
}

export interface ParagraphContent {
  index: number
  text: string
  start_offset: number
  end_offset: number
}

export interface PageMarker {
  page_number: number
  has_highlights: boolean
  highlight_count: number
}

// ─── Engine Configuration ────────────────────────────────────────────────────

export interface ExplainabilityConfig {
  enabled_modalities: MediaType[]
  default_attribution_method: AttributionMethod
  max_highlights_per_modality: number
  enable_interactive: boolean
  enable_saliency_maps: boolean
  enable_grad_cam: boolean
  enable_integrated_gradients: boolean
  model_versions: Record<string, string>
}

// ─── Limitation Messages ─────────────────────────────────────────────────────

export const LOCALIZATION_UNAVAILABLE = 'Detailed localization is unavailable for this model.'

export const ATTRIBUTION_UNAVAILABLE =
  'Model attribution is not available for this model architecture.'

export const GRADCAM_UNAVAILABLE =
  'Grad-CAM requires a CNN-based model with accessible convolutional layers.'
