import type {
  ModalityAnalyzer,
  VideoInput,
  ModalityAnalysisResult,
  ModalitySignal,
  EvidenceItem,
  AffectedRegion,
} from '../types'

// ─── Video Feature Types ─────────────────────────────────────────────────────

interface VideoAnalysisData {
  duration: number
  fps: number
  width: number
  height: number
  frameCount: number
  frames: FrameData[]
  audioTrack?: AudioTrackData
  metadata: Record<string, unknown>
}

interface FrameData {
  index: number
  timestamp: number
  luminanceMean: number
  luminanceVariance: number
  colorHistogram: number[]
  edgeDensity: number
  motionVector?: { dx: number; dy: number }
  faceRegion?: { x: number; y: number; width: number; height: number }
}

interface AudioTrackData {
  sampleRate: number
  channels: number
  duration: number
  energy: number[]
  syncOffset: number
}

interface SceneChange {
  frameIndex: number
  timestamp: number
  severity: 'cut' | 'dissolve' | 'fade'
  confidence: number
}

interface MotionConsistency {
  score: number
  outliers: Array<{ frameIndex: number; deviation: number }>
}

// ─── Video Analyzer ──────────────────────────────────────────────────────────

export class VideoAnalyzer implements ModalityAnalyzer<VideoInput> {
  modality = 'video' as const

  private readonly DEEPFAKE_INDICATORS = [
    'face_swap',
    'lip_sync',
    'reenactment',
    'puppet',
    'face_reenactment',
  ]

  private readonly FRAME_SAMPLE_RATE = 10 // Analyze every Nth frame
  private readonly MOTION_WINDOW = 5

