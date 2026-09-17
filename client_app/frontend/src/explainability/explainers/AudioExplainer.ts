import type {
  IAudioExplainer,
  ExplanationObject,
  ExplanationSignalObject,
  EvidenceObject,
} from '../types'
import { ExplanationBuilder } from '../providers/ExplanationBuilder'
import { LocalizationProvider } from '../providers/LocalizationProvider'

// ─── Audio Explainer ─────────────────────────────────────────────────────────

export class AudioExplainer implements IAudioExplainer {
  private readonly builder: ExplanationBuilder
  private readonly localization: LocalizationProvider

  constructor() {
    this.builder = new ExplanationBuilder()
    this.localization = new LocalizationProvider()
  }

  async explainAudioAnalysis(
    analysisResult: AudioAnalysisResult,
    audioContent: AudioContent,
  ): Promise<ExplanationObject> {
    // Extract signals from analysis
    const signals = this.extractSignals(analysisResult)

    // Extract evidence
    const evidence = this.extractEvidence(analysisResult)

    // Localize signals temporally
    const { regions, segments } = await this.localization.localize(signals, audioContent, 'audio')

    // Build explanation
    return this.builder.buildExplanation(
      signals,
      evidence,
      regions,
      segments,
      'audio',
      analysisResult.verdict || 'UNCERTAIN',
      analysisResult.confidence || 0.5,
    )
  }

  // ── Signal Extraction ──────────────────────────────────────────────────────

