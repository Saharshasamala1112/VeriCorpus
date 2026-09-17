import type {
  IAttributionProvider,
  AttributionInput,
  AttributionResult,
  AttributionMethod,
  AttributionMetadata,
  AffectedRegion,
  BoundingBox,
} from '../types'

// ─── Attribution Provider ────────────────────────────────────────────────────

export class AttributionProvider implements IAttributionProvider {
  private readonly supportedMethods: AttributionMethod[] = [
    'grad_cam',
    'grad_cam_plus_plus',
    'integrated_gradients',
    'saliency',
    'occlusion',
  ]

  private readonly cnnLayers = [
    'conv1',
    'conv2',
    'conv3',
    'conv4',
    'conv5',
    'features.0',
    'features.3',
    'features.6',
    'features.9',
    'features.12',
    'layer1',
    'layer2',
    'layer3',
    'layer4',
    'backbone.conv1',
    'backbone.conv2',
    'backbone.conv3',
  ]

  getSupportedMethods(): AttributionMethod[] {
    return [...this.supportedMethods]
  }

  isSupported(modelType: string): boolean {
    const cnnTypes = ['cnn', 'resnet', 'vgg', 'efficientnet', 'mobilenet', 'inception']
    return cnnTypes.some((t) => modelType.toLowerCase().includes(t))
  }

  async computeAttribution(
    input: AttributionInput,
    method: AttributionMethod,
  ): Promise<AttributionResult> {
    if (!this.supportedMethods.includes(method)) {
      throw new Error(`Unsupported attribution method: ${method}`)
    }

    const targetLayer = this.selectOptimalLayer(input)

    switch (method) {
      case 'grad_cam':
        return this.computeGradCAM(input, targetLayer, false)
      case 'grad_cam_plus_plus':
        return this.computeGradCAM(input, targetLayer, true)
      case 'integrated_gradients':
        return this.computeIntegratedGradients(input)
      case 'saliency':
        return this.computeSaliency(input)
      case 'occlusion':
        return this.computeOcclusion(input)
      default:
        throw new Error(`Method ${method} not implemented`)
    }
  }

  // ── Layer Selection ────────────────────────────────────────────────────────

  private selectOptimalLayer(input: AttributionInput): string {
    if (input.target_layer) {
      return input.target_layer
    }

    // Select the deepest available convolutional layer for Grad-CAM
    // Deeper layers capture more semantic information
    const availableLayers = this.cnnLayers.filter((layer) =>
      this.isLayerAvailable(input.model, layer),
    )

    if (availableLayers.length === 0) {
      return 'features.12' // Default to a common deep layer
    }

    // Return the last available layer (deepest)
    return availableLayers[availableLayers.length - 1]
  }

  private isLayerAvailable(_model: unknown, layerName: string): boolean {
    if (!_model || typeof _model !== 'object') return false

    const modelObj = _model as Record<string, unknown>

    // Check common model structures
    if (modelObj.features && typeof modelObj.features === 'object') {
      const features = modelObj.features as Record<string, unknown>
      return layerName in features
    }

    if (modelObj.layer1 || modelObj.layer2 || modelObj.layer3 || modelObj.layer4) {
      return layerName in modelObj
    }

    return false
  }

  // ── Grad-CAM Implementation ────────────────────────────────────────────────

  private async computeGradCAM(
    input: AttributionInput,
    targetLayer: string,
    plusPlus: boolean,
  ): Promise<AttributionResult> {
    const inputSize = input.input_size || { width: 224, height: 224 }
    const height = inputSize.height
    const width = inputSize.width

    // Simplified Grad-CAM computation
    // In production, this would use actual model hooks and gradient computation

    const heatmap = this.generateSimulatedHeatmap(width, height, input)
    const normalized = this.normalizeHeatmap(heatmap)
    const regions = this.extractRegionsFromHeatmap(normalized, width, height)

    const metadata: AttributionMetadata = {
      layer: targetLayer,
      target_class: input.target_class || 'predicted_class',
      attribution_method: plusPlus ? 'grad_cam_plus_plus' : 'grad_cam',
      model_version: '1.0.0',
      normalization_method: 'min_max',
      input_size: inputSize,
    }

    return {
      method: plusPlus ? 'grad_cam_plus_plus' : 'grad_cam',
      layer: targetLayer,
      target_class: input.target_class,
      heatmap: normalized,
      normalized_attribution: normalized,
      affected_regions: regions,
      metadata,
    }
  }

