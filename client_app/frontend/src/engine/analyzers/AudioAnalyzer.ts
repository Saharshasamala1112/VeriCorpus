import type {
  ModalityAnalyzer,
  AudioInput,
  ModalityAnalysisResult,
  ModalitySignal,
  EvidenceItem,
  AffectedRegion,
} from '../types'

// ─── Audio Feature Types ─────────────────────────────────────────────────────

interface AudioAnalysisData {
  sampleRate: number
  channels: number
  duration: number
  samples: Float32Array
  spectralData?: Float32Array
  mfccFeatures?: number[]
  zeroCrossingRate?: number[]
  energy?: number[]
  pitchContour?: number[]
}

// ─── Audio Analyzer ──────────────────────────────────────────────────────────

export class AudioAnalyzer implements ModalityAnalyzer<AudioInput> {
  modality = 'audio' as const

  private readonly SYNTHESIS_MARKERS = [
    'AI-generated',
    'Text-to-Speech',
    'TTS',
    'DeepVoice',
    'WaveNet',
    'Tacotron',
    'VITS',
    'Bark',
    'ElevenLabs',
    'Murf',
    'PlayHT',
    'Resemble',
  ]

  async analyze(input: AudioInput): Promise<ModalityAnalysisResult> {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const affectedRegions: AffectedRegion[] = []
    const affectedSegments: AffectedRegion[] = []
    const limitations: string[] = []

    try {
      const audioData = await this.extractAudioData(input)
      const metadata = input.metadata || {}

      // ── Spectral Characteristics ──────────────────────────────────────────
      const spectralSignals = this.analyzeSpectralCharacteristics(audioData)
      signals.push(...spectralSignals.signals)
      counterSignals.push(...spectralSignals.counterSignals)
      evidence.push(...spectralSignals.evidence)
      affectedSegments.push(...spectralSignals.segments)

      // ── Acoustic Artifacts ────────────────────────────────────────────────
      const acousticSignals = this.analyzeAcousticArtifacts(audioData)
      signals.push(...acousticSignals.signals)
      counterSignals.push(...acousticSignals.counterSignals)
      evidence.push(...acousticSignals.evidence)
      affectedSegments.push(...acousticSignals.segments)

      // ── Speech Consistency ────────────────────────────────────────────────
      const speechSignals = this.analyzeSpeechConsistency(audioData)
      signals.push(...speechSignals.signals)
      counterSignals.push(...speechSignals.counterSignals)
      evidence.push(...speechSignals.evidence)

      // ── Temporal Anomalies ────────────────────────────────────────────────
      const temporalSignals = this.analyzeTemporalAnomalies(audioData)
      signals.push(...temporalSignals.signals)
      counterSignals.push(...temporalSignals.counterSignals)
      evidence.push(...temporalSignals.evidence)
      affectedSegments.push(...temporalSignals.segments)

      // ── Metadata Analysis ─────────────────────────────────────────────────
      const metadataSignals = this.analyzeMetadata(metadata, input)
      signals.push(...metadataSignals.signals)
      counterSignals.push(...metadataSignals.counterSignals)
      evidence.push(...metadataSignals.evidence)

      // ── Model-Based Signals ───────────────────────────────────────────────
      const modelSignals = this.analyzeModelBasedSignals(audioData)
      signals.push(...modelSignals.signals)
      counterSignals.push(...modelSignals.counterSignals)
      evidence.push(...modelSignals.evidence)

      const resultMetadata: Record<string, unknown> = {
        sampleRate: audioData.sampleRate,
        channels: audioData.channels,
        duration: audioData.duration,
        totalSamples: audioData.samples.length,
        hasSpectralData: !!audioData.spectralData,
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
        `Audio analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`,
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

  // ── Audio Data Extraction ───────────────────────────────────────────────────

  private async extractAudioData(input: AudioInput): Promise<AudioAnalysisData> {
    if (!input.file) {
      throw new Error('No audio file available for analysis')
    }

    const audioContext = new AudioContext()
    try {
      const arrayBuffer = await input.file.arrayBuffer()
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

      const samples = audioBuffer.getChannelData(0)
      const sampleRate = audioBuffer.sampleRate
      const channels = audioBuffer.numberOfChannels
      const duration = audioBuffer.duration

      // Compute basic features
      const zeroCrossingRate = this.computeZeroCrossingRate(samples)
      const energy = this.computeEnergy(samples)
      const pitchContour = this.estimatePitch(samples, sampleRate)

      // Compute spectral features
      const spectralData = this.computeFFT(samples)

      return {
        sampleRate,
        channels,
        duration,
        samples,
        spectralData,
        zeroCrossingRate,
        energy,
        pitchContour,
      }
    } finally {
      await audioContext.close()
    }
  }

  private computeZeroCrossingRate(samples: Float32Array): number[] {
    const frameSize = 2048
    const hopSize = 512
    const zcr: number[] = []

    for (let i = 0; i < samples.length - frameSize; i += hopSize) {
      let crossings = 0
      for (let j = 1; j < frameSize; j++) {
        if (samples[i + j] >= 0 !== samples[i + j - 1] >= 0) {
          crossings++
        }
      }
      zcr.push(crossings / frameSize)
    }

    return zcr
  }

  private computeEnergy(samples: Float32Array): number[] {
    const frameSize = 2048
    const hopSize = 512
    const energy: number[] = []

    for (let i = 0; i < samples.length - frameSize; i += hopSize) {
      let sum = 0
      for (let j = 0; j < frameSize; j++) {
        sum += samples[i + j] * samples[i + j]
      }
      energy.push(sum / frameSize)
    }

    return energy
  }

  private estimatePitch(samples: Float32Array, sampleRate: number): number[] {
    const frameSize = 2048
    const hopSize = 512
    const pitch: number[] = []
    const minLag = Math.floor(sampleRate / 500)
    const maxLag = Math.floor(sampleRate / 50)

    for (let i = 0; i < samples.length - frameSize; i += hopSize) {
      let bestCorr = 0
      let bestLag = 0

      for (let lag = minLag; lag < maxLag && lag < frameSize; lag++) {
        let corr = 0
        let norm1 = 0
        let norm2 = 0
        for (let j = 0; j < frameSize - lag; j++) {
          corr += samples[i + j] * samples[i + j + lag]
          norm1 += samples[i + j] * samples[i + j]
          norm2 += samples[i + j + lag] * samples[i + j + lag]
        }
        const norm = Math.sqrt(norm1 * norm2)
        if (norm > 0) {
          corr /= norm
          if (corr > bestCorr) {
            bestCorr = corr
            bestLag = lag
          }
        }
      }

      pitch.push(bestLag > 0 ? sampleRate / bestLag : 0)
    }

    return pitch
  }

  private computeFFT(samples: Float32Array): Float32Array {
    // Simplified FFT - in production use Web Audio API AnalyserNode
    const n = Math.min(samples.length, 4096)
    const result = new Float32Array(n / 2)

    for (let k = 0; k < n / 2; k++) {
      let real = 0
      let imag = 0
      for (let i = 0; i < n; i++) {
        const angle = (2 * Math.PI * k * i) / n
        real += samples[i] * Math.cos(angle)
        imag -= samples[i] * Math.sin(angle)
      }
      result[k] = Math.sqrt(real * real + imag * imag) / n
    }

    return result
  }

  // ── Spectral Characteristics ────────────────────────────────────────────────

  private analyzeSpectralCharacteristics(data: AudioAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    segments: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const segments: AffectedRegion[] = []

    if (!data.spectralData) {
      return { signals, counterSignals, evidence, segments }
    }

    // Spectral centroid analysis
    const spectralCentroid = this.computeSpectralCentroid(data.spectralData, data.sampleRate)
    const centroidVar = this.calculateVariance(spectralCentroid)

    // Check for unnatural spectral characteristics
    if (centroidVar < 0.1 && data.duration > 5) {
      signals.push({
        name: 'Uniform Spectral Centroid',
        category: 'spectral',
        value: 0.5,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Spectral centroid shows unusual uniformity over time',
      })
    }

    // Check for frequency cutoff (common in synthesized audio)
    const cutoffScore = this.detectFrequencyCutoff(data.spectralData)
    if (cutoffScore > 0.6) {
      signals.push({
        name: 'Frequency Cutoff',
        category: 'spectral',
        value: cutoffScore,
        direction: 'supporting',
        severity: 'high',
        detail: 'Unusual frequency cutoff detected, suggesting band-limited synthesis',
      })
    }

    // Check for spectral flatness (noise vs tonal)
    const flatness = this.computeSpectralFlatness(data.spectralData)
    const flatnessMean = flatness.reduce((a, b) => a + b, 0) / flatness.length

    if (flatnessMean > 0.7) {
      counterSignals.push({
        name: 'Natural Spectral Variation',
        category: 'spectral',
        value: 0.6,
        direction: 'counter',
        severity: 'medium',
        detail: 'Spectral characteristics show natural variation',
      })
    }

    // Check for harmonics
    const harmonicsScore = this.detectHarmonicStructure(data.spectralData, data.sampleRate)
    if (harmonicsScore > 0.5) {
      evidence.push({
        id: `spectral-harmonics-${Date.now()}`,
        category: 'spectral_anomaly',
        description: `Harmonic structure score: ${harmonicsScore.toFixed(2)}`,
        confidence: harmonicsScore,
      })
    }

    return { signals, counterSignals, evidence, segments }
  }

  private computeSpectralCentroid(spectrum: Float32Array, sampleRate: number): number[] {
    const frameSize = 512
    const centroids: number[] = []

    for (let i = 0; i < spectrum.length - frameSize; i += frameSize / 2) {
      let weightedSum = 0
      let totalMagnitude = 0
      for (let j = 0; j < frameSize; j++) {
        const freq = (j * sampleRate) / (2 * frameSize)
        weightedSum += freq * spectrum[i + j]
        totalMagnitude += spectrum[i + j]
      }
      centroids.push(totalMagnitude > 0 ? weightedSum / totalMagnitude : 0)
    }

    return centroids
  }

  private computeSpectralFlatness(spectrum: Float32Array): number[] {
    const frameSize = 512
    const flatness: number[] = []

    for (let i = 0; i < spectrum.length - frameSize; i += frameSize / 2) {
      let logSum = 0
      let linearSum = 0
      for (let j = 0; j < frameSize; j++) {
        const mag = spectrum[i + j] + 1e-10
        logSum += Math.log(mag)
        linearSum += mag
      }
      const geometricMean = Math.exp(logSum / frameSize)
      const arithmeticMean = linearSum / frameSize
      flatness.push(arithmeticMean > 0 ? geometricMean / arithmeticMean : 0)
    }

    return flatness
  }

  private detectFrequencyCutoff(spectrum: Float32Array): number {
    const midpoint = Math.floor(spectrum.length / 2)
    let highFreqEnergy = 0
    let totalEnergy = 0

    for (let i = 0; i < spectrum.length; i++) {
      totalEnergy += spectrum[i]
      if (i > midpoint) highFreqEnergy += spectrum[i]
    }

    const ratio = totalEnergy > 0 ? highFreqEnergy / totalEnergy : 0
    return ratio < 0.1 ? 0.8 : ratio < 0.2 ? 0.5 : 0
  }

  private detectHarmonicStructure(spectrum: Float32Array, _sampleRate: number): number {
    // Find peaks and check for harmonic relationships
    const peaks: number[] = []
    const threshold = 0.1

    for (let i = 1; i < spectrum.length - 1; i++) {
      if (
        spectrum[i] > spectrum[i - 1] &&
        spectrum[i] > spectrum[i + 1] &&
        spectrum[i] > threshold
      ) {
        peaks.push(i)
      }
    }

    if (peaks.length < 3) return 0

    // Check if peaks are harmonically related
    let harmonicPairs = 0
    for (let i = 0; i < peaks.length; i++) {
      for (let j = i + 1; j < peaks.length; j++) {
        const ratio = peaks[j] / peaks[i]
        const roundedRatio = Math.round(ratio)
        if (Math.abs(ratio - roundedRatio) < 0.1 && roundedRatio > 1 && roundedRatio <= 8) {
          harmonicPairs++
        }
      }
    }

    const maxPairs = (peaks.length * (peaks.length - 1)) / 2
    return maxPairs > 0 ? harmonicPairs / maxPairs : 0
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    return values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / values.length
  }

  // ── Acoustic Artifacts ──────────────────────────────────────────────────────

  private analyzeAcousticArtifacts(data: AudioAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    segments: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const segments: AffectedRegion[] = []

    // Check for phase artifacts
    const phaseScore = this.detectPhaseArtifacts(data)
    if (phaseScore > 0.5) {
      signals.push({
        name: 'Phase Artifacts',
        category: 'acoustic_artifact',
        value: phaseScore,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Unusual phase characteristics detected',
      })
    }

    // Check for quantization artifacts
    const quantizationScore = this.detectQuantizationArtifacts(data)
    if (quantizationScore > 0.5) {
      signals.push({
        name: 'Quantization Artifacts',
        category: 'acoustic_artifact',
        value: quantizationScore,
        direction: 'supporting',
        severity: 'high',
        detail: 'Quantization artifacts suggest low-bitrate synthesis',
      })
    }

    // Check for natural breath sounds
    const breathScore = this.detectBreathSounds(data)
    if (breathScore > 0.3) {
      counterSignals.push({
        name: 'Natural Breaths',
        category: 'acoustic_artifact',
        value: breathScore,
        direction: 'counter',
        severity: 'medium',
        detail: 'Natural breathing patterns detected',
      })
    }

    // Check for room impulse response
    const roomScore = this.detectRoomCharacteristics(data)
    if (roomScore > 0.4) {
      counterSignals.push({
        name: 'Room Acoustics',
        category: 'acoustic_artifact',
        value: roomScore,
        direction: 'counter',
        severity: 'medium',
        detail: 'Natural room acoustics detected',
      })
    }

    return { signals, counterSignals, evidence, segments }
  }

  private detectPhaseArtifacts(data: AudioAnalysisData): number {
    // Check for phase coherence issues common in synthesis
    if (!data.spectralData) return 0

    let phaseInconsistency = 0
    const frameSize = 256

    for (let i = 0; i < data.spectralData.length - frameSize * 2; i += frameSize) {
      const segment1 = data.spectralData.slice(i, i + frameSize)
      const segment2 = data.spectralData.slice(i + frameSize, i + frameSize * 2)

      let correlation = 0
      let norm1 = 0
      let norm2 = 0
      for (let j = 0; j < frameSize; j++) {
        correlation += segment1[j] * segment2[j]
        norm1 += segment1[j] * segment1[j]
        norm2 += segment2[j] * segment2[j]
      }
      const norm = Math.sqrt(norm1 * norm2)
      if (norm > 0) {
        correlation /= norm
        if (correlation < 0.3) phaseInconsistency++
      }
    }

    const totalFrames = Math.floor(data.spectralData.length / frameSize) - 1
    return totalFrames > 0 ? phaseInconsistency / totalFrames : 0
  }

  private detectQuantizationArtifacts(data: AudioAnalysisData): number {
    // Check for quantization levels in audio
    const stepSize = 1 / 32768
    const levels = new Set<number>()

    for (let i = 0; i < Math.min(data.samples.length, 44100); i++) {
      const quantized = Math.round(data.samples[i] / stepSize) * stepSize
      levels.add(Math.round(quantized * 1000))
    }

    // Unusually few quantization levels suggests synthesis
    const levelRatio = levels.size / Math.min(data.samples.length, 44100)
    return levelRatio < 0.5 ? 0.7 : levelRatio < 0.7 ? 0.4 : 0
  }

  private detectBreathSounds(data: AudioAnalysisData): number {
    // Detect breath-like sounds (short, low-energy segments)
    if (!data.energy || data.energy.length === 0) return 0

    const meanEnergy = data.energy.reduce((a, b) => a + b, 0) / data.energy.length
    const threshold = meanEnergy * 0.1
    let breathCount = 0
    let inBreath = false
    let breathLength = 0

    for (let i = 0; i < data.energy.length; i++) {
      if (data.energy[i] < threshold) {
        if (!inBreath) {
          inBreath = true
          breathLength = 0
        }
        breathLength++
      } else {
        if (inBreath && breathLength > 5 && breathLength < 50) {
          breathCount++
        }
        inBreath = false
      }
    }

    return Math.min(1, breathCount / (data.duration * 0.5))
  }

  private detectRoomCharacteristics(data: AudioAnalysisData): number {
    // Check for natural reverb patterns
    if (!data.energy || data.energy.length < 10) return 0

    let decayScore = 0
    const windowSize = 10

    for (let i = 0; i < data.energy.length - windowSize; i++) {
      const window = data.energy.slice(i, i + windowSize)
      const maxIdx = window.indexOf(Math.max(...window))

      if (maxIdx < windowSize - 2) {
        const afterMax = window.slice(maxIdx)
        let isDecaying = true
        for (let j = 1; j < afterMax.length; j++) {
          if (afterMax[j] > afterMax[j - 1] * 1.1) {
            isDecaying = false
            break
          }
        }
        if (isDecaying) decayScore++
      }
    }

    return Math.min(1, decayScore / (data.energy.length / windowSize))
  }

  // ── Speech Consistency ──────────────────────────────────────────────────────

  private analyzeSpeechConsistency(data: AudioAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Pitch consistency
    if (data.pitchContour && data.pitchContour.length > 10) {
      const validPitch = data.pitchContour.filter((p) => p > 50 && p < 500)
      if (validPitch.length > 10) {
        const pitchVar = this.calculateVariance(validPitch)
        const pitchMean = validPitch.reduce((a, b) => a + b, 0) / validPitch.length
        const pitchCV = pitchMean > 0 ? Math.sqrt(pitchVar) / pitchMean : 0

        if (pitchCV < 0.1) {
          signals.push({
            name: 'Unnatural Pitch Stability',
            category: 'speech_consistency',
            value: 0.6,
            direction: 'supporting',
            severity: 'medium',
            detail: 'Pitch contour shows unnatural stability',
          })
        } else if (pitchCV > 0.2 && pitchCV < 0.5) {
          counterSignals.push({
            name: 'Natural Pitch Variation',
            category: 'speech_consistency',
            value: 0.5,
            direction: 'counter',
            severity: 'medium',
            detail: 'Pitch shows natural variation patterns',
          })
        }
      }
    }

    // Zero crossing rate consistency
    if (data.zeroCrossingRate && data.zeroCrossingRate.length > 10) {
      const zcrVar = this.calculateVariance(data.zeroCrossingRate)
      const zcrMean =
        data.zeroCrossingRate.reduce((a, b) => a + b, 0) / data.zeroCrossingRate.length
      const zcrCV = zcrMean > 0 ? Math.sqrt(zcrVar) / zcrMean : 0

      if (zcrCV < 0.15) {
        signals.push({
          name: 'Uniform Zero Crossing Rate',
          category: 'speech_consistency',
          value: 0.4,
          direction: 'supporting',
          severity: 'low',
          detail: 'Zero crossing rate shows unusual uniformity',
        })
      }
    }

    // Energy envelope analysis
    if (data.energy && data.energy.length > 20) {
      const energyDynamics = this.analyzeEnergyDynamics(data.energy)
      if (energyDynamics.isMonotonous) {
        signals.push({
          name: 'Monotonous Energy',
          category: 'speech_consistency',
          value: 0.5,
          direction: 'supporting',
          severity: 'medium',
          detail: 'Energy envelope shows monotonous patterns',
        })
      } else if (energyDynamics.isNatural) {
        counterSignals.push({
          name: 'Natural Energy Dynamics',
          category: 'speech_consistency',
          value: 0.5,
          direction: 'counter',
          severity: 'medium',
          detail: 'Energy dynamics appear natural',
        })
      }
    }

    return { signals, counterSignals, evidence }
  }

  private analyzeEnergyDynamics(energy: number[]): {
    isMonotonous: boolean
    isNatural: boolean
  } {
    const windowSize = Math.floor(energy.length / 10)
    const windows: number[] = []

    for (let i = 0; i < energy.length; i += windowSize) {
      const window = energy.slice(i, i + windowSize)
      windows.push(window.reduce((a, b) => a + b, 0) / window.length)
    }

    const variance = this.calculateVariance(windows)
    const mean = windows.reduce((a, b) => a + b, 0) / windows.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

    return {
      isMonotonous: cv < 0.1,
      isNatural: cv > 0.2 && cv < 0.6,
    }
  }

  // ── Temporal Anomalies ──────────────────────────────────────────────────────

  private analyzeTemporalAnomalies(data: AudioAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    segments: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const segments: AffectedRegion[] = []

    // Check for silence gaps
    const silenceSegments = this.detectSilenceGaps(data)
    if (silenceSegments.length > 0) {
      for (const seg of silenceSegments) {
        if (seg.duration > 0.5) {
          segments.push({
            id: `silence-${seg.startTime.toFixed(2)}`,
            label: 'Unusual silence',
            type: 'temporal',
            location: {
              type: 'segment',
              startSeconds: seg.startTime,
              endSeconds: seg.endTime,
              label: `Duration: ${seg.duration.toFixed(2)}s`,
            },
            severity: seg.duration > 2 ? 'high' : 'medium',
            description: `Unusual silence gap of ${seg.duration.toFixed(2)} seconds`,
          })
        }
      }
    }

    // Check for temporal discontinuities
    const discontinuities = this.detectTemporalDiscontinuities(data)
    if (discontinuities.length > 0) {
      signals.push({
        name: 'Temporal Discontinuities',
        category: 'temporal',
        value: Math.min(0.8, discontinuities.length * 0.2),
        direction: 'supporting',
        severity: discontinuities.length > 3 ? 'high' : 'medium',
        detail: `Found ${discontinuities.length} temporal discontinuities`,
      })
    } else {
      counterSignals.push({
        name: 'Smooth Temporal Flow',
        category: 'temporal',
        value: 0.5,
        direction: 'counter',
        severity: 'low',
        detail: 'Audio shows smooth temporal characteristics',
      })
    }

    return { signals, counterSignals, evidence, segments }
  }

  private detectSilenceGaps(data: AudioAnalysisData): Array<{
    startTime: number
    endTime: number
    duration: number
  }> {
    if (!data.energy || data.energy.length === 0) return []

    const meanEnergy = data.energy.reduce((a, b) => a + b, 0) / data.energy.length
    const silenceThreshold = meanEnergy * 0.05
    const framesPerSecond = data.energy.length / data.duration
    const minGapFrames = Math.floor(framesPerSecond * 0.3)

    const gaps: Array<{ startTime: number; endTime: number; duration: number }> = []
    let gapStart = -1

    for (let i = 0; i < data.energy.length; i++) {
      if (data.energy[i] < silenceThreshold) {
        if (gapStart === -1) gapStart = i
      } else {
        if (gapStart !== -1) {
          const gapFrames = i - gapStart
          if (gapFrames >= minGapFrames) {
            gaps.push({
              startTime: gapStart / framesPerSecond,
              endTime: i / framesPerSecond,
              duration: gapFrames / framesPerSecond,
            })
          }
          gapStart = -1
        }
      }
    }

    return gaps
  }

  private detectTemporalDiscontinuities(data: AudioAnalysisData): number[] {
    if (!data.energy || data.energy.length < 20) return []

    const discontinuities: number[] = []
    const windowSize = 5

    for (let i = windowSize; i < data.energy.length - windowSize; i++) {
      const before = data.energy.slice(i - windowSize, i)
      const after = data.energy.slice(i, i + windowSize)

      const meanBefore = before.reduce((a, b) => a + b, 0) / before.length
      const meanAfter = after.reduce((a, b) => a + b, 0) / after.length

      if (meanBefore > 0 && meanAfter > 0) {
        const ratio = Math.max(meanBefore / meanAfter, meanAfter / meanBefore)
        if (ratio > 5) {
          discontinuities.push(i / (data.energy.length / data.duration))
        }
      }
    }

    return discontinuities
  }

  // ── Metadata Analysis ──────────────────────────────────────────────────────

  private analyzeMetadata(
    metadata: AudioInput['metadata'],
    input: AudioInput,
  ): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Check for synthesis markers in metadata
    if (metadata) {
      const metadataStr = JSON.stringify(metadata).toLowerCase()

      for (const marker of this.SYNTHESIS_MARKERS) {
        if (metadataStr.includes(marker.toLowerCase())) {
          signals.push({
            name: 'Synthesis Marker in Metadata',
            category: 'metadata',
            value: 0.9,
            direction: 'supporting',
            severity: 'high',
            detail: `AI synthesis marker "${marker}" found in metadata`,
          })
          break
        }
      }

      // Check for recording information
      if (metadata.artist) {
        counterSignals.push({
          name: 'Artist Info Present',
          category: 'metadata',
          value: 0.3,
          direction: 'counter',
          severity: 'low',
          detail: `Artist: ${metadata.artist}`,
        })
      }

      if (metadata.created) {
        counterSignals.push({
          name: 'Creation Date Present',
          category: 'metadata',
          value: 0.3,
          direction: 'counter',
          severity: 'low',
          detail: `Created: ${metadata.created}`,
        })
      }
    }

    // Check codec information
    if (input.metadata?.codec) {
      evidence.push({
        id: `metadata-codec-${Date.now()}`,
        category: 'metadata_anomaly',
        description: `Audio codec: ${input.metadata.codec}`,
        confidence: 0.3,
      })
    }

    return { signals, counterSignals, evidence }
  }

  // ── Model-Based Signals ─────────────────────────────────────────────────────

  private analyzeModelBasedSignals(data: AudioAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Check for vocoder artifacts
    const vocoderScore = this.detectVocoderArtifacts(data)
    if (vocoderScore > 0.5) {
      signals.push({
        name: 'Vocoder Artifacts',
        category: 'model_artifact',
        value: vocoderScore,
        direction: 'supporting',
        severity: vocoderScore > 0.7 ? 'high' : 'medium',
        detail: 'Characteristics consistent with vocoder-based synthesis',
      })
    }

    // Check for neural synthesis artifacts
    const neuralScore = this.detectNeuralSynthesisArtifacts(data)
    if (neuralScore > 0.5) {
      signals.push({
        name: 'Neural Synthesis Artifacts',
        category: 'model_artifact',
        value: neuralScore,
        direction: 'supporting',
        severity: neuralScore > 0.7 ? 'high' : 'medium',
        detail: 'Patterns consistent with neural network synthesis',
      })
    }

    if (vocoderScore < 0.3 && neuralScore < 0.3) {
      counterSignals.push({
        name: 'No Model Artifacts',
        category: 'model_artifact',
        value: 0.5,
        direction: 'counter',
        severity: 'low',
        detail: 'No obvious synthesis artifacts detected',
      })
    }

    return { signals, counterSignals, evidence }
  }

  private detectVocoderArtifacts(data: AudioAnalysisData): number {
    if (!data.spectralData) return 0

    // Check for characteristic vocoder patterns
    let smoothnessScore = 0
    const frameSize = 256

    for (let i = 0; i < data.spectralData.length - frameSize; i += frameSize / 2) {
      let localSmoothness = 0
      for (let j = 1; j < frameSize; j++) {
        const diff = Math.abs(data.spectralData[i + j] - data.spectralData[i + j - 1])
        localSmoothness += diff
      }
      smoothnessScore += localSmoothness / frameSize
    }

    const avgSmoothness = smoothnessScore / (data.spectralData.length / frameSize)
    return avgSmoothness < 0.01 ? 0.7 : avgSmoothness < 0.02 ? 0.4 : 0
  }

  private detectNeuralSynthesisArtifacts(data: AudioAnalysisData): number {
    // Check for characteristic neural synthesis patterns
    if (!data.pitchContour || data.pitchContour.length < 20) return 0

    const validPitch = data.pitchContour.filter((p) => p > 50 && p < 500)
    if (validPitch.length < 20) return 0

    // Check for unnatural pitch smoothness
    let smoothness = 0
    for (let i = 1; i < validPitch.length; i++) {
      smoothness += Math.abs(validPitch[i] - validPitch[i - 1])
    }
    const avgSmoothness = smoothness / (validPitch.length - 1)
    const mean = validPitch.reduce((a, b) => a + b, 0) / validPitch.length

    const relativeSmoothness = mean > 0 ? avgSmoothness / mean : 0
    return relativeSmoothness < 0.02 ? 0.6 : relativeSmoothness < 0.05 ? 0.3 : 0
  }
}
