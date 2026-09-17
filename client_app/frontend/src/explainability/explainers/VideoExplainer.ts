import type {
  IVideoExplainer,
  ExplanationObject,
  VideoAnalysisResult,
  ExplanationSignalObject,
  EvidenceObject,
} from '../types'
import { ExplanationBuilder } from '../providers/ExplanationBuilder'
import { LocalizationProvider } from '../providers/LocalizationProvider'
import { EvidenceVisualizer } from '../providers/EvidenceVisualizer'

// ─── Video Explainer ─────────────────────────────────────────────────────────

export class VideoExplainer implements IVideoExplainer {
  private readonly builder: ExplanationBuilder
  private readonly localization: LocalizationProvider
  private readonly visualizer: EvidenceVisualizer

  constructor() {
    this.builder = new ExplanationBuilder()
    this.localization = new LocalizationProvider()
    this.visualizer = new EvidenceVisualizer()
  }

  async explainVideoAnalysis(
    analysisResult: VideoAnalysisResult,
    videoContent: VideoContent,
  ): Promise<ExplanationObject> {
    // Extract signals from analysis
    const signals = this.extractSignals(analysisResult)

    // Extract evidence
    const evidence = this.extractEvidence(analysisResult)

    // Localize signals temporally
    const { regions, segments } = await this.localization.localize(signals, videoContent, 'video')

    // Build explanation
    return this.builder.buildExplanation(
      signals,
      evidence,
      regions,
      segments,
      'video',
      analysisResult.verdict || 'UNCERTAIN',
      analysisResult.confidence || 0.5,
    )
  }

  // ── Signal Extraction ──────────────────────────────────────────────────────

  private extractSignals(analysisResult: VideoAnalysisResult): ExplanationSignalObject[] {
    const signals: ExplanationSignalObject[] = []

    // Frame-level artifact signals
    if (analysisResult.frame_analysis) {
      const frame = analysisResult.frame_analysis

      if (frame.artifacts_detected) {
        signals.push({
          id: `frame-artifacts-${Date.now()}`,
          name: 'Frame-Level Artifacts',
          score: frame.severity || 0.5,
          explanation: this.explainFrameArtifacts(frame),
          signal_type: 'manipulation',
          affected_region_ids: [],
        })
      }
    }

    // Temporal consistency signals
    if (analysisResult.temporal_consistency) {
      const temporal = analysisResult.temporal_consistency

      if (temporal.motion_inconsistencies && temporal.motion_inconsistencies.length > 0) {
        signals.push({
          id: `motion-inconsistency-${Date.now()}`,
          name: 'Motion Inconsistencies',
          score: temporal.inconsistency_score || 0.6,
          explanation: `Found ${temporal.motion_inconsistencies.length} motion inconsistency(ies) across frames`,
          signal_type: 'temporal_anomaly',
          affected_region_ids: [],
        })
      }

      if (temporal.fps_anomalies && temporal.fps_anomalies.length > 0) {
        signals.push({
          id: `fps-anomaly-${Date.now()}`,
          name: 'Frame Rate Anomalies',
          score: 0.5,
          explanation: `Detected ${temporal.fps_anomalies.length} frame rate anomaly(ies)`,
          signal_type: 'temporal_anomaly',
          affected_region_ids: [],
        })
      }
    }

    // Scene consistency signals
    if (analysisResult.scene_consistency) {
      const scene = analysisResult.scene_consistency

      if (scene.inconsistent_cuts && scene.inconsistent_cuts.length > 0) {
        signals.push({
          id: `inconsistent-cuts-${Date.now()}`,
          name: 'Inconsistent Scene Cuts',
          score: scene.cut_anomaly_score || 0.5,
          explanation: `Detected ${scene.inconsistent_cuts.length} inconsistent scene cut(s)`,
          signal_type: 'temporal_anomaly',
          affected_region_ids: [],
        })
      }

      if (scene.lighting_inconsistencies && scene.lighting_inconsistencies.length > 0) {
        signals.push({
          id: `lighting-inconsistency-${Date.now()}`,
          name: 'Lighting Inconsistencies',
          score: 0.6,
          explanation: `Found ${scene.lighting_inconsistencies.length} lighting inconsistency(ies) between scenes`,
          signal_type: 'temporal_anomaly',
          affected_region_ids: [],
        })
      }
    }

    // Audio-visual sync signals
    if (analysisResult.audio_video_sync) {
      const sync = analysisResult.audio_video_sync

      if (sync.desync_detected) {
        signals.push({
          id: `desync-${Date.now()}`,
          name: 'Audio-Visual Desynchronization',
          score: sync.severity || 0.5,
          explanation: `Audio-visual desynchronization detected (severity: ${(sync.severity || 0.5) * 100}%)`,
          signal_type: 'temporal_anomaly',
          affected_region_ids: [],
        })
      }
    }

    // Facial consistency signals
    if (analysisResult.facial_analysis) {
      const facial = analysisResult.facial_analysis

      if (facial.inconsistencies && facial.inconsistencies.length > 0) {
        signals.push({
          id: `facial-inconsistency-${Date.now()}`,
          name: 'Facial Inconsistencies',
          score: facial.severity || 0.6,
          explanation: `Found ${facial.inconsistencies.length} facial inconsistency(ies) across frames`,
          signal_type: 'manipulation',
          affected_region_ids: [],
        })
      }

      if (facial.blinking_anomalies) {
        signals.push({
          id: `blinking-anomaly-${Date.now()}`,
          name: 'Blinking Pattern Anomalies',
          score: 0.5,
          explanation: 'Detected unnatural blinking patterns',
          signal_type: 'manipulation',
          affected_region_ids: [],
        })
      }
    }

    // Deepfake indicators
    if (analysisResult.deepfake_indicators) {
      const deepfake = analysisResult.deepfake_indicators

      if (deepfake.detected) {
        signals.push({
          id: `deepfake-${Date.now()}`,
          name: 'Deepfake Indicators',
          score: deepfake.confidence || 0.7,
          explanation: this.explainDeepfakeIndicators(deepfake),
          signal_type: 'ai_generation',
          affected_region_ids: [],
        })
      }
    }

    // Metadata signals
    if (analysisResult.metadata) {
      const metadata = analysisResult.metadata

      if (metadata.deepfake_tools && metadata.deepfake_tools.length > 0) {
        signals.push({
          id: `deepfake-tools-${Date.now()}`,
          name: 'Deepfake Tool Signatures',
          score: 0.8,
          explanation: `Detected signatures of deepfake tools: ${metadata.deepfake_tools.join(', ')}`,
          signal_type: 'ai_generation',
          affected_region_ids: [],
        })
      }

      if (metadata.inconsistencies && metadata.inconsistencies.length > 0) {
        signals.push({
          id: `metadata-inconsistency-${Date.now()}`,
          name: 'Video Metadata Inconsistencies',
          score: 0.5,
          explanation: `Found ${metadata.inconsistencies.length} metadata inconsistency(ies)`,
          signal_type: 'metadata_anomaly',
          affected_region_ids: [],
        })
      }
    }

    return signals
  }