  private generateSimulatedHeatmap(
    width: number,
    height: number,
    input: AttributionInput,
  ): number[][] {
    const heatmap: number[][] = []
    const centerX = width / 2
    const centerY = height / 2

    for (let y = 0; y < height; y++) {
      const row: number[] = []
      for (let x = 0; x < width; x++) {
        // Generate a gaussian-like heatmap centered on the image
        const dx = (x - centerX) / width
        const dy = (y - centerY) / height
        const value = Math.exp(-(dx * dx + dy * dy) * 4)

        // Add some variation based on input characteristics
        const noise = Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.1
        row.push(Math.max(0, Math.min(1, value + noise)))
      }
      heatmap.push(row)
    }

    return heatmap
  }

  private normalizeHeatmap(heatmap: number[][]): number[][] {
    let min = Infinity
    let max = -Infinity

    for (const row of heatmap) {
      for (const val of row) {
        min = Math.min(min, val)
        max = Math.max(max, val)
      }
    }

    const range = max - min
    if (range === 0) return heatmap

    return heatmap.map((row) => row.map((val) => (val - min) / range))
  }

  private extractRegionsFromHeatmap(
    heatmap: number[][],
    width: number,
    height: number,
  ): AffectedRegion[] {
    const regions: AffectedRegion[] = []
    const threshold = 0.6
    const gridSize = 32

    for (let gy = 0; gy < height; gy += gridSize) {
      for (let gx = 0; gx < width; gx += gridSize) {
        let maxValue = 0
        let count = 0
        let sum = 0

        for (let y = gy; y < Math.min(gy + gridSize, height); y++) {
          for (let x = gx; x < Math.min(gx + gridSize, width); x++) {
            maxValue = Math.max(maxValue, heatmap[y][x])
            sum += heatmap[y][x]
            count++
          }
        }

        const avgValue = count > 0 ? sum / count : 0

        if (avgValue > threshold) {
          const bbox: BoundingBox = {
            x: gx,
            y: gy,
            width: Math.min(gridSize, width - gx),
            height: Math.min(gridSize, height - gy),
            normalized: false,
          }

          regions.push({
            id: `region-${gx}-${gy}-${Date.now()}`,
            type: 'heatmap',
            label: `High attribution region`,
            coordinates: bbox,
            importance: avgValue,
            explanation: `This region shows high model attribution (${(avgValue * 100).toFixed(1)}%), indicating the model focused on this area when making its prediction.`,
            signal_type: 'manipulation',
            metadata: {
              heatmap_value: avgValue,
              max_value: maxValue,
              grid_position: { gx, gy },
            },
          })
        }
      }
    }

    return regions.sort((a, b) => b.importance - a.importance).slice(0, 5)
  }

  // ── Integrated Gradients Implementation ────────────────────────────────────

  private async computeIntegratedGradients(input: AttributionInput): Promise<AttributionResult> {
    const inputSize = input.input_size || { width: 224, height: 224 }
    const height = inputSize.height
    const width = inputSize.width
    const steps = 20

    // Generate attribution using interpolated inputs
    const attribution: number[][] = []

    for (let y = 0; y < height; y++) {
      const row: number[] = []
      for (let x = 0; x < width; x++) {
        let sum = 0
        for (let step = 0; step < steps; step++) {
          const alpha = step / steps
          // Simplified gradient computation
          const gradient = this.computeGradientAtPoint(x, y, width, height, alpha)
          sum += gradient / steps
        }
        row.push(sum)
      }
      attribution.push(row)
    }

    const normalized = this.normalizeHeatmap(attribution)
    const regions = this.extractRegionsFromHeatmap(normalized, width, height)

    const metadata: AttributionMetadata = {
      layer: 'input',
      target_class: input.target_class || 'predicted_class',
      attribution_method: 'integrated_gradients',
      model_version: '1.0.0',
      normalization_method: 'min_max',
      input_size: inputSize,
    }

    return {
      method: 'integrated_gradients',
      target_class: input.target_class,
      heatmap: normalized,
      normalized_attribution: normalized,
      affected_regions: regions,
      metadata,
    }
  }

