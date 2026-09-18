import type { MediaType } from '../../config/media-registry'
import type {
  IEvidenceVisualizer,
  EvidenceObject,
  VisualizationData,
  VisualizationOptions,
  HeatmapData,
  TimelineData,
  TimelineSegment,
  WaveformData,
  WaveformMarker,
  TextHighlightData,
  TextHighlight,
  VisualizationMetadata,
  SignalType,
} from '../types'

// ─── Evidence Visualizer ─────────────────────────────────────────────────────

export class EvidenceVisualizer implements IEvidenceVisualizer {
  async visualize(
    evidence: EvidenceObject[],
    modality: MediaType,
    options?: VisualizationOptions,
  ): Promise<VisualizationData[]> {
    const visualizations: VisualizationData[] = []

    switch (modality) {
      case 'text':
        visualizations.push(...(await this.visualizeText(evidence, options)))
        break
      case 'image':
        visualizations.push(...(await this.visualizeImage(evidence, options)))
        break
      case 'video':
        visualizations.push(...(await this.visualizeVideo(evidence, options)))
        break
      case 'audio':
        visualizations.push(...(await this.visualizeAudio(evidence, options)))
        break
      case 'document':
        visualizations.push(...(await this.visualizeDocument(evidence, options)))
        break
    }

    return visualizations
  }

  // ── Text Visualization ─────────────────────────────────────────────────────

  private async visualizeText(
    evidence: EvidenceObject[],
    _options?: VisualizationOptions,
  ): Promise<VisualizationData[]> {
    const visualizations: VisualizationData[] = []

    const textEvidence = evidence.filter((e) => e.type === 'text_span' || e.type === 'pattern')

    if (textEvidence.length > 0) {
      const highlightData = this.createTextHighlights(textEvidence)
      visualizations.push({
        type: 'text_highlight',
        data: highlightData,
        metadata: this.createVisualizationMetadata(
          'Text Evidence Highlights',
          'Highlighted regions showing text-based evidence',
        ),
      })
    }

    return visualizations
  }

  private createTextHighlights(evidence: EvidenceObject[]): TextHighlightData {
    const highlights: TextHighlight[] = []
    let fullText = ''

    for (const item of evidence) {
      const location = item.location
      if (!location) continue

      const startOffset = location.start_offset || 0
      const endOffset = location.end_offset || item.content.length

      highlights.push({
        id: item.id,
        start_offset: startOffset,
        end_offset: endOffset,
        text: item.content,
        signal_type: this.inferSignalType(item),
        importance: item.confidence,
        color: this.getSignalColor(this.inferSignalType(item)),
        explanation: item.description,
        clickable: true,
      })

      // Build full text if not provided
      if (!fullText && item.content) {
        fullText = item.content
      }
    }

    return {
      text: fullText,
      highlights: highlights.sort((a, b) => a.start_offset - b.start_offset),
    }
  }

  // ── Image Visualization ────────────────────────────────────────────────────

  private async visualizeImage(
    evidence: EvidenceObject[],
    options?: VisualizationOptions,
  ): Promise<VisualizationData[]> {
    const visualizations: VisualizationData[] = []

    // Create heatmap from image evidence
    const imageEvidence = evidence.filter(
      (e) => e.type === 'heatmap' || e.type === 'attribution_map' || e.type === 'saliency_map',
    )

    if (imageEvidence.length > 0) {
      const heatmap = this.createHeatmapFromEvidence(imageEvidence, options)
      visualizations.push({
        type: 'heatmap',
        data: heatmap,
        metadata: this.createVisualizationMetadata(
          'Model Attribution Heatmap',
          'Heatmap showing model focus areas. Note: This shows model attribution, not proof of manipulation.',
        ),
      })

      // Create overlay visualization
      const overlay = this.createOverlayFromHeatmap(heatmap)
      visualizations.push({
        type: 'overlay',
        data: overlay,
        metadata: this.createVisualizationMetadata(
          'Attribution Overlay',
          'Overlay of attribution heatmap on original image',
        ),
      })
    }

    return visualizations
  }

  private createHeatmapFromEvidence(
    evidence: EvidenceObject[],
    options?: VisualizationOptions,
  ): HeatmapData {
    const width = options?.width || 224
    const height = options?.height || 224
    const values: number[][] = []

    // Initialize heatmap
    for (let y = 0; y < height; y++) {
      const row: number[] = new Array(width).fill(0)
      values.push(row)
    }

    // Fill heatmap from evidence locations
    for (const item of evidence) {
      const location = item.location
      if (!location || location.x === undefined || location.y === undefined) continue

      const x = Math.floor(location.x)
      const y = Math.floor(location.y)
      const w = Math.floor(location.width || 32)
      const h = Math.floor(location.height || 32)

      // Fill the region with importance value
      for (let dy = 0; dy < h && y + dy < height; dy++) {
        for (let dx = 0; dx < w && x + dx < width; dx++) {
          values[y + dy][x + dx] = item.confidence
        }
      }
    }

    return {
      width,
      height,
      values,
      colormap: options?.colormap || 'viridis',
      min: 0,
      max: 1,
    }
  }