  private extractSignals(analysisResult: AudioAnalysisResult): ExplanationSignalObject[] {
    const signals: ExplanationSignalObject[] = []

    // Spectral analysis signals
    if (analysisResult.spectral_analysis) {
      const spectral = analysisResult.spectral_analysis

      if (spectral.anomalies && spectral.anomalies.length > 0) {
        signals.push({
          id: `spectral-anomaly-${Date.now()}`,
          name: 'Spectral Anomalies',
          score: spectral.anomaly_severity || 0.5,
          explanation: this.explainSpectralAnomalies(spectral),
          signal_type: 'acoustic_artifact',
          affected_region_ids: [],
        })
      }
    }

    // Acoustic artifact signals
    if (analysisResult.acoustic_artifacts) {
      const artifacts = analysisResult.acoustic_artifacts

      if (artifacts.phase_inconsistencies && artifacts.phase_inconsistencies.length > 0) {
        signals.push({
          id: `phase-inconsistency-${Date.now()}`,
          name: 'Phase Inconsistencies',
          score: 0.6,
          explanation: `Found ${artifacts.phase_inconsistencies.length} phase inconsistency(ies)`,
          signal_type: 'acoustic_artifact',
          affected_region_ids: [],
        })
      }

      if (artifacts.quantization_noise !== undefined && artifacts.quantization_noise > 0.5) {
        signals.push({
          id: `quantization-noise-${Date.now()}`,
          name: 'Quantization Noise',
          score: artifacts.quantization_noise,
          explanation: `Quantization noise detected at ${(artifacts.quantization_noise * 100).toFixed(1)}% level`,
          signal_type: 'acoustic_artifact',
          affected_region_ids: [],
        })
      }

      if (artifacts.breathing_patterns?.detected === false) {
        signals.push({
          id: `missing-breathing-${Date.now()}`,
          name: 'Missing Natural Breathing',
          score: 0.5,
          explanation: 'No natural breathing patterns detected, which may indicate synthesis',
          signal_type: 'ai_generation',
          affected_region_ids: [],
        })
      }

      if (artifacts.room_acoustics?.inconsistent) {
        signals.push({
          id: `room-acoustics-${Date.now()}`,
          name: 'Inconsistent Room Acoustics',
          score: artifacts.room_acoustics.severity || 0.5,
          explanation: this.explainRoomAcoustics(artifacts.room_acoustics),
          signal_type: 'acoustic_artifact',
          affected_region_ids: [],
        })
      }
    }

    // Speech consistency signals
    if (analysisResult.speech_consistency) {
      const speech = analysisResult.speech_consistency

      if (speech.pitch_inconsistencies && speech.pitch_inconsistencies.length > 0) {
        signals.push({
          id: `pitch-inconsistency-${Date.now()}`,
          name: 'Pitch Inconsistencies',
          score: speech.pitch_severity || 0.5,
          explanation: `Found ${speech.pitch_inconsistencies.length} pitch inconsistency(ies)`,
          signal_type: 'acoustic_artifact',
          affected_region_ids: [],
        })
      }

      if (speech.rhythm_anomalies && speech.rhythm_anomalies.length > 0) {
        signals.push({
          id: `rhythm-anomaly-${Date.now()}`,
          name: 'Speech Rhythm Anomalies',
          score: 0.5,
          explanation: `Detected ${speech.rhythm_anomalies.length} rhythm anomaly(ies)`,
          signal_type: 'acoustic_artifact',
          affected_region_ids: [],
        })
      }

      if (speech.naturalness_score !== undefined && speech.naturalness_score < 0.6) {
        signals.push({
          id: `low-naturalness-${Date.now()}`,
          name: 'Low Speech Naturalness',
          score: 1 - speech.naturalness_score,
          explanation: `Speech naturalness score: ${(speech.naturalness_score * 100).toFixed(1)}%`,
          signal_type: 'ai_generation',
          affected_region_ids: [],
        })
      }
    }

    // Temporal anomaly signals
    if (analysisResult.temporal_anomalies) {
      const temporal = analysisResult.temporal_anomalies

      if (temporal.silence_gaps && temporal.silence_gaps.length > 0) {
        signals.push({
          id: `silence-gaps-${Date.now()}`,
          name: 'Unnatural Silence Gaps',
          score: temporal.gap_severity || 0.5,
          explanation: `Found ${temporal.silence_gaps.length} unnatural silence gap(s)`,
          signal_type: 'temporal_anomaly',
          affected_region_ids: [],
        })
      }

      if (temporal.discontinuities && temporal.discontinuities.length > 0) {
        signals.push({
          id: `discontinuities-${Date.now()}`,
          name: 'Audio Discontinuities',
          score: 0.6,
          explanation: `Detected ${temporal.discontinuities.length} audio discontinuity(ies)`,
          signal_type: 'temporal_anomaly',
          affected_region_ids: [],
        })
      }
    }

    // Model-based signals
    if (analysisResult.model_signals) {
      const models = analysisResult.model_signals

      for (const modelSignal of models) {
        if (modelSignal.detected) {
          signals.push({
            id: `model-${modelSignal.model_name}-${Date.now()}`,
            name: `${modelSignal.model_name} Detection`,
            score: modelSignal.confidence,
            explanation: this.explainModelSignal(modelSignal),
            signal_type: 'ai_generation',
            affected_region_ids: [],
          })
        }
      }
    }

    // Metadata signals
    if (analysisResult.metadata) {
      const metadata = analysisResult.metadata

      if (metadata.synthesis_tools && metadata.synthesis_tools.length > 0) {
        signals.push({
          id: `synthesis-tools-${Date.now()}`,
          name: 'Synthesis Tool Signatures',
          score: 0.8,
          explanation: `Detected signatures of synthesis tools: ${metadata.synthesis_tools.join(', ')}`,
          signal_type: 'ai_generation',
          affected_region_ids: [],
        })
      }

      if (metadata.inconsistencies && metadata.inconsistencies.length > 0) {
        signals.push({
          id: `metadata-inconsistency-${Date.now()}`,
          name: 'Audio Metadata Inconsistencies',
          score: 0.5,
          explanation: `Found ${metadata.inconsistencies.length} metadata inconsistency(ies)`,
          signal_type: 'metadata_anomaly',
          affected_region_ids: [],
        })
      }
    }

    return signals
  }

  private explainSpectralAnomalies(spectral: {
    anomalies: string[]
    anomaly_severity?: number
    frequency_ranges?: Array<{ start: number; end: number }>
  }): string {
    const severity = spectral.anomaly_severity || 0.5
    const ranges = spectral.frequency_ranges || []

    return `Spectral anomalies detected (${spectral.anomalies.join(', ')}). Severity: ${(severity * 100).toFixed(0)}%. ${
      ranges.length > 0
        ? `Affected frequency ranges: ${ranges.map((r) => `${r.start}-${r.end} Hz`).join(', ')}.`
        : ''
    }`
  }

  private explainRoomAcoustics(acoustics: {
    inconsistent: boolean
    severity?: number
    description?: string
  }): string {
    return (
      acoustics.description ||
      `Inconsistent room acoustics detected (severity: ${(acoustics.severity || 0.5) * 100}%). This may indicate audio splicing or synthesis.`
    )
  }

  private explainModelSignal(modelSignal: {
    model_name: string
    confidence: number
    features?: string[]
  }): string {
    const features = modelSignal.features || []

    return `${modelSignal.model_name} patterns detected with ${(modelSignal.confidence * 100).toFixed(1)}% confidence. ${
      features.length > 0 ? `Key features: ${features.join(', ')}.` : ''
    }`
  }