  private explainFrameArtifacts(frame: {
    artifacts_detected: boolean
    severity?: number
    artifact_types?: string[]
    affected_frames?: number[]
  }): string {
    const types = frame.artifact_types || ['unknown']
    const severity = frame.severity || 0.5
    const frameCount = frame.affected_frames?.length || 0

    return `Frame-level artifacts detected (${types.join(', ')}). Severity: ${(severity * 100).toFixed(0)}%. ${
      frameCount > 0 ? `${frameCount} frame(s) affected.` : ''
    }`
  }

  private explainDeepfakeIndicators(deepfake: {
    detected: boolean
    confidence?: number
    indicators?: string[]
    face_swap_score?: number
    reenactment_score?: number
  }): string {
    const indicators = deepfake.indicators || []
    const scores: string[] = []

    if (deepfake.face_swap_score !== undefined) {
      scores.push(`face swap: ${(deepfake.face_swap_score * 100).toFixed(0)}%`)
    }
    if (deepfake.reenactment_score !== undefined) {
      scores.push(`reenactment: ${(deepfake.reenactment_score * 100).toFixed(0)}%`)
    }

    return `Deepfake indicators detected with ${(deepfake.confidence || 0.7) * 100}% confidence. ${
      indicators.length > 0 ? `Indicators: ${indicators.join(', ')}.` : ''
    } ${scores.length > 0 ? `Scores - ${scores.join(', ')}.` : ''}`
  }

  // ── Evidence Extraction ────────────────────────────────────────────────────