  private createOverlayFromHeatmap(heatmap: HeatmapData): {
    original: string
    overlay: string
    opacity: number
    blend_mode: string
  } {
    // Generate a simple overlay representation
    return {
      original: 'original_image_placeholder',
      overlay: `heatmap_${heatmap.width}x${heatmap.height}`,
      opacity: 0.5,
      blend_mode: 'multiply',
    }
  }

  // ── Video Visualization ────────────────────────────────────────────────────

  private async visualizeVideo(
    evidence: EvidenceObject[],
    _options?: VisualizationOptions,
  ): Promise<VisualizationData[]> {
    const visualizations: VisualizationData[] = []

    const videoEvidence = evidence.filter((e) => e.type === 'video_frame' || e.type === 'metadata')

    if (videoEvidence.length > 0) {
      const timeline = this.createTimelineFromEvidence(videoEvidence)
      visualizations.push({
        type: 'timeline',
        data: timeline,
        metadata: this.createVisualizationMetadata(
          'Video Analysis Timeline',
          'Interactive timeline showing analysis results for each segment',
        ),
      })
    }

    return visualizations
  }

  private createTimelineFromEvidence(evidence: EvidenceObject[]): TimelineData {
    const segments: TimelineSegment[] = []
    let totalDuration = 0

    // Sort evidence by time
    const sortedEvidence = [...evidence].sort((a, b) => {
      const aTime = a.location?.start_time || 0
      const bTime = b.location?.start_time || 0
      return aTime - bTime
    })

    // Create segments from evidence
    for (const item of sortedEvidence) {
      const location = item.location
      const startTime = location?.start_time || 0
      const endTime = location?.end_time || startTime + 1

      segments.push({
        id: item.id,
        start_time: startTime,
        end_time: endTime,
        status: item.confidence > 0.7 ? 'suspicious' : item.confidence > 0.4 ? 'review' : 'normal',
        importance: item.confidence,
        label: item.description.substring(0, 50),
        color: this.getStatusColor(
          item.confidence > 0.7 ? 'suspicious' : item.confidence > 0.4 ? 'review' : 'normal',
        ),
      })

      totalDuration = Math.max(totalDuration, endTime)
    }

    // Add normal segments between evidence
    const filledSegments = this.fillTimelineGaps(segments, totalDuration)

    return {
      segments: filledSegments,
      total_duration: totalDuration,
      labels: this.createTimelineLabels(filledSegments),
    }
  }

  private fillTimelineGaps(segments: TimelineSegment[], totalDuration: number): TimelineSegment[] {
    if (segments.length === 0) {
      return [
        {
          id: 'normal-full',
          start_time: 0,
          end_time: totalDuration,
          status: 'normal',
          importance: 0,
          label: 'Normal',
          color: this.getStatusColor('normal'),
        },
      ]
    }

    const filled: TimelineSegment[] = []
    let currentTime = 0

    const sorted = [...segments].sort((a, b) => a.start_time - b.start_time)

    for (const segment of sorted) {
      // Add normal segment before this one if needed
      if (segment.start_time > currentTime + 0.1) {
        filled.push({
          id: `normal-${currentTime}`,
          start_time: currentTime,
          end_time: segment.start_time,
          status: 'normal',
          importance: 0,
          label: 'Normal',
          color: this.getStatusColor('normal'),
        })
      }

      filled.push(segment)
      currentTime = segment.end_time
    }

    // Add final normal segment if needed
    if (currentTime < totalDuration - 0.1) {
      filled.push({
        id: `normal-${currentTime}`,
        start_time: currentTime,
        end_time: totalDuration,
        status: 'normal',
        importance: 0,
        label: 'Normal',
        color: this.getStatusColor('normal'),
      })
    }

    return filled
  }

  private createTimelineLabels(segments: TimelineSegment[]): Array<{
    position: number
    text: string
    type: 'timestamp' | 'event' | 'marker'
  }> {
    const labels: Array<{
      position: number
      text: string
      type: 'timestamp' | 'event' | 'marker'
    }> = []

    for (const segment of segments) {
      if (segment.status !== 'normal') {
        labels.push({
          position: segment.start_time,
          text: segment.label,
          type: 'event',
        })
      }
    }

    return labels
  }