  // ── Evidence Extraction ────────────────────────────────────────────────────

  private extractEvidence(analysisResult: AudioAnalysisResult): EvidenceObject[] {
    const evidence: EvidenceObject[] = []

    // Spectral evidence
    if (analysisResult.spectral_analysis?.anomalies) {
      for (let i = 0; i < analysisResult.spectral_analysis.anomalies.length; i++) {
        const anomaly = analysisResult.spectral_analysis.anomalies[i]
        evidence.push({
          id: `spectral-evidence-${Date.now()}-${i}`,
          type: 'spectral_pattern',
          content: anomaly,
          description: `Spectral anomaly: ${anomaly}`,
          confidence: analysisResult.spectral_analysis.anomaly_severity || 0.5,
        })
      }
    }

    // Acoustic artifact evidence
    if (analysisResult.acoustic_artifacts?.phase_inconsistencies) {
      for (const phase of analysisResult.acoustic_artifacts.phase_inconsistencies) {
        evidence.push({
          id: `phase-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'acoustic_pattern',
          content: 'Phase inconsistency',
          description: phase.description || 'Inconsistent phase detected',
          confidence: phase.confidence || 0.5,
          location: {
            start_time: phase.start_time || 0,
            end_time: phase.end_time || phase.start_time || 0 + 1,
          },
        })
      }
    }

    // Speech consistency evidence
    if (analysisResult.speech_consistency?.pitch_inconsistencies) {
      for (const pitch of analysisResult.speech_consistency.pitch_inconsistencies) {
        evidence.push({
          id: `pitch-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'acoustic_pattern',
          content: 'Pitch inconsistency',
          description: pitch.description || 'Inconsistent pitch detected',
          confidence: pitch.confidence || 0.5,
          location: {
            start_time: pitch.start_time || 0,
            end_time: pitch.end_time || pitch.start_time || 0 + 1,
          },
        })
      }
    }

    // Temporal evidence
    if (analysisResult.temporal_anomalies?.silence_gaps) {
      for (const gap of analysisResult.temporal_anomalies.silence_gaps) {
        evidence.push({
          id: `silence-evidence-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'temporal_pattern',
          content: 'Unnatural silence gap',
          description: gap.description || `Unnatural silence at ${gap.start_time}s`,
          confidence: gap.confidence || 0.5,
          location: {
            start_time: gap.start_time || 0,
            end_time: gap.end_time || gap.start_time || 0 + 1,
          },
        })
      }
    }

    // Model evidence
    if (analysisResult.model_signals) {
      for (const model of analysisResult.model_signals) {
        if (model.detected) {
          evidence.push({
            id: `model-evidence-${model.model_name}-${Date.now()}`,
            type: 'feature_vector',
            content: `${model.model_name} detection`,
            description: `Model ${model.model_name} detected with ${(model.confidence * 100).toFixed(1)}% confidence`,
            confidence: model.confidence,
          })
        }
      }
    }

    return evidence
  }
}

// ─── Audio Content Type ──────────────────────────────────────────────────────

interface AudioContent {
  duration: number
  sampleRate: number
  channels: number
}

// ─── Audio Analysis Result Type ──────────────────────────────────────────────

interface AudioAnalysisResult {
  verdict?: string
  confidence?: number
  spectral_analysis?: {
    anomalies: string[]
    anomaly_severity?: number
    frequency_ranges?: Array<{ start: number; end: number }>
  }
  acoustic_artifacts?: {
    phase_inconsistencies?: Array<{
      start_time: number
      end_time: number
      confidence?: number
      description?: string
    }>
    quantization_noise?: number
    breathing_patterns?: {
      detected: boolean
      count?: number
      naturalness?: number
    }
    room_acoustics?: {
      inconsistent: boolean
      severity?: number
      description?: string
    }
  }
  speech_consistency?: {
    pitch_inconsistencies?: Array<{
      start_time: number
      end_time: number
      confidence?: number
      description?: string
    }>
    rhythm_anomalies?: Array<{
      time: number
      type: string
      severity?: number
    }>
    pitch_severity?: number
    naturalness_score?: number
  }
  temporal_anomalies?: {
    silence_gaps?: Array<{
      start_time: number
      end_time: number
      confidence?: number
      description?: string
    }>
    discontinuities?: Array<{
      time: number
      type: string
      severity?: number
    }>
    gap_severity?: number
  }
  model_signals?: Array<{
    model_name: string
    detected: boolean
    confidence: number
    features?: string[]
  }>
  metadata?: {
    synthesis_tools?: string[]
    inconsistencies?: string[]
  }
}
