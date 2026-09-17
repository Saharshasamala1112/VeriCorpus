import type { MediaType } from '../../config/media-registry'
import type {
  ILocalizationProvider,
  ExplanationSignalObject,
  AffectedRegion,
  AffectedSegment,
  BoundingBox,
} from '../types'
import { LOCALIZATION_UNAVAILABLE } from '../types'

// ─── Localization Provider ───────────────────────────────────────────────────

export class LocalizationProvider implements ILocalizationProvider {
  async localize(
    signals: ExplanationSignalObject[],
    content: unknown,
    modality: MediaType,
  ): Promise<{ regions: AffectedRegion[]; segments: AffectedSegment[] }> {
    switch (modality) {
      case 'text':
        return this.localizeText(signals, content as string)
      case 'image':
        return this.localizeImage(signals, content as ImageData)
      case 'video':
        return this.localizeVideo(signals, content as VideoContent)
      case 'audio':
        return this.localizeAudio(signals, content as AudioContent)
      case 'document':
        return this.localizeDocument(signals, content as DocumentContent)
      default:
        return { regions: [], segments: [] }
    }
  }

  // ── Text Localization ──────────────────────────────────────────────────────

  private async localizeText(
    signals: ExplanationSignalObject[],
    text: string,
  ): Promise<{ regions: AffectedRegion[]; segments: AffectedSegment[] }> {
    const regions: AffectedRegion[] = []
    const segments: AffectedSegment[] = []

    if (!text) return { regions, segments }

    const sentences = this.splitIntoSentences(text)
    const paragraphs = text.split(/\n\s*\n/)

    for (const signal of signals) {
      const signalText = this.extractSignalText(signal)
      if (!signalText) continue

      // Find the text in the document
      const matches = this.findTextMatches(text, signalText)

      for (const match of matches) {
        // Create segment for the match
        const segment: AffectedSegment = {
          id: `text-segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'textual',
          label: `${signal.name} at position ${match.start}`,
          location: {
            start: match.start,
            end: match.end,
            unit: 'characters',
            text: text.substring(match.start, match.end),
            ...this.getTextLocationContext(text, match.start, match.end, sentences, paragraphs),
          },
          importance: signal.score,
          explanation: signal.explanation,
          signal_type: signal.signal_type,
        }
        segments.push(segment)
      }
    }

    // If no specific localization found, create paragraph-level segments
    if (segments.length === 0 && paragraphs.length > 1) {
      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i]
        const paraStart = text.indexOf(para)
        const paraEnd = paraStart + para.length

        // Check if any signals might apply to this paragraph
        const relevantSignals = signals.filter((s) => this.isSignalRelevantToText(s, para))

        if (relevantSignals.length > 0) {
          segments.push({
            id: `text-para-${i}-${Date.now()}`,
            type: 'paragraph',
            label: `Paragraph ${i + 1}`,
            location: {
              start: paraStart,
              end: paraEnd,
              unit: 'characters',
              text: para.substring(0, 100) + (para.length > 100 ? '...' : ''),
              paragraph_index: i,
            },
            importance: Math.max(...relevantSignals.map((s) => s.score)),
            explanation: relevantSignals.map((s) => s.explanation).join('; '),
            signal_type: relevantSignals[0].signal_type,
          })
        }
      }
    }

    return { regions, segments }
  }

  private splitIntoSentences(text: string): string[] {
    return text.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0)
  }

  private extractSignalText(signal: ExplanationSignalObject): string | null {
    // Extract searchable text from signal explanation
    const explanation = signal.explanation.toLowerCase()

    // Look for quoted text
    const quotedMatch = explanation.match(/["']([^"']+)["']/)
    if (quotedMatch) return quotedMatch[1]

    // Look for specific patterns
    const patterns = [
      /(?:contains?|includes?|shows?)\s+["']?([^"'.]+)["']?/i,
      /(?:text|word|phrase)\s+["']?([^"'.]+)["']?/i,
    ]

    for (const pattern of patterns) {
      const match = explanation.match(pattern)
      if (match) return match[1]
    }

    return null
  }

  private findTextMatches(text: string, search: string): Array<{ start: number; end: number }> {
    const matches: Array<{ start: number; end: number }> = []
    const lowerText = text.toLowerCase()
    const lowerSearch = search.toLowerCase()

    let startIndex = 0
    while (startIndex < lowerText.length) {
      const index = lowerText.indexOf(lowerSearch, startIndex)
      if (index === -1) break

      matches.push({
        start: index,
        end: index + search.length,
      })
      startIndex = index + 1
    }

    return matches
  }

  private getTextLocationContext(
    text: string,
    start: number,
    end: number,
    sentences: string[],
    paragraphs: string[],
  ): { sentence_index?: number; paragraph_index?: number } {
    let currentOffset = 0
    let sentenceIndex = 0
    let paragraphIndex = 0

    // Find sentence index
    for (let i = 0; i < sentences.length; i++) {
      const sentenceEnd = currentOffset + sentences[i].length
      if (start >= currentOffset && start < sentenceEnd) {
        sentenceIndex = i
        break
      }
      currentOffset = sentenceEnd + 1
    }

    // Find paragraph index
    currentOffset = 0
    for (let i = 0; i < paragraphs.length; i++) {
      const paraEnd = currentOffset + paragraphs[i].length
      if (start >= currentOffset && start < paraEnd) {
        paragraphIndex = i
        break
      }
      currentOffset = paraEnd + 2 // Account for \n\n
    }

    return { sentence_index: sentenceIndex, paragraph_index: paragraphIndex }
  }

  private isSignalRelevantToText(signal: ExplanationSignalObject, text: string): boolean {
    const keywords = signal.name.toLowerCase().split(' ')
    const textLower = text.toLowerCase()

    return keywords.some((keyword) => textLower.includes(keyword))
  }

  // ── Image Localization ─────────────────────────────────────────────────────

  private async localizeImage(
    signals: ExplanationSignalObject[],
    imageData: ImageData,
  ): Promise<{ regions: AffectedRegion[]; segments: AffectedSegment[] }> {
    const regions: AffectedRegion[] = []
    const segments: AffectedSegment[] = []

    // Image localization requires attribution data
    // Without a model, we can only provide signal-based regions
    for (const signal of signals) {
      if (signal.affected_region_ids && signal.affected_region_ids.length > 0) {
        // Regions already provided by attribution
        continue
      }

      // Create a generic region based on signal type
      const region = this.createGenericImageRegion(signal, imageData)
      if (region) {
        regions.push(region)
      }
    }

    return { regions, segments }
  }

  private createGenericImageRegion(
    signal: ExplanationSignalObject,
    imageData: ImageData,
  ): AffectedRegion | null {
    const width = imageData.width
    const height = imageData.height

    // Create a region based on signal type
    const bbox: BoundingBox = {
      x: Math.floor(width * 0.2),
      y: Math.floor(height * 0.2),
      width: Math.floor(width * 0.6),
      height: Math.floor(height * 0.6),
      normalized: false,
    }

    return {
      id: `image-region-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'attribution',
      label: signal.name,
      coordinates: bbox,
      importance: signal.score,
      explanation: signal.explanation,
      signal_type: signal.signal_type,
      metadata: {
        note: LOCALIZATION_UNAVAILABLE,
      },
    }
  }

  // ── Video Localization ─────────────────────────────────────────────────────

  private async localizeVideo(
    signals: ExplanationSignalObject[],
    content: VideoContent,
  ): Promise<{ regions: AffectedRegion[]; segments: AffectedSegment[] }> {
    const regions: AffectedRegion[] = []
    const segments: AffectedSegment[] = []

    const duration = content.duration || 0
    const fps = content.fps || 30

    for (const signal of signals) {
      const segment = this.createVideoSegment(signal, duration, fps)
      if (segment) {
        segments.push(segment)
      }
    }

    // Merge overlapping segments
    const mergedSegments = this.mergeTemporalSegments(segments)

    return { regions, segments: mergedSegments }
  }

  private createVideoSegment(
    signal: ExplanationSignalObject,
    duration: number,
    fps: number,
  ): AffectedSegment | null {
    // Extract temporal information from signal metadata
    const startTime = (signal as any).start_time || 0
    const endTime = (signal as any).end_time || duration

    if (startTime >= endTime || startTime < 0) return null

    return {
      id: `video-segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'temporal',
      label: signal.name,
      location: {
        start: startTime,
        end: endTime,
        unit: 'seconds',
      },
      importance: signal.score,
      explanation: signal.explanation,
      signal_type: signal.signal_type,
      metadata: {
        affected_frames: this.getAffectedFrames(startTime, endTime, fps),
      },
    }
  }

  private getAffectedFrames(start: number, end: number, fps: number): number[] {
    const frames: number[] = []
    const startFrame = Math.floor(start * fps)
    const endFrame = Math.ceil(end * fps)

    // Sample frames if there are too many
    const frameCount = endFrame - startFrame
    if (frameCount > 20) {
      const step = Math.floor(frameCount / 20)
      for (let i = startFrame; i < endFrame; i += step) {
        frames.push(i)
      }
    } else {
      for (let i = startFrame; i < endFrame; i++) {
        frames.push(i)
      }
    }

    return frames
  }

  private mergeTemporalSegments(segments: AffectedSegment[]): AffectedSegment[] {
    if (segments.length <= 1) return segments

    const sorted = [...segments].sort((a, b) => a.location.start - b.location.start)
    const merged: AffectedSegment[] = [sorted[0]]

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]
      const last = merged[merged.length - 1]

      // Check for overlap
      if (current.location.start <= last.location.end + 1) {
        // Merge
        last.location.end = Math.max(last.location.end, current.location.end)
        last.importance = Math.max(last.importance, current.importance)
        last.explanation = `${last.explanation}; ${current.explanation}`
      } else {
        merged.push(current)
      }
    }

    return merged
  }

  // ── Audio Localization ─────────────────────────────────────────────────────

  private async localizeAudio(
    signals: ExplanationSignalObject[],
    content: AudioContent,
  ): Promise<{ regions: AffectedRegion[]; segments: AffectedSegment[] }> {
    const regions: AffectedRegion[] = []
    const segments: AffectedSegment[] = []

    const duration = content.duration || 0
    const sampleRate = content.sampleRate || 44100

    for (const signal of signals) {
      const segment = this.createAudioSegment(signal, duration, sampleRate)
      if (segment) {
        segments.push(segment)
      }
    }

    // Merge overlapping segments
    const mergedSegments = this.mergeTemporalSegments(segments)

    return { regions, segments: mergedSegments }
  }

  private createAudioSegment(
    signal: ExplanationSignalObject,
    duration: number,
    _sampleRate: number,
  ): AffectedSegment | null {
    const startTime = (signal as any).start_time || 0
    const endTime = (signal as any).end_time || duration

    if (startTime >= endTime || startTime < 0) return null

    return {
      id: `audio-segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: 'temporal',
      label: signal.name,
      location: {
        start: startTime,
        end: endTime,
        unit: 'seconds',
      },
      importance: signal.score,
      explanation: signal.explanation,
      signal_type: signal.signal_type,
      metadata: {
        frequency_range: (signal as any).frequency_range,
      },
    }
  }

  // ── Document Localization ──────────────────────────────────────────────────

  private async localizeDocument(
    signals: ExplanationSignalObject[],
    content: DocumentContent,
  ): Promise<{ regions: AffectedRegion[]; segments: AffectedSegment[] }> {
    const regions: AffectedRegion[] = []
    const segments: AffectedSegment[] = []

    for (const signal of signals) {
      const segment = this.createDocumentSegment(signal, content)
      if (segment) {
        segments.push(segment)
      }
    }

    return { regions, segments }
  }

  private createDocumentSegment(
    signal: ExplanationSignalObject,
    content: DocumentContent,
  ): AffectedSegment | null {
    // Try to find the signal's content in the document
    const signalText = this.extractSignalText(signal)
    if (!signalText) {
      // Create a generic document segment
      return {
        id: `doc-segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'page',
        label: signal.name,
        location: {
          start: 0,
          end: content.text.length,
          unit: 'characters',
          page: 1,
        },
        importance: signal.score,
        explanation: signal.explanation,
        signal_type: signal.signal_type,
        metadata: {
          note: 'Specific location could not be determined',
        },
      }
    }

    // Find the text in the document
    const textIndex = content.text.toLowerCase().indexOf(signalText.toLowerCase())
    if (textIndex === -1) return null

    // Find which page and paragraph this is in
    const pageInfo = this.findDocumentLocation(content, textIndex)

    return {
      id: `doc-segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: pageInfo.paragraph_index !== undefined ? 'paragraph' : 'sentence',
      label: signal.name,
      location: {
        start: textIndex,
        end: textIndex + signalText.length,
        unit: 'characters',
        text: signalText,
        page: pageInfo.page,
        paragraph_index: pageInfo.paragraph_index,
        sentence_index: pageInfo.sentence_index,
      },
      importance: signal.score,
      explanation: signal.explanation,
      signal_type: signal.signal_type,
    }
  }

  private findDocumentLocation(
    content: DocumentContent,
    textIndex: number,
  ): { page?: number; paragraph_index?: number; sentence_index?: number } {
    let currentOffset = 0

    for (const page of content.pages) {
      const pageStart = content.text.indexOf(page.text, currentOffset)
      const pageEnd = pageStart + page.text.length

      if (textIndex >= pageStart && textIndex < pageEnd) {
        // Found the page
        let paraOffset = pageStart
        for (let i = 0; i < page.paragraphs.length; i++) {
          const para = page.paragraphs[i]
          const paraStart = content.text.indexOf(para.text, paraOffset)
          const paraEnd = paraStart + para.text.length

          if (textIndex >= paraStart && textIndex < paraEnd) {
            return {
              page: page.page_number,
              paragraph_index: i,
            }
          }
          paraOffset = paraEnd
        }

        return { page: page.page_number }
      }

      currentOffset = pageEnd
    }

    return {}
  }
}

// ─── Content Types ───────────────────────────────────────────────────────────

interface VideoContent {
  duration: number
  fps: number
  width: number
  height: number
}

interface AudioContent {
  duration: number
  sampleRate: number
  channels: number
}