  // ── Audio Visualization ────────────────────────────────────────────────────

  private async visualizeAudio(
    evidence: EvidenceObject[],
    _options?: VisualizationOptions,
  ): Promise<VisualizationData[]> {
    const visualizations: VisualizationData[] = []

    // Create waveform visualization
    const waveform = this.createWaveformFromEvidence(evidence)
    visualizations.push({
      type: 'waveform',
      data: waveform,
      metadata: this.createVisualizationMetadata(
        'Audio Waveform',
        'Waveform with markers showing analysis results',
      ),
    })

    return visualizations
  }

  private createWaveformFromEvidence(evidence: EvidenceObject[]): WaveformData {
    const markers: WaveformMarker[] = []
    let duration = 0

    for (const item of evidence) {
      const location = item.location
      const startTime = location?.start_time || 0

      markers.push({
        time: startTime,
        type: item.confidence > 0.7 ? 'anomaly' : 'marker',
        label: item.description.substring(0, 30),
        color: item.confidence > 0.7 ? '#ef4444' : '#3b82f6',
      })

      duration = Math.max(duration, location?.end_time || startTime + 1)
    }

    // Generate placeholder waveform samples
    const sampleRate = 44100
    const samples = new Array(Math.min(sampleRate * duration, 44100 * 10))
      .fill(0)
      .map(() => Math.random() * 2 - 1)

    return {
      samples,
      sample_rate: sampleRate,
      duration,
      markers: markers.sort((a, b) => a.time - b.time),
    }
  }

  // ── Document Visualization ─────────────────────────────────────────────────

  private async visualizeDocument(
    evidence: EvidenceObject[],
    _options?: VisualizationOptions,
  ): Promise<VisualizationData[]> {
    const visualizations: VisualizationData[] = []

    const documentEvidence = evidence.filter(
      (e) => e.type === 'document_section' || e.type === 'text_span',
    )

    if (documentEvidence.length > 0) {
      const highlightData = this.createDocumentHighlights(documentEvidence)
      visualizations.push({
        type: 'document_highlight',
        data: highlightData,
        metadata: this.createVisualizationMetadata(
          'Document Evidence Highlights',
          'Highlighted sections showing evidence in the document',
        ),
      })
    }

    return visualizations
  }

  private createDocumentHighlights(evidence: EvidenceObject[]): TextHighlightData {
    const highlights: TextHighlight[] = []
    let fullText = ''

    for (const item of evidence) {
      const location = item.location
      if (!location) continue

      const startOffset = location.start_offset || 0
      const endOffset = location.end_offset || item.content.length

      highlights.push({
        id: item.id,
        start_offset: startOffset,
        end_offset: endOffset,
        text: item.content,
        signal_type: this.inferSignalType(item),
        importance: item.confidence,
        color: this.getSignalColor(this.inferSignalType(item)),
        explanation: item.description,
        clickable: true,
      })

      if (!fullText && item.content) {
        fullText = item.content
      }
    }

    return {
      text: fullText,
      highlights: highlights.sort((a, b) => a.start_offset - b.start_offset),
    }
  }

  // ── Helper Methods ─────────────────────────────────────────────────────────

  private inferSignalType(evidence: EvidenceObject): SignalType {
    const content = evidence.content.toLowerCase()
    const description = evidence.description.toLowerCase()

    if (content.includes('ai') || description.includes('generated')) return 'ai_generation'
    if (content.includes('manipulat') || description.includes('manipulat')) return 'manipulation'
    if (content.includes('plagiar') || description.includes('plagiar')) return 'plagiarism'
    if (content.includes('similar') || description.includes('similar')) return 'similarity'
    if (content.includes('artifact') || description.includes('artifact')) return 'visual_artifact'

    return 'manipulation'
  }

  private getSignalColor(signalType: SignalType): string {
    const colors: Record<string, string> = {
      ai_generation: '#ef4444',
      manipulation: '#f97316',
      plagiarism: '#eab308',
      similarity: '#84cc16',
      visual_artifact: '#a855f7',
      acoustic_artifact: '#6366f1',
      temporal_anomaly: '#ec4899',
      metadata_anomaly: '#14b8a6',
      authenticity_indicator: '#22c55e',
    }

    return colors[signalType] || '#6b7280'
  }

  private getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      normal: '#22c55e',
      review: '#eab308',
      suspicious: '#ef4444',
      confirmed: '#dc2626',
    }

    return colors[status] || '#6b7280'
  }

  private createVisualizationMetadata(title: string, description: string): VisualizationMetadata {
    return {
      title,
      description,
      interactive: true,
      zoomable: true,
      exportable: true,
    }
  }
}
