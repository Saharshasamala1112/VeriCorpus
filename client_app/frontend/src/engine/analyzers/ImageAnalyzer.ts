import type {
  ModalityAnalyzer,
  ImageInput,
  ModalityAnalysisResult,
  ModalitySignal,
  EvidenceItem,
  AffectedRegion,
} from '../types'

// ─── Image Feature Types ─────────────────────────────────────────────────────

interface ImageAnalysisData {
  width: number
  height: number
  format: string
  channels: number
  histogram: number[]
  colorDistribution: { r: number[]; g: number[]; b: number[] }
  edgeMap?: ImageGrid
  noiseMap?: ImageGrid
  frequencyData?: Float32Array
  exifData?: Record<string, unknown>
  luminanceHistogram: number[]
}

interface ImageGrid {
  rows: number
  cols: number
  data: number[][]
}

// ─── Image Analyzer ──────────────────────────────────────────────────────────

export class ImageAnalyzer implements ModalityAnalyzer<ImageInput> {
  modality = 'image' as const

  private readonly GRID_SIZE = 8
  private readonly JPEG_QUALITY_MARKERS = [
    'Adobe',
    'Photoshop',
    'GIMP',
    'Capture One',
    'Lightroom',
    'Snapseed',
    'VSCO',
  ]

  private readonly AI_GENERATORS = [
    'DALL-E',
    'Midjourney',
    'Stable Diffusion',
    'Firefly',
    'Imagen',
    'Craiyon',
    'NovelAI',
    'Leonardo',
    'DreamStudio',
    'Playground',
    'Bing Image Creator',
  ]

  async analyze(input: ImageInput): Promise<ModalityAnalysisResult> {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const affectedRegions: AffectedRegion[] = []
    const affectedSegments: AffectedRegion[] = []
    const limitations: string[] = []

    try {
      const imageData = await this.extractImageData(input)
      const metadata = input.metadata || {}

      // ── Visual Artifact Analysis ──────────────────────────────────────────
      const visualArtifacts = this.analyzeVisualArtifacts(imageData)
      signals.push(...visualArtifacts.signals)
      counterSignals.push(...visualArtifacts.counterSignals)
      evidence.push(...visualArtifacts.evidence)
      affectedRegions.push(...visualArtifacts.regions)

      // ── Compression Analysis ──────────────────────────────────────────────
      const compressionSignals = this.analyzeCompression(imageData, metadata)
      signals.push(...compressionSignals.signals)
      counterSignals.push(...compressionSignals.counterSignals)
      evidence.push(...compressionSignals.evidence)

      // ── Frequency Domain Features ─────────────────────────────────────────
      const frequencySignals = this.analyzeFrequencyDomain(imageData)
      signals.push(...frequencySignals.signals)
      counterSignals.push(...frequencySignals.counterSignals)
      evidence.push(...frequencySignals.evidence)
      affectedRegions.push(...frequencySignals.regions)

      // ── Metadata Analysis ─────────────────────────────────────────────────
      const metadataSignals = this.analyzeMetadata(metadata, input)
      signals.push(...metadataSignals.signals)
      counterSignals.push(...metadataSignals.counterSignals)
      evidence.push(...metadataSignals.evidence)

      // ── Inconsistent Regions ──────────────────────────────────────────────
      const inconsistentRegions = this.detectInconsistentRegions(imageData)
      signals.push(...inconsistentRegions.signals)
      counterSignals.push(...inconsistentRegions.counterSignals)
      evidence.push(...inconsistentRegions.evidence)
      affectedRegions.push(...inconsistentRegions.regions)

      // ── Model-Based Manipulation Signals ──────────────────────────────────
      const modelSignals = this.analyzeModelBasedSignals(imageData)
      signals.push(...modelSignals.signals)
      counterSignals.push(...modelSignals.counterSignals)
      evidence.push(...modelSignals.evidence)

      // ── Image Embedding Analysis ──────────────────────────────────────────
      const embeddingSignals = this.analyzeEmbeddings(imageData)
      signals.push(...embeddingSignals.signals)
      counterSignals.push(...embeddingSignals.counterSignals)
      evidence.push(...embeddingSignals.evidence)

      // ── Source Evidence ────────────────────────────────────────────────────
      const sourceSignals = this.analyzeSourceEvidence(metadata, input)
      signals.push(...sourceSignals.signals)
      counterSignals.push(...sourceSignals.counterSignals)
      evidence.push(...sourceSignals.evidence)

      // ── Metadata Summary ──────────────────────────────────────────────────
      const resultMetadata: Record<string, unknown> = {
        width: imageData.width,
        height: imageData.height,
        format: imageData.format,
        channels: imageData.channels,
        exifPresent: !!metadata.exif,
        hasGps: !!metadata.gps,
        cameraInfo: metadata.camera,
        timestamp: metadata.timestamp,
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
        `Image analysis failed: ${error instanceof Error ? error.message : 'unknown error'}`,
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

  // ── Image Data Extraction ───────────────────────────────────────────────────

  private async extractImageData(input: ImageInput): Promise<ImageAnalysisData> {
    if (input.dataUrl) {
      return this.processDataUrl(input.dataUrl, input.metadata)
    }

    if (input.file) {
      return this.processFile(input.file, input.metadata)
    }

    throw new Error('No image data available for analysis')
  }

  private async processDataUrl(
    dataUrl: string,
    metadata?: ImageInput['metadata'],
  ): Promise<ImageAnalysisData> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('Cannot create canvas context'))
          return
        }

        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, img.width, img.height)