  private extractEvidence(analysisResult: VideoAnalysisResult): EvidenceObject[] {
    const evidence: EvidenceObject[] = []

    // Frame-level evidence
    if (analysisResult.frame_analysis?.affected_frames) {
      for (const frame of analysisResult.frame_analysis.affected_frames) {
        evidence.push({
          id: `frame-evidence-${frame.frame_number}`,
          type: 'video_frame',
          content: `Frame ${frame.frame_number}`,
          description: frame.description || `Artifact detected in frame ${frame.frame_number}`,
          confidence: frame.severity || 0.5,
          location: {
            start_time: frame.frame_number / (analysisResult.frame_analysis.fps || 30),
            end_time: (frame.frame_number + 1) / (analysisResult.frame_analysis.fps || 30),
          },
        })
      }
    }

    // Temporal inconsistency evidence
    if (analysisResult.temporal_consistency?.motion_inconsistencies) {
      for (const motion of analysisResult.temporal_consistency.motion_inconsistencies) {
        evidence.push({
          id: `motion-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'temporal_pattern',
          content: 'Motion inconsistency',
          description: motion.description || 'Inconsistent motion detected between frames',
          confidence: motion.confidence || 0.5,
          location: {
            start_time: motion.start_time || 0,
            end_time: motion.end_time || motion.start_time || 0 + 1,
          },
        })
      }
    }

    // Scene cut evidence
    if (analysisResult.scene_consistency?.inconsistent_cuts) {
      for (const cut of analysisResult.scene_consistency.inconsistent_cuts) {
        evidence.push({
          id: `cut-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'video_frame',
          content: 'Inconsistent scene cut',
          description: cut.description || 'Scene cut with inconsistent characteristics',
          confidence: cut.confidence || 0.5,
          location: {
            start_time: cut.time || 0,
            end_time: (cut.time || 0) + 0.5,
          },
        })
      }
    }

    // Audio-visual sync evidence
    if (analysisResult.audio_video_sync?.desync_detected) {
      const sync = analysisResult.audio_video_sync
      evidence.push({
        id: `sync-evidence-${Date.now()}`,
        type: 'temporal_pattern',
        content: 'Audio-visual desynchronization',
        description:
          sync.description || `Desync detected with ${(sync.severity || 0.5) * 100}% severity`,
        confidence: sync.severity || 0.5,
        location: {
          start_time: sync.start_time || 0,
          end_time: sync.end_time || 0,
        },
      })
    }

    // Facial evidence
    if (analysisResult.facial_analysis?.inconsistencies) {
      for (const facial of analysisResult.facial_analysis.inconsistencies) {
        evidence.push({
          id: `facial-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'video_frame',
          content: 'Facial inconsistency',
          description: facial.description || 'Inconsistent facial features detected',
          confidence: facial.confidence || 0.5,
          location: {
            start_time: facial.start_time || 0,
            end_time: facial.end_time || facial.start_time || 0 + 1,
          },
        })
      }
    }

    return evidence
  }
}

// ─── Video Content Type ──────────────────────────────────────────────────────

interface VideoContent {
  duration: number
  fps: number
  width: number
  height: number
}

// ─── Video Analysis Result Type ──────────────────────────────────────────────

interface VideoAnalysisResult {
  verdict?: string
  confidence?: number
  frame_analysis?: {
    artifacts_detected: boolean
    severity?: number
    artifact_types?: string[]
    affected_frames?: Array<{
      frame_number: number
      severity?: number
      description?: string
    }>
    fps?: number
  }
  temporal_consistency?: {
    motion_inconsistencies?: Array<{
      start_time: number
      end_time: number
      confidence?: number
      description?: string
    }>
    fps_anomalies?: Array<{
      time: number
      expected_fps: number
      actual_fps: number
    }>
    inconsistency_score?: number
  }
  scene_consistency?: {
    inconsistent_cuts?: Array<{
      time: number
      confidence?: number
      description?: string
    }>
    lighting_inconsistencies?: Array<{
      start_time: number
      end_time: number
      description?: string
    }>
    cut_anomaly_score?: number
  }
  audio_video_sync?: {
    desync_detected: boolean
    severity?: number
    start_time?: number
    end_time?: number
    description?: string
  }
  facial_analysis?: {
    inconsistencies?: Array<{
      start_time: number
      end_time: number
      confidence?: number
      description?: string
    }>
    blinking_anomalies?: boolean
    severity?: number
  }
  deepfake_indicators?: {
    detected: boolean
    confidence?: number
    indicators?: string[]
    face_swap_score?: number
    reenactment_score?: number
  }
  metadata?: {
    deepfake_tools?: string[]
    inconsistencies?: string[]
  }
}