  async analyze(input: VideoInput): Promise<ModalityAnalysisResult> {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const affectedRegions: AffectedRegion[] = []
    const affectedSegments: AffectedRegion[] = []
    const limitations: string[] = []

    try {
      const videoData = await this.extractVideoData(input)
      const metadata = input.metadata || {}

      // ── Frame-Level Artifacts ──────────────────────────────────────────────
      const frameSignals = this.analyzeFrameArtifacts(videoData)
      signals.push(...frameSignals.signals)
      counterSignals.push(...frameSignals.counterSignals)
      evidence.push(...frameSignals.evidence)
      affectedRegions.push(...frameSignals.regions)

      // ── Temporal Consistency ───────────────────────────────────────────────
      const temporalSignals = this.analyzeTemporalConsistency(videoData)
      signals.push(...temporalSignals.signals)
      counterSignals.push(...temporalSignals.counterSignals)
      evidence.push(...temporalSignals.evidence)
      affectedSegments.push(...temporalSignals.segments)

      // ── Audio-Video Synchronization ────────────────────────────────────────
      const syncSignals = this.analyzeAudioVideoSync(videoData)
      signals.push(...syncSignals.signals)
      counterSignals.push(...syncSignals.counterSignals)
      evidence.push(...syncSignals.evidence)
      affectedSegments.push(...syncSignals.segments)

      // ── Scene Consistency ──────────────────────────────────────────────────
      const sceneSignals = this.analyzeSceneConsistency(videoData)
      signals.push(...sceneSignals.signals)
      counterSignals.push(...sceneSignals.counterSignals)
      evidence.push(...sceneSignals.evidence)

      // ── Metadata Analysis ──────────────────────────────────────────────────
      const metadataSignals = this.analyzeMetadata(metadata, input)
      signals.push(...metadataSignals.signals)
      counterSignals.push(...metadataSignals.counterSignals)
      evidence.push(...metadataSignals.evidence)

      // ── Facial/Visual Signals ──────────────────────────────────────────────
      const facialSignals = this.analyzeFacialSignals(videoData)
      signals.push(...facialSignals.signals)
      counterSignals.push(...facialSignals.counterSignals)
      evidence.push(...facialSignals.evidence)
      affectedRegions.push(...facialSignals.regions)

      const resultMetadata: Record<string, unknown> = {
        duration: videoData.duration,
        fps: videoData.fps,
        resolution: `${videoData.width}x${videoData.height}`,
        frameCount: videoData.frameCount,
        hasAudio: !!videoData.audioTrack,
        sampledFrames: videoData.frames.length,
      }

      return {
        signals,
        counterSignals,
        evidence,
        affectedRegions,
        affectedSegments,
        limitations,
        metadata: resultMetadata,
      }
    } catch (error) {
      limitations.push(
        `Video analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
      return {
        signals: [],
        counterSignals: [],
        evidence: [],
        affectedRegions: [],
        affectedSegments: [],
        limitations,
        metadata: { error: true },
      }
    }
  }

  // ── Video Data Extraction ───────────────────────────────────────────────────

  private async extractVideoData(input: VideoInput): Promise<VideoAnalysisData> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video')
      video.preload = 'metadata'

      video.onloadedmetadata = async () => {
        const duration = video.duration
        const fps = input.metadata?.fps || 30
        const width = video.videoWidth || input.metadata?.width || 0
        const height = video.videoHeight || input.metadata?.height || 0
        const frameCount = Math.floor(duration * fps)

        const frames = await this.extractFrames(video, frameCount, fps)
        const audioTrack = input.metadata?.hasAudio
          ? await this.extractAudioTrack(input)
          : undefined

        resolve({
          duration,
          fps,
          width,
          height,
          frameCount,
          frames,
          audioTrack,
          metadata: {
            ...(input.metadata || {}),
            sampleRate: input.metadata?.sampleRate ?? 44100,
          } as Record<string, unknown>,
        })
      }

      video.onerror = () => reject(new Error('Failed to load video'))
      video.src = URL.createObjectURL(input.file)
    })
  }

  private async extractFrames(
    video: HTMLVideoElement,
    totalFrames: number,
    fps: number,
  ): Promise<FrameData[]> {
    const frames: FrameData[] = []
    const sampleInterval = this.FRAME_SAMPLE_RATE
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    if (!ctx) return frames

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += sampleInterval) {
      const timestamp = frameIndex / fps
      video.currentTime = timestamp

      await new Promise<void>((res) => {
        video.onseeked = () => res()
      })

      ctx.drawImage(video, 0, 0)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

      frames.push(this.analyzeFrame(imageData, frameIndex, timestamp, canvas.width, canvas.height))
    }

    return frames
  }

  private analyzeFrame(
    imageData: ImageData,
    index: number,
    timestamp: number,
    width: number,
    height: number,
  ): FrameData {
    const data = imageData.data
    const histogram = new Array(256).fill(0)
    let luminanceSum = 0
    let luminanceSumSq = 0
    let edgeSum = 0
    const pixelCount = width * height

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b)

      histogram[luminance]++
      luminanceSum += luminance
      luminanceSumSq += luminance * luminance

      // Simple edge detection
      if (i + 4 < data.length) {
        const hGrad = Math.abs(
          luminance - (0.299 * data[i + 4] + 0.587 * data[i + 5] + 0.114 * data[i + 6]),
        )
        edgeSum += hGrad
      }
    }

    const luminanceMean = luminanceSum / pixelCount
    const luminanceVariance = luminanceSumSq / pixelCount - luminanceMean * luminanceMean

    return {
      index,
      timestamp,
      luminanceMean,
      luminanceVariance,
      colorHistogram: histogram,
      edgeDensity: edgeSum / pixelCount,
    }
  }

  private async extractAudioTrack(input: VideoInput): Promise<AudioTrackData> {
    const sampleRate = input.metadata?.sampleRate || 44100
    const duration = input.metadata?.duration || 0
    const channels = 2

    // Simplified - in production extract actual audio
    return {
      sampleRate,
      channels,
      duration,
      energy: new Array(100).fill(0.5),
      syncOffset: 0,
    }
  }

  // ── Frame-Level Artifacts ───────────────────────────────────────────────────

  private analyzeFrameArtifacts(data: VideoAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    regions: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const regions: AffectedRegion[] = []

    if (data.frames.length < 2) {
      return { signals, counterSignals, evidence, regions }
    }

    // Check for inter-frame artifacts
    const artifactFrames = this.detectInterFrameArtifacts(data.frames)
    if (artifactFrames.length > 0) {
      for (const frame of artifactFrames) {
        regions.push({
          id: `artifact-frame-${frame.index}`,
          label: `Frame artifact at ${frame.timestamp.toFixed(2)}s`,
          type: 'temporal',
          location: {
            type: 'frame_range',
            startSeconds: frame.timestamp,
            endSeconds: frame.timestamp + 1 / data.fps,
            frameIndex: frame.index,
            label: `Artifact score: ${frame.deviation.toFixed(2)}`,
          },
          severity: frame.deviation > 0.7 ? 'high' : 'medium',
          description: 'Frame shows unusual characteristics compared to neighbors',
        })
      }

      signals.push({
        name: 'Frame Artifacts',
        category: 'frame_artifact',
        value: Math.min(0.8, artifactFrames.length / 5),
        direction: 'supporting',
        severity: artifactFrames.length > 3 ? 'high' : 'medium',
        detail: `Found ${artifactFrames.length} frames with artifacts`,
      })
    }

    // Check for compression artifacts across frames
    const compressionScore = this.detectCompressionArtifacts(data.frames)
    if (compressionScore > 0.5) {
      signals.push({
        name: 'Compression Artifacts',
        category: 'frame_artifact',
        value: compressionScore,
        direction: 'supporting',
        severity: compressionScore > 0.7 ? 'high' : 'medium',
        detail: 'Inconsistent compression detected across frames',
      })
    }

    // Check for natural frame characteristics
    const naturalScore = this.assessNaturalFrameCharacteristics(data.frames)
    if (naturalScore > 0.6) {
      counterSignals.push({
        name: 'Natural Frame Characteristics',
        category: 'frame_artifact',
        value: naturalScore,
        direction: 'counter',
        severity: 'medium',
        detail: 'Frame characteristics appear natural',
      })
    }

    return { signals, counterSignals, evidence, regions }
  }

  private detectInterFrameArtifacts(frames: FrameData[]): Array<FrameData & { deviation: number }> {
    const artifacts: Array<FrameData & { deviation: number }> = []
    const windowSize = this.MOTION_WINDOW

    for (let i = windowSize; i < frames.length - windowSize; i++) {
      const before = frames.slice(i - windowSize, i)
      const after = frames.slice(i, i + windowSize)

      const beforeMean = before.reduce((a, f) => a + f.luminanceMean, 0) / before.length
      const afterMean = after.reduce((a, f) => a + f.luminanceMean, 0) / after.length

      const beforeVar = before.reduce((a, f) => a + f.luminanceVariance, 0) / before.length
      const afterVar = after.reduce((a, f) => a + f.luminanceVariance, 0) / after.length

      const meanDiff = Math.abs(beforeMean - afterMean) / 255
      const varDiff = Math.abs(beforeVar - afterVar) / (255 * 255)

      const deviation = meanDiff * 0.5 + varDiff * 0.5

      if (deviation > 0.3) {
        artifacts.push({ ...frames[i], deviation })
      }
    }

    return artifacts
  }

  private detectCompressionArtifacts(frames: FrameData[]): number {
    if (frames.length < 5) return 0

    const edgeDensities = frames.map((f) => f.edgeDensity)
    const mean = edgeDensities.reduce((a, b) => a + b, 0) / edgeDensities.length
    const variance =
      edgeDensities.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / edgeDensities.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

    return cv > 0.5 ? Math.min(1, cv) : 0
  }

  private assessNaturalFrameCharacteristics(frames: FrameData[]): number {
    if (frames.length < 5) return 0.5

    // Check for natural motion patterns
    const luminanceChanges: number[] = []
    for (let i = 1; i < frames.length; i++) {
      luminanceChanges.push(Math.abs(frames[i].luminanceMean - frames[i - 1].luminanceMean))
    }

    const meanChange = luminanceChanges.reduce((a, b) => a + b, 0) / luminanceChanges.length
    const variance =
      luminanceChanges.reduce((a, v) => a + Math.pow(v - meanChange, 2), 0) /
      luminanceChanges.length
    const cv = meanChange > 0 ? Math.sqrt(variance) / meanChange : 0

    // Natural video has moderate variation
    return cv > 0.3 && cv < 1.0 ? 0.7 : cv <= 0.3 ? 0.4 : 0.3
  }

  // ── Temporal Consistency ────────────────────────────────────────────────────

  private analyzeTemporalConsistency(data: VideoAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    segments: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const segments: AffectedRegion[] = []

    if (data.frames.length < 3) {
      return { signals, counterSignals, evidence, segments }
    }

    // Motion consistency analysis
    const motionConsistency = this.analyzeMotionConsistency(data.frames)
    if (motionConsistency.outliers.length > 0) {
      for (const outlier of motionConsistency.outliers) {
        const frame = data.frames[outlier.frameIndex]
        if (frame) {
          segments.push({
            id: `motion-outlier-${outlier.frameIndex}`,
            label: `Motion anomaly at ${frame.timestamp.toFixed(2)}s`,
            type: 'temporal',
            location: {
              type: 'frame_range',
              startSeconds: frame.timestamp,
              endSeconds: frame.timestamp + 1 / data.fps,
              frameIndex: outlier.frameIndex,
              label: `Deviation: ${outlier.deviation.toFixed(2)}`,
            },
            severity: outlier.deviation > 0.7 ? 'high' : 'medium',
            description: 'Unusual motion pattern detected',
          })
        }
      }

      signals.push({
        name: 'Motion Inconsistency',
        category: 'temporal_consistency',
        value: motionConsistency.score,
        direction: 'supporting',
        severity: motionConsistency.score > 0.6 ? 'high' : 'medium',
        detail: `Found ${motionConsistency.outliers.length} motion anomalies`,
      })
    } else {
      counterSignals.push({
        name: 'Consistent Motion',
        category: 'temporal_consistency',
        value: 0.6,
        direction: 'counter',
        severity: 'medium',
        detail: 'Motion patterns appear consistent',
      })
    }

    // Frame rate consistency
    const fpsConsistency = this.analyzeFPSConsistency(data)
    if (fpsConsistency < 0.8) {
      signals.push({
        name: 'Frame Rate Inconsistency',
        category: 'temporal_consistency',
        value: 1 - fpsConsistency,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Frame rate shows inconsistencies',
      })
    }

    return { signals, counterSignals, evidence, segments }
  }

  private analyzeMotionConsistency(frames: FrameData[]): MotionConsistency {
    const outliers: Array<{ frameIndex: number; deviation: number }> = []

    const luminanceChanges: number[] = []
    for (let i = 1; i < frames.length; i++) {
      luminanceChanges.push(Math.abs(frames[i].luminanceMean - frames[i - 1].luminanceMean))
    }

    const mean = luminanceChanges.reduce((a, b) => a + b, 0) / luminanceChanges.length
    const std = Math.sqrt(
      luminanceChanges.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / luminanceChanges.length,
    )

    for (let i = 0; i < luminanceChanges.length; i++) {
      const deviation = std > 0 ? Math.abs(luminanceChanges[i] - mean) / std : 0
      if (deviation > 2) {
        outliers.push({ frameIndex: i + 1, deviation })
      }
    }

    const score = outliers.length > 0 ? Math.min(0.8, outliers.length / (frames.length * 0.1)) : 0

    return { score, outliers }
  }

  private analyzeFPSConsistency(data: VideoAnalysisData): number {
    if (data.frames.length < 3) return 1

    const intervals: number[] = []
    for (let i = 1; i < data.frames.length; i++) {
      intervals.push(data.frames[i].timestamp - data.frames[i - 1].timestamp)
    }

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const variance = intervals.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / intervals.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

    return Math.max(0, 1 - cv * 5)
  }

  // ── Audio-Video Synchronization ─────────────────────────────────────────────

  private analyzeAudioVideoSync(data: VideoAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    segments: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const segments: AffectedRegion[] = []

    if (!data.audioTrack) {
      return { signals, counterSignals, evidence, segments }
    }

    // Check for sync offset
    const syncOffset = data.audioTrack.syncOffset
    if (Math.abs(syncOffset) > 0.1) {
      segments.push({
        id: 'sync-offset',
        label: 'A/V sync offset',
        type: 'temporal',
        location: {
          type: 'segment',
          startSeconds: 0,
          endSeconds: data.duration,
          label: `Offset: ${syncOffset.toFixed(3)}s`,
        },
        severity: Math.abs(syncOffset) > 0.5 ? 'high' : 'medium',
        description: `Audio-video sync offset of ${syncOffset.toFixed(3)} seconds detected`,
      })

      signals.push({
        name: 'A/V Sync Offset',
        category: 'sync',
        value: Math.min(0.8, Math.abs(syncOffset) * 2),
        direction: 'supporting',
        severity: Math.abs(syncOffset) > 0.5 ? 'high' : 'medium',
        detail: `Audio-video synchronization offset: ${syncOffset.toFixed(3)}s`,
      })
    } else {
      counterSignals.push({
        name: 'Good A/V Sync',
        category: 'sync',
        value: 0.5,
        direction: 'counter',
        severity: 'low',
        detail: 'Audio and video appear synchronized',
      })
    }

    // Check for lip-sync consistency if face detected
    const faceFrames = data.frames.filter((f) => f.faceRegion)
    if (faceFrames.length > 0 && data.audioTrack) {
      const lipSyncScore = this.estimateLipSyncConsistency(faceFrames, data.audioTrack)
      if (lipSyncScore < 0.5) {
        signals.push({
          name: 'Poor Lip Sync',
          category: 'sync',
          value: 1 - lipSyncScore,
          direction: 'supporting',
          severity: 'high',
          detail: 'Lip synchronization appears unnatural',
        })
      }
    }

    return { signals, counterSignals, evidence, segments }
  }

  private estimateLipSyncConsistency(faceFrames: FrameData[], audioTrack: AudioTrackData): number {
    // Simplified lip sync estimation
    // In production, this would analyze mouth region motion vs audio energy
    if (faceFrames.length < 5 || audioTrack.energy.length < 5) return 0.5

    const faceMotion = faceFrames.map((f) => f.luminanceMean)
    const audioEnergy = audioTrack.energy.slice(0, faceFrames.length)

    // Simple correlation
    const meanFace = faceMotion.reduce((a, b) => a + b, 0) / faceMotion.length
    const meanAudio = audioEnergy.reduce((a, b) => a + b, 0) / audioEnergy.length

    let correlation = 0
    let normFace = 0
    let normAudio = 0

    for (let i = 0; i < faceMotion.length; i++) {
      const df = faceMotion[i] - meanFace
      const da = audioEnergy[i] - meanAudio
      correlation += df * da
      normFace += df * df
      normAudio += da * da
    }

    const norm = Math.sqrt(normFace * normAudio)
    return norm > 0 ? Math.abs(correlation / norm) : 0.5
  }

  // ── Scene Consistency ───────────────────────────────────────────────────────

  private analyzeSceneConsistency(data: VideoAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    if (data.frames.length < 5) {
      return { signals, counterSignals, evidence }
    }

    // Detect scene changes
    const sceneChanges = this.detectSceneChanges(data.frames)
    if (sceneChanges.length > 0) {
      for (const scene of sceneChanges) {
        evidence.push({
          id: `scene-change-${scene.frameIndex}`,
          category: 'scene_inconsistency',
          description: `${scene.severity} change at ${scene.timestamp.toFixed(2)}s (confidence: ${scene.confidence.toFixed(2)})`,
          confidence: scene.confidence,
          location: {
            type: 'timestamp',
            startSeconds: scene.timestamp,
            endSeconds: scene.timestamp + 1 / data.fps,
          },
        })
      }

      // Check for suspicious scene changes (sudden cuts in deepfakes)
      const suddenCuts = sceneChanges.filter((s) => s.severity === 'cut' && s.confidence > 0.7)
      if (suddenCuts.length > 2) {
        signals.push({
          name: 'Frequent Scene Cuts',
          category: 'scene_consistency',
          value: Math.min(0.7, suddenCuts.length / 5),
          direction: 'supporting',
          severity: 'medium',
          detail: `Found ${suddenCuts.length} sudden scene cuts`,
        })
      }
    }

    // Check lighting consistency
    const lightingConsistency = this.analyzeLightingConsistency(data.frames)
    if (lightingConsistency < 0.5) {
      signals.push({
        name: 'Lighting Inconsistency',
        category: 'scene_consistency',
        value: 1 - lightingConsistency,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Lighting conditions change unnaturally',
      })
    } else if (lightingConsistency > 0.7) {
      counterSignals.push({
        name: 'Consistent Lighting',
        category: 'scene_consistency',
        value: lightingConsistency,
        direction: 'counter',
        severity: 'low',
        detail: 'Lighting appears consistent throughout',
      })
    }

    return { signals, counterSignals, evidence }
  }

  private detectSceneChanges(frames: FrameData[]): SceneChange[] {
    const changes: SceneChange[] = []
    const threshold = 0.3

    for (let i = 1; i < frames.length; i++) {
      const diff = Math.abs(frames[i].luminanceMean - frames[i - 1].luminanceMean) / 255
      const varDiff =
        Math.abs(frames[i].luminanceVariance - frames[i - 1].luminanceVariance) / (255 * 255)

      const totalDiff = diff * 0.6 + varDiff * 0.4

      if (totalDiff > threshold) {
        changes.push({
          frameIndex: i,
          timestamp: frames[i].timestamp,
          severity: totalDiff > 0.5 ? 'cut' : totalDiff > 0.3 ? 'dissolve' : 'fade',
          confidence: Math.min(1, totalDiff * 2),
        })
      }
    }

    return changes
  }

  private analyzeLightingConsistency(frames: FrameData[]): number {
    if (frames.length < 5) return 0.5

    const luminanceValues = frames.map((f) => f.luminanceMean)
    const mean = luminanceValues.reduce((a, b) => a + b, 0) / luminanceValues.length
    const variance =
      luminanceValues.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / luminanceValues.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

    // Natural lighting has some variation but not extreme
    return cv < 0.3 ? 0.8 : cv < 0.5 ? 0.6 : cv < 0.7 ? 0.4 : 0.2
  }

  // ── Metadata Analysis ──────────────────────────────────────────────────────

  private analyzeMetadata(
    metadata: VideoInput['metadata'],
    _input: VideoInput,
  ): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const metadataValues = metadata ?? {}

    // Check for editing software signatures
    const editingSoftware = ['Adobe Premiere', 'Final Cut', 'DaVinci', 'iMovie', 'CapCut']
    const metadataStr = JSON.stringify(metadataValues).toLowerCase()

    for (const software of editingSoftware) {
      if (metadataStr.includes(software.toLowerCase())) {
        signals.push({
          name: 'Editing Software Detected',
          category: 'metadata',
          value: 0.4,
          direction: 'supporting',
          severity: 'low',
          detail: `Video was edited with: ${software}`,
        })
        break
      }
    }

    // Check for deepfake-related markers
    for (const indicator of this.DEEPFAKE_INDICATORS) {
      if (metadataStr.includes(indicator)) {
        signals.push({
          name: 'Deepfake Indicator in Metadata',
          category: 'metadata',
          value: 0.9,
          direction: 'supporting',
          severity: 'high',
          detail: `Deepfake indicator "${indicator}" found in metadata`,
        })
        break
      }
    }

    // Check for creation info
    if (metadataValues.created) {
      counterSignals.push({
        name: 'Creation Date Present',
        category: 'metadata',
        value: 0.3,
        direction: 'counter',
        severity: 'low',
        detail: `Created: ${metadataValues.created}`,
      })
    }

    // Check codec
    if (metadataValues.codec) {
      evidence.push({
        id: `metadata-codec-${Date.now()}`,
        category: 'metadata_anomaly',
        description: `Video codec: ${metadataValues.codec}`,
        confidence: 0.3,
      })
    }

    return { signals, counterSignals, evidence }
  }

  // ── Facial/Visual Signals ───────────────────────────────────────────────────

  private analyzeFacialSignals(data: VideoAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    regions: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const regions: AffectedRegion[] = []

    const faceFrames = data.frames.filter((f) => f.faceRegion)

    if (faceFrames.length === 0) {
      return { signals, counterSignals, evidence, regions }
    }

    // Check for face consistency
    const faceConsistency = this.analyzeFaceConsistency(faceFrames)
    if (faceConsistency < 0.5) {
      signals.push({
        name: 'Face Inconsistency',
        category: 'facial',
        value: 1 - faceConsistency,
        direction: 'supporting',
        severity: 'high',
        detail: 'Facial features show inconsistency across frames',
      })

      // Add affected regions for inconsistent face frames
      for (const frame of faceFrames) {
        if (frame.faceRegion) {
          regions.push({
            id: `face-${frame.index}`,
            label: `Face at ${frame.timestamp.toFixed(2)}s`,
            type: 'spatial',
            location: {
              type: 'bounding_box',
              ...frame.faceRegion,
              label: `Face frame ${frame.index}`,
            },
            severity: 'medium',
            description: 'Face shows potential inconsistency',
          })
        }
      }
    } else {
      counterSignals.push({
        name: 'Consistent Face',
        category: 'facial',
        value: faceConsistency,
        direction: 'counter',
        severity: 'medium',
        detail: 'Facial features appear consistent',
      })
    }

    // Check for blinking patterns
    const blinkScore = this.analyzeBlinkPatterns(faceFrames)
    if (blinkScore < 0.3) {
      signals.push({
        name: 'Unnatural Blinking',
        category: 'facial',
        value: 0.6,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Blinking patterns appear unnatural',
      })
    } else if (blinkScore > 0.5) {
      counterSignals.push({
        name: 'Natural Blinking',
        category: 'facial',
        value: blinkScore,
        direction: 'counter',
        severity: 'medium',
        detail: 'Blinking patterns appear natural',
      })
    }

    return { signals, counterSignals, evidence, regions }
  }

  private analyzeFaceConsistency(faceFrames: FrameData[]): number {
    if (faceFrames.length < 3) return 0.5

    const faceSizes = faceFrames
      .map((f) => {
        if (!f.faceRegion) return 0
        return f.faceRegion.width * f.faceRegion.height
      })
      .filter((s) => s > 0)

    if (faceSizes.length < 3) return 0.5

    const mean = faceSizes.reduce((a, b) => a + b, 0) / faceSizes.length
    const variance = faceSizes.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / faceSizes.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

    return cv < 0.2 ? 0.8 : cv < 0.4 ? 0.6 : cv < 0.6 ? 0.4 : 0.2
  }

  private analyzeBlinkPatterns(faceFrames: FrameData[]): number {
    // Simplified blink detection based on face region changes
    if (faceFrames.length < 10) return 0.5

    const faceAreas = faceFrames.map((f) => {
      if (!f.faceRegion) return 0
      return f.faceRegion.width * f.faceRegion.height
    })

    // Look for periodic dips (potential blinks)
    let blinkCount = 0
    const mean = faceAreas.reduce((a, b) => a + b, 0) / faceAreas.length
    const threshold = mean * 0.85

    for (let i = 1; i < faceAreas.length - 1; i++) {
      if (
        faceAreas[i] < threshold &&
        faceAreas[i - 1] >= threshold &&
        faceAreas[i + 1] >= threshold
      ) {
        blinkCount++
      }
    }

    const blinksPerSecond = blinkCount / (faceFrames.length / 30)
    // Natural blinking is about 15-20 blinks per minute (0.25-0.33 per second)
    return blinksPerSecond > 0.15 && blinksPerSecond < 0.4
      ? 0.7
      : blinksPerSecond > 0.1 && blinksPerSecond < 0.5
        ? 0.5
        : 0.3
  }
}