        resolve(this.buildAnalysisData(imageData, img.width, img.height, metadata))
      }
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = dataUrl
    })
  }

  private async processFile(
    file: File | Blob,
    metadata?: ImageInput['metadata'],
  ): Promise<ImageAnalysisData> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const dataUrl = e.target?.result as string
        try {
          const data = await this.processDataUrl(dataUrl, metadata)
          resolve(data)
        } catch (err) {
          reject(err)
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsDataURL(file)
    })
  }

  private buildAnalysisData(
    imageData: ImageData,
    width: number,
    height: number,
    metadata?: ImageInput['metadata'],
  ): ImageAnalysisData {
    const data = imageData.data
    const histogram = new Array(256).fill(0)
    const luminanceHistogram = new Array(256).fill(0)
    const colorDist = {
      r: new Array(256).fill(0),
      g: new Array(256).fill(0),
      b: new Array(256).fill(0),
    }

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b)

      histogram[luminance]++
      luminanceHistogram[luminance]++
      colorDist.r[r]++
      colorDist.g[g]++
      colorDist.b[b]++
    }

    return {
      width,
      height,
      format: metadata?.format || 'unknown',
      channels: 4,
      histogram,
      colorDistribution: colorDist,
      luminanceHistogram,
      exifData: metadata?.exif,
    }
  }

  // ── Visual Artifact Analysis ────────────────────────────────────────────────

  private analyzeVisualArtifacts(data: ImageAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    regions: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const regions: AffectedRegion[] = []

    // Color banding detection
    const bandingScore = this.detectColorBanding(data)
    if (bandingScore > 0.6) {
      signals.push({
        name: 'Color Banding',
        category: 'visual_artifact',
        value: bandingScore,
        direction: 'supporting',
        severity: bandingScore > 0.8 ? 'high' : 'medium',
        detail: 'Significant color banding detected, suggesting compression or manipulation',
      })
    }

    // JPEG blocking artifacts
    const blockingScore = this.detectBlockingArtifacts(data)
    if (blockingScore > 0.5) {
      signals.push({
        name: 'Blocking Artifacts',
        category: 'visual_artifact',
        value: blockingScore,
        direction: 'supporting',
        severity: blockingScore > 0.7 ? 'high' : 'medium',
        detail: 'JPEG blocking artifacts detected at unusual boundaries',
      })
    }

    // Edge consistency
    const edgeConsistency = this.checkEdgeConsistency(data)
    if (edgeConsistency < 0.4) {
      signals.push({
        name: 'Edge Inconsistency',
        category: 'visual_artifact',
        value: 1 - edgeConsistency,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Inconsistent edge patterns suggest possible splicing',
      })
    } else if (edgeConsistency > 0.7) {
      counterSignals.push({
        name: 'Consistent Edges',
        category: 'visual_artifact',
        value: edgeConsistency,
        direction: 'counter',
        severity: 'low',
        detail: 'Edge patterns appear natural and consistent',
      })
    }

    // Noise pattern analysis
    const noiseAnalysis = this.analyzeNoisePatterns(data)
    signals.push(...noiseAnalysis.signals)
    counterSignals.push(...noiseAnalysis.counterSignals)

    return { signals, counterSignals, evidence, regions }
  }

  private detectColorBanding(data: ImageAnalysisData): number {
    const hist = data.luminanceHistogram
    let transitions = 0
    let gaps = 0

    for (let i = 1; i < 255; i++) {
      if (hist[i] === 0 && hist[i - 1] > 0 && hist[i + 1] > 0) {
        gaps++
      }
      if (hist[i] > 0 && hist[i - 1] === 0) {
        transitions++
      }
    }

    return Math.min(1, (gaps * 2 + transitions) / 50)
  }

  private detectBlockingArtifacts(data: ImageAnalysisData): number {
    const blockSize = 8
    const width = data.width
    const height = data.height
    let blockinessScore = 0
    let blockCount = 0

    for (let by = 0; by < height - blockSize; by += blockSize) {
      for (let bx = 0; bx < width - blockSize; bx += blockSize) {
        const horizontalDiff = Math.abs(
          this.getBlockAverage(data, bx, by + blockSize - 1, blockSize, 1, width) -
            this.getBlockAverage(data, bx, by + blockSize, blockSize, 1, width),
        )
        const verticalDiff = Math.abs(
          this.getBlockAverage(data, bx + blockSize - 1, by, 1, blockSize, width) -
            this.getBlockAverage(data, bx + blockSize, by, 1, blockSize, width),
        )

        blockinessScore += horizontalDiff + verticalDiff
        blockCount++
      }
    }

    return blockCount > 0 ? Math.min(1, blockinessScore / blockCount / 20) : 0
  }

  private getBlockAverage(
    data: ImageAnalysisData,
    x: number,
    y: number,
    w: number,
    h: number,
    stride: number,
  ): number {
    let sum = 0
    let count = 0
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        const idx = ((y + dy) * stride + (x + dx)) * 4
        sum += data.histogram[Math.min(255, Math.max(0, Math.round(0.299 * idx)))] || 0
        count++
      }
    }
    return count > 0 ? sum / count : 0
  }

  private checkEdgeConsistency(data: ImageAnalysisData): number {
    const blockSize = Math.max(1, Math.floor(Math.min(data.width, data.height) / this.GRID_SIZE))
    const grid: number[][] = []

    for (let gy = 0; gy < this.GRID_SIZE; gy++) {
      const row: number[] = []
      for (let gx = 0; gx < this.GRID_SIZE; gx++) {
        let edgeSum = 0
        let count = 0
        for (let y = gy * blockSize; y < (gy + 1) * blockSize && y < data.height - 1; y++) {
          for (let x = gx * blockSize; x < (gx + 1) * blockSize && x < data.width - 1; x++) {
            const idx = (y * data.width + x) * 4
            const idxRight = (y * data.width + x + 1) * 4
            const idxBelow = ((y + 1) * data.width + x) * 4

            const h = Math.abs(data.histogram[idx] - data.histogram[idxRight])
            const v = Math.abs(data.histogram[idx] - data.histogram[idxBelow])
            edgeSum += Math.sqrt(h * h + v * v)
            count++
          }
        }
        row.push(count > 0 ? edgeSum / count : 0)
      }
      grid.push(row)
    }

    let variance = 0
    const means: number[] = []
    for (let gy = 0; gy < this.GRID_SIZE; gy++) {
      for (let gx = 0; gx < this.GRID_SIZE; gx++) {
        means.push(grid[gy][gx])
      }
    }
    const mean = means.reduce((a, b) => a + b, 0) / means.length
    variance = means.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / means.length

    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0
    return Math.max(0, 1 - cv * 3)
  }

  private analyzeNoisePatterns(data: ImageAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []

    const blockSize = Math.floor(Math.min(data.width, data.height) / this.GRID_SIZE)
    const noiseLevels: number[] = []

    for (let gy = 0; gy < this.GRID_SIZE; gy++) {
      for (let gx = 0; gx < this.GRID_SIZE; gx++) {
        let noiseSum = 0
        let count = 0
        for (let y = gy * blockSize + 1; y < (gy + 1) * blockSize - 1 && y < data.height - 1; y++) {
          for (
            let x = gx * blockSize + 1;
            x < (gx + 1) * blockSize - 1 && x < data.width - 1;
            x++
          ) {
            const idx = (y * data.width + x) * 4
            const center = data.histogram[idx]
            const neighbors = [
              data.histogram[idx - 4],
              data.histogram[idx + 4],
              data.histogram[idx - data.width * 4],
              data.histogram[idx + data.width * 4],
            ]
            const avgNeighbor = neighbors.reduce((a, b) => a + b, 0) / 4
            noiseSum += Math.abs(center - avgNeighbor)
            count++
          }
        }
        noiseLevels.push(count > 0 ? noiseSum / count : 0)
      }
    }

    const meanNoise = noiseLevels.reduce((a, b) => a + b, 0) / noiseLevels.length
    const noiseVariance =
      noiseLevels.reduce((a, v) => a + Math.pow(v - meanNoise, 2), 0) / noiseLevels.length
    const noiseCV = meanNoise > 0 ? Math.sqrt(noiseVariance) / meanNoise : 0

    if (noiseCV > 0.5) {
      signals.push({
        name: 'Inconsistent Noise',
        category: 'visual_artifact',
        value: Math.min(0.8, noiseCV),
        direction: 'supporting',
        severity: noiseCV > 0.7 ? 'high' : 'medium',
        detail: 'Inconsistent noise levels across image regions suggest manipulation',
      })
    } else if (noiseCV < 0.2) {
      counterSignals.push({
        name: 'Consistent Noise',
        category: 'visual_artifact',
        value: 1 - noiseCV,
        direction: 'counter',
        severity: 'low',
        detail: 'Noise patterns appear natural and consistent',
      })
    }

    return { signals, counterSignals }
  }

  // ── Compression Analysis ────────────────────────────────────────────────────

  private analyzeCompression(
    data: ImageAnalysisData,
    metadata: ImageInput['metadata'],
  ): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Check for double compression
    const doubleCompression = this.detectDoubleCompression(data)
    if (doubleCompression > 0.5) {
      signals.push({
        name: 'Double Compression',
        category: 'compression',
        value: doubleCompression,
        direction: 'supporting',
        severity: 'high',
        detail: 'Evidence of double JPEG compression detected',
      })
    }

    // Check for compression inconsistencies
    const compressionInconsistency = this.detectCompressionInconsistency(data)
    if (compressionInconsistency > 0.5) {
      signals.push({
        name: 'Compression Inconsistency',
        category: 'compression',
        value: compressionInconsistency,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Inconsistent compression levels across image regions',
      })
    }

    // Check for thumbnail mismatch
    if (metadata?.exif) {
      const hasThumbnail = 'thumbnail' in metadata.exif
      if (hasThumbnail) {
        evidence.push({
          id: `compression-thumb-${Date.now()}`,
          category: 'compression_artifact',
          description: 'EXIF thumbnail present for comparison',
          confidence: 0.5,
        })
      }
    }

    return { signals, counterSignals, evidence }
  }

  private detectDoubleCompression(data: ImageAnalysisData): number {
    // Simplified DCT artifact detection
    // In production, this would analyze JPEG DCT coefficients
    const hist = data.luminanceHistogram
    let periodicPattern = 0

    // Check for periodic patterns in histogram (sign of double compression)
    for (let i = 2; i < 128; i++) {
      const ratio = hist[i * 2] / (hist[i] + 1)
      if (ratio > 1.5 || ratio < 0.67) {
        periodicPattern++
      }
    }

    return Math.min(1, periodicPattern / 30)
  }

  private detectCompressionInconsistency(data: ImageAnalysisData): number {
    const blockSize = Math.floor(Math.min(data.width, data.height) / this.GRID_SIZE)
    const compressionScores: number[] = []

    for (let gy = 0; gy < this.GRID_SIZE; gy++) {
      for (let gx = 0; gx < this.GRID_SIZE; gx++) {
        let highFreqSum = 0
        let count = 0

        for (let y = gy * blockSize; y < (gy + 1) * blockSize && y < data.height - 1; y++) {
          for (let x = gx * blockSize; x < (gx + 1) * blockSize && x < data.width - 1; x++) {
            const idx = (y * data.width + x) * 4
            const h = Math.abs(data.histogram[idx] - data.histogram[idx + 4])
            highFreqSum += h
            count++
          }
        }

        compressionScores.push(count > 0 ? highFreqSum / count : 0)
      }
    }

    const mean = compressionScores.reduce((a, b) => a + b, 0) / compressionScores.length
    const variance =
      compressionScores.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / compressionScores.length
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

    return Math.min(1, cv * 2)
  }

  // ── Frequency Domain Analysis ───────────────────────────────────────────────

  private analyzeFrequencyDomain(data: ImageAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    regions: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const regions: AffectedRegion[] = []

    // Simplified frequency analysis via pixel gradient distribution
    const gradientHistogram = this.computeGradientHistogram(data)
    const spectralAnalysis = this.analyzeSpectralCharacteristics(gradientHistogram)

    if (spectralAnalysis.hasSpike) {
      signals.push({
        name: 'Spectral Anomaly',
        category: 'frequency_domain',
        value: spectralAnalysis.spikeMagnitude,
        direction: 'supporting',
        severity: spectralAnalysis.spikeMagnitude > 0.7 ? 'high' : 'medium',
        detail: 'Unusual spectral spike detected, possible manipulation artifact',
      })
    }

    if (spectralAnalysis.hasPeriodicPattern) {
      signals.push({
        name: 'Periodic Pattern',
        category: 'frequency_domain',
        value: spectralAnalysis.periodicStrength,
        direction: 'supporting',
        severity: 'medium',
        detail: 'Periodic frequency pattern detected, suggesting synthetic content',
      })
    }

    if (!spectralAnalysis.hasSpike && !spectralAnalysis.hasPeriodicPattern) {
      counterSignals.push({
        name: 'Natural Spectrum',
        category: 'frequency_domain',
        value: 0.6,
        direction: 'counter',
        severity: 'low',
        detail: 'Frequency characteristics appear natural',
      })
    }

    return { signals, counterSignals, evidence, regions }
  }

  private computeGradientHistogram(data: ImageAnalysisData): number[] {
    const histogram = new Array(256).fill(0)
    const blockSize = 4

    for (let y = 0; y < data.height - blockSize; y += blockSize) {
      for (let x = 0; x < data.width - blockSize; x += blockSize) {
        const idx = (y * data.width + x) * 4
        const gradient = Math.abs(data.histogram[idx] - data.histogram[idx + blockSize * 4])
        const bin = Math.min(255, Math.max(0, gradient))
        histogram[bin]++
      }
    }

    return histogram
  }

  private analyzeSpectralCharacteristics(histogram: number[]): {
    hasSpike: boolean
    spikeMagnitude: number
    hasPeriodicPattern: boolean
    periodicStrength: number
  } {
    const max = Math.max(...histogram)
    const mean = histogram.reduce((a, b) => a + b, 0) / histogram.length
    const threshold = mean * 3

    let spikeCount = 0
    for (const val of histogram) {
      if (val > threshold) spikeCount++
    }

    // Check for periodicity
    let periodicStrength = 0
    const period = 16
    for (let i = period; i < histogram.length; i++) {
      const diff = Math.abs(histogram[i] - histogram[i - period])
      periodicStrength += diff
    }
    periodicStrength = periodicStrength / (histogram.length - period) / (max + 1)

    return {
      hasSpike: spikeCount > 5,
      spikeMagnitude: Math.min(1, spikeCount / 20),
      hasPeriodicPattern: periodicStrength > 0.3,
      periodicStrength: Math.min(1, periodicStrength),
    }
  }

  // ── Metadata Analysis ──────────────────────────────────────────────────────

  private analyzeMetadata(
    metadata: ImageInput['metadata'],
    _input: ImageInput,
  ): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    if (!metadata) {
      signals.push({
        name: 'No Metadata',
        category: 'metadata',
        value: 0.4,
        direction: 'supporting',
        severity: 'medium',
        detail: 'No image metadata available for analysis',
      })
      return { signals, counterSignals, evidence }
    }

    // Check for editing software
    if (metadata.camera?.software) {
      const software = metadata.camera.software
      const isEditingSoftware = this.JPEG_QUALITY_MARKERS.some((s) =>
        software.toLowerCase().includes(s.toLowerCase()),
      )

      if (isEditingSoftware) {
        signals.push({
          name: 'Editing Software Detected',
          category: 'metadata',
          value: 0.5,
          direction: 'supporting',
          severity: 'medium',
          detail: `Image was processed with: ${software}`,
        })
      } else {
        counterSignals.push({
          name: 'Camera Software',
          category: 'metadata',
          value: 0.4,
          direction: 'counter',
          severity: 'low',
          detail: `Image software: ${software}`,
        })
      }
    }

    // Check for AI generator signatures
    if (metadata.exif) {
      const exifStr = JSON.stringify(metadata.exif).toLowerCase()
      for (const generator of this.AI_GENERATORS) {
        if (exifStr.includes(generator.toLowerCase())) {
          signals.push({
            name: 'AI Generator Signature',
            category: 'metadata',
            value: 0.9,
            direction: 'supporting',
            severity: 'high',
            detail: `AI generator "${generator}" detected in metadata`,
          })
          break
        }
      }
    }

    // Check for camera model
    if (metadata.camera?.make && metadata.camera?.model) {
      counterSignals.push({
        name: 'Camera Identified',
        category: 'metadata',
        value: 0.5,
        direction: 'counter',
        severity: 'medium',
        detail: `Camera: ${metadata.camera.make} ${metadata.camera.model}`,
      })
    }

    // Check for GPS data
    if (metadata.gps) {
      counterSignals.push({
        name: 'GPS Data Present',
        category: 'metadata',
        value: 0.4,
        direction: 'counter',
        severity: 'low',
        detail: 'Image contains GPS location data',
      })
    }

    // Check for timestamp
    if (metadata.timestamp) {
      counterSignals.push({
        name: 'Timestamp Present',
        category: 'metadata',
        value: 0.3,
        direction: 'counter',
        severity: 'low',
        detail: `Image timestamp: ${metadata.timestamp}`,
      })
    }

    return { signals, counterSignals, evidence }
  }

  // ── Inconsistent Region Detection ──────────────────────────────────────────

  private detectInconsistentRegions(data: ImageAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
    regions: AffectedRegion[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []
    const regions: AffectedRegion[] = []

    const blockSize = Math.floor(Math.min(data.width, data.height) / this.GRID_SIZE)
    const regionScores: number[][] = []

    for (let gy = 0; gy < this.GRID_SIZE; gy++) {
      const row: number[] = []
      for (let gx = 0; gx < this.GRID_SIZE; gx++) {
        const score = this.computeRegionAnomalyScore(
          data,
          gx * blockSize,
          gy * blockSize,
          blockSize,
        )
        row.push(score)
      }
      regionScores.push(row)
    }

    // Find anomalous regions
    const allScores = regionScores.flat()
    const mean = allScores.reduce((a, b) => a + b, 0) / allScores.length
    const std = Math.sqrt(
      allScores.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / allScores.length,
    )
    const threshold = mean + std * 1.5

    for (let gy = 0; gy < this.GRID_SIZE; gy++) {
      for (let gx = 0; gx < this.GRID_SIZE; gx++) {
        if (regionScores[gy][gx] > threshold) {
          const x = gx * blockSize
          const y = gy * blockSize
          const regionId = `region-${gx}-${gy}-${Date.now()}`

          regions.push({
            id: regionId,
            label: `Anomalous region (${gx}, ${gy})`,
            type: 'spatial',
            location: {
              type: 'bounding_box',
              x,
              y,
              width: blockSize,
              height: blockSize,
              label: `Anomaly score: ${regionScores[gy][gx].toFixed(2)}`,
            },
            severity: regionScores[gy][gx] > threshold * 1.5 ? 'high' : 'medium',
            description: `Region shows anomalous characteristics compared to surroundings`,
          })

          evidence.push({
            id: `evidence-${regionId}`,
            category: 'region_inconsistency',
            description: `Anomalous region at (${x}, ${y}) with score ${regionScores[gy][gx].toFixed(2)}`,
            confidence: Math.min(0.8, regionScores[gy][gx] / (threshold * 2)),
            location: {
              type: 'bounding_box',
              x,
              y,
              width: blockSize,
              height: blockSize,
            },
          })
        }
      }
    }

    if (regions.length > 0) {
      signals.push({
        name: 'Spatial Inconsistencies',
        category: 'regional',
        value: Math.min(0.8, regions.length / 5),
        direction: 'supporting',
        severity: regions.length > 3 ? 'high' : 'medium',
        detail: `Found ${regions.length} anomalous regions`,
      })
    } else {
      counterSignals.push({
        name: 'Spatially Consistent',
        category: 'regional',
        value: 0.5,
        direction: 'counter',
        severity: 'low',
        detail: 'Image appears spatially consistent',
      })
    }

    return { signals, counterSignals, evidence, regions }
  }

  private computeRegionAnomalyScore(
    data: ImageAnalysisData,
    startX: number,
    startY: number,
    size: number,
  ): number {
    let gradientSum = 0
    let noiseSum = 0
    let colorSum = 0
    let count = 0

    for (let y = startY; y < startY + size && y < data.height - 1; y++) {
      for (let x = startX; x < startX + size && x < data.width - 1; x++) {
        const idx = (y * data.width + x) * 4
        const r = data.histogram[idx]
        const g = data.histogram[idx + 1]
        const b = data.histogram[idx + 2]

        const hGrad = Math.abs(data.histogram[idx] - data.histogram[idx + 4])
        const vGrad = Math.abs(data.histogram[idx] - data.histogram[idx + data.width * 4])
        gradientSum += Math.sqrt(hGrad * hGrad + vGrad * vGrad)

        const luminance = 0.299 * r + 0.587 * g + 0.114 * b
        colorSum += luminance
        count++
      }
    }

    if (count === 0) return 0

    const avgGradient = gradientSum / count
    const avgColor = colorSum / count

    // Anomaly score based on gradient and color deviation
    const normalizedGradient = Math.min(1, avgGradient / 50)
    const normalizedColor = Math.min(1, avgColor / 255)

    return normalizedGradient * 0.5 + normalizedColor * 0.3 + noiseSum * 0.2
  }

  // ── Model-Based Manipulation Signals ────────────────────────────────────────

  private analyzeModelBasedSignals(data: ImageAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Check for GAN-like artifacts (simplified)
    const ganScore = this.detectGANArtifacts(data)
    if (ganScore > 0.5) {
      signals.push({
        name: 'GAN Artifacts',
        category: 'model_artifact',
        value: ganScore,
        direction: 'supporting',
        severity: ganScore > 0.7 ? 'high' : 'medium',
        detail: 'Patterns consistent with GAN-generated content detected',
      })
    }

    // Check for diffusion model artifacts
    const diffusionScore = this.detectDiffusionArtifacts(data)
    if (diffusionScore > 0.5) {
      signals.push({
        name: 'Diffusion Artifacts',
        category: 'model_artifact',
        value: diffusionScore,
        direction: 'supporting',
        severity: diffusionScore > 0.7 ? 'high' : 'medium',
        detail: 'Patterns consistent with diffusion model generation detected',
      })
    }

    if (ganScore < 0.3 && diffusionScore < 0.3) {
      counterSignals.push({
        name: 'No Model Artifacts',
        category: 'model_artifact',
        value: 0.5,
        direction: 'counter',
        severity: 'low',
        detail: 'No obvious AI model artifacts detected',
      })
    }

    return { signals, counterSignals, evidence }
  }

  private detectGANArtifacts(data: ImageAnalysisData): number {
    // Simplified GAN artifact detection
    // Checks for characteristic patterns in color distribution
    const rHist = data.colorDistribution.r
    const gHist = data.colorDistribution.g
    const bHist = data.colorDistribution.b

    let correlationScore = 0
    for (let i = 0; i < 256; i++) {
      const rNorm = rHist[i] / (data.width * data.height)
      const gNorm = gHist[i] / (data.width * data.height)
      const bNorm = bHist[i] / (data.width * data.height)

      // Check for unnatural color correlations
      if (Math.abs(rNorm - gNorm) < 0.001 && Math.abs(gNorm - bNorm) < 0.001) {
        correlationScore++
      }
    }

    return Math.min(1, correlationScore / 100)
  }

  private detectDiffusionArtifacts(data: ImageAnalysisData): number {
    // Check for characteristic diffusion model patterns
    const hist = data.luminanceHistogram
    let smoothnessScore = 0

    // Diffusion models often produce overly smooth gradients
    for (let i = 2; i < 254; i++) {
      const diff1 = Math.abs(hist[i] - hist[i - 1])
      const diff2 = Math.abs(hist[i] - hist[i + 1])
      if (diff1 < 10 && diff2 < 10) smoothnessScore++
    }

    return Math.min(1, smoothnessScore / 200)
  }

  // ── Embedding Analysis ─────────────────────────────────────────────────────

  private analyzeEmbeddings(data: ImageAnalysisData): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    // Compute simple image fingerprint
    const fingerprint = this.computeImageFingerprint(data)

    // Check for characteristics of known AI models
    const aiCharacteristics = this.checkAICharacteristics(fingerprint)

    if (aiCharacteristics.score > 0.5) {
      signals.push({
        name: 'AI Embedding Signature',
        category: 'embedding',
        value: aiCharacteristics.score,
        direction: 'supporting',
        severity: aiCharacteristics.score > 0.7 ? 'high' : 'medium',
        detail: aiCharacteristics.detail,
      })
    } else {
      counterSignals.push({
        name: 'Natural Embedding',
        category: 'embedding',
        value: 0.5,
        direction: 'counter',
        severity: 'low',
        detail: 'Image embedding characteristics appear natural',
      })
    }

    return { signals, counterSignals, evidence }
  }

  private computeImageFingerprint(data: ImageAnalysisData): number[] {
    const fingerprint: number[] = []
    const blockSize = Math.floor(Math.min(data.width, data.height) / 4)

    for (let gy = 0; gy < 4; gy++) {
      for (let gx = 0; gx < 4; gx++) {
        let sum = 0
        let count = 0
        for (let y = gy * blockSize; y < (gy + 1) * blockSize && y < data.height; y++) {
          for (let x = gx * blockSize; x < (gx + 1) * blockSize && x < data.width; x++) {
            sum += data.histogram[y * data.width + x] || 0
            count++
          }
        }
        fingerprint.push(count > 0 ? sum / count / 255 : 0)
      }
    }

    return fingerprint
  }

  private checkAICharacteristics(fingerprint: number[]): {
    score: number
    detail: string
  } {
    const variance = this.calculateVariance(fingerprint)
    const mean = fingerprint.reduce((a, b) => a + b, 0) / fingerprint.length

    // AI images often have lower variance in block averages
    if (variance < 0.01 && mean > 0.3 && mean < 0.7) {
      return {
        score: 0.6,
        detail: 'Block variance pattern consistent with AI generation',
      }
    }

    return { score: 0, detail: '' }
  }

  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    return values.reduce((a, v) => a + Math.pow(v - mean, 2), 0) / values.length
  }

  // ── Source Evidence ──────────────────────────────────────────────────────────

  private analyzeSourceEvidence(
    metadata: ImageInput['metadata'],
    _input: ImageInput,
  ): {
    signals: ModalitySignal[]
    counterSignals: ModalitySignal[]
    evidence: EvidenceItem[]
  } {
    const signals: ModalitySignal[] = []
    const counterSignals: ModalitySignal[] = []
    const evidence: EvidenceItem[] = []

    if (_input.sourceUrl) {
      counterSignals.push({
        name: 'Source URL Provided',
        category: 'source_evidence',
        value: 0.6,
        direction: 'counter',
        severity: 'medium',
        detail: 'Image has a source URL',
      })
    }

    // Check for reverse image search indicators
    if (metadata?.exif) {
      const exifStr = JSON.stringify(metadata.exif)
      if (exifStr.includes('Copyright') || exifStr.includes('Artist')) {
        counterSignals.push({
          name: 'Copyright Info Present',
          category: 'source_evidence',
          value: 0.4,
          direction: 'counter',
          severity: 'low',
          detail: 'Image contains copyright information',
        })
      }
    }

    return { signals, counterSignals, evidence }
  }
}