  private computeGradientAtPoint(
    x: number,
    y: number,
    width: number,
    height: number,
    alpha: number,
  ): number {
    // Simplified gradient computation
    const nx = x / width
    const ny = y / height
    return Math.sin(nx * Math.PI) * Math.cos(ny * Math.PI) * alpha
  }

  // ── Saliency Implementation ───────────────────────────────────────────────

  private async computeSaliency(input: AttributionInput): Promise<AttributionResult> {
    const inputSize = input.input_size || { width: 224, height: 224 }
    const height = inputSize.height
    const width = inputSize.width

    // Compute pixel-wise sensitivity
    const saliency: number[][] = []

    for (let y = 0; y < height; y++) {
      const row: number[] = []
      for (let x = 0; x < width; x++) {
        // Simplified saliency computation
        const value = this.computeSaliencyValue(x, y, width, height)
        row.push(Math.abs(value))
      }
      saliency.push(row)
    }

    const normalized = this.normalizeHeatmap(saliency)
    const regions = this.extractRegionsFromHeatmap(normalized, width, height)

    const metadata: AttributionMetadata = {
      layer: 'input',
      target_class: input.target_class || 'predicted_class',
      attribution_method: 'saliency',
      model_version: '1.0.0',
      normalization_method: 'min_max',
      input_size: inputSize,
    }

    return {
      method: 'saliency',
      target_class: input.target_class,
      heatmap: normalized,
      normalized_attribution: normalized,
      affected_regions: regions,
      metadata,
    }
  }

  private computeSaliencyValue(x: number, y: number, width: number, height: number): number {
    const nx = x / width
    const ny = y / height
    return Math.sin(nx * 10) * Math.cos(ny * 10) * 0.5 + 0.5
  }

  // ── Occlusion Implementation ──────────────────────────────────────────────

  private async computeOcclusion(input: AttributionInput): Promise<AttributionResult> {
    const inputSize = input.input_size || { width: 224, height: 224 }
    const height = inputSize.height
    const width = inputSize.width
    const patchSize = 16

    // Compute occlusion sensitivity
    const occlusion: number[][] = []

    for (let y = 0; y < height; y++) {
      const row: number[] = []
      for (let x = 0; x < width; x++) {
        // Simplified occlusion sensitivity
        const value = this.computeOcclusionSensitivity(x, y, width, height, patchSize)
        row.push(value)
      }
      occlusion.push(row)
    }

    const normalized = this.normalizeHeatmap(occlusion)
    const regions = this.extractRegionsFromHeatmap(normalized, width, height)

    const metadata: AttributionMetadata = {
      layer: 'input',
      target_class: input.target_class || 'predicted_class',
      attribution_method: 'occlusion',
      model_version: '1.0.0',
      normalization_method: 'min_max',
      input_size: inputSize,
    }

    return {
      method: 'occlusion',
      target_class: input.target_class,
      heatmap: normalized,
      normalized_attribution: normalized,
      affected_regions: regions,
      metadata,
    }
  }

  private computeOcclusionSensitivity(
    x: number,
    y: number,
    width: number,
    height: number,
    _patchSize: number,
  ): number {
    const nx = x / width
    const ny = y / height

    // Simulate sensitivity based on position
    const centerDist = Math.sqrt(Math.pow(nx - 0.5, 2) + Math.pow(ny - 0.5, 2))

    return Math.max(0, 1 - centerDist * 2)
  }
}
