import { useState } from 'react'
import { Badge } from '../../ui'
import type { ExplanationResult } from '../../../types/explainability'
import { getExplanationTemplate } from '../../../i18n'

interface ImageExplanationProps {
  explanation: ExplanationResult
  language: string
}

export default function ImageExplanation({ explanation, language }: ImageExplanationProps) {
  const template = getExplanationTemplate(language)
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null)
  const [showGradCamOverlay, setShowGradCamOverlay] = useState(true)

  const imageEvidence = explanation.evidence.filter((e) =>
    ['saliency_map', 'suspicious_region', 'metadata_anomaly'].includes(e.type),
  )

  if (imageEvidence.length === 0) {
    return <p className="text-xs text-slate-500 italic">{template.noExplanationAvailable}</p>
  }

  const saliencyMap = imageEvidence.find((e) => e.type === 'saliency_map')
  const suspiciousRegions = imageEvidence.filter((e) => e.type === 'suspicious_region')

  return (
    <div className="space-y-4">
      {/* Interactive Grad-CAM Visualization */}
      {saliencyMap && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
          <div className="flex items-center justify-between">
            <Badge variant="info" size="sm">
              {template.image.saliencyMapLabel}
            </Badge>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowGradCamOverlay(!showGradCamOverlay)}
                className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700"
              >
                {showGradCamOverlay ? 'Hide Overlay' : 'Show Overlay'}
              </button>
              <span className="text-[11px] text-slate-500">
                {(saliencyMap.relevance * 100).toFixed(0)}% relevance
              </span>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-300">{saliencyMap.description}</p>

          {/* Grad-CAM Overlay Canvas */}
          <div className="relative mt-3 overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900">
            <div className="aspect-video flex items-center justify-center">
              {showGradCamOverlay ? (
                <div className="relative h-full w-full">
                  {/* Simulated heatmap overlay */}
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/30 via-yellow-500/20 to-green-500/10" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="grid grid-cols-3 gap-1 opacity-60">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-8 w-8 rounded"
                          style={{
                            backgroundColor:
                              i === 4
                                ? 'rgba(239, 68, 68, 0.7)'
                                : i === 1 || i === 3 || i === 5 || i === 7
                                  ? 'rgba(234, 179, 8, 0.5)'
                                  : 'rgba(34, 197, 94, 0.3)',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-slate-400">
                    Grad-CAM Heatmap
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Grad-CAM overlay hidden</p>
              )}
            </div>
          </div>

          {!!saliencyMap.metadata?.gradcamAvailable && (
            <div className="mt-2 rounded bg-slate-950/50 p-2">
              <p className="text-[11px] text-slate-500">
                Grad-CAM visualization data is available in the model pipeline output.
              </p>
            </div>
          )}
          {!!saliencyMap.metadata?.confidenceMap && (
            <div className="mt-2 rounded bg-slate-950/50 p-2">
              <p className="text-[11px] text-slate-500">
                Confidence map data is available for region-level analysis.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Suspicious Regions with Interactive Selection */}
      {suspiciousRegions.length > 0 && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
          <div className="flex items-center justify-between">
            <Badge variant="danger" size="sm">
              {template.image.suspiciousRegionsLabel} ({suspiciousRegions.length})
            </Badge>
            <span className="text-[11px] text-slate-500">
              {suspiciousRegions.length} region(s) flagged
            </span>
          </div>

          {/* Region Selection Buttons */}
          <div className="mt-2 flex flex-wrap gap-1">
            {suspiciousRegions.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelectedRegion(selectedRegion === i ? null : i)}
                className={`rounded px-2 py-1 text-[10px] ${
                  selectedRegion === i
                    ? 'bg-rose-500/30 text-rose-300'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Region {i + 1}
              </button>
            ))}
          </div>

          {/* Selected Region Details */}
          {selectedRegion !== null && suspiciousRegions[selectedRegion] && (
            <div className="mt-2 rounded bg-slate-950/50 p-2">
              <p className="text-[11px] text-slate-400">
                {suspiciousRegions[selectedRegion].description}
              </p>
              {!!suspiciousRegions[selectedRegion].metadata?.region && (
                <div className="mt-1 flex gap-4 text-[10px] text-slate-500">
                  <span>
                    X: {(suspiciousRegions[selectedRegion].metadata.region as { x: number }).x}
                  </span>
                  <span>
                    Y: {(suspiciousRegions[selectedRegion].metadata.region as { y: number }).y}
                  </span>
                  <span>
                    W:{' '}
                    {(suspiciousRegions[selectedRegion].metadata.region as { width: number }).width}
                  </span>
                  <span>
                    H:{' '}
                    {
                      (suspiciousRegions[selectedRegion].metadata.region as { height: number })
                        .height
                    }
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Region List */}
          <div className="mt-2 space-y-1">
            {suspiciousRegions.map((ev, i) => (
              <div
                key={`reg-${i}`}
                className={`rounded p-2 ${
                  selectedRegion === i ? 'bg-rose-500/10' : 'bg-slate-950/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Region {i + 1}</span>
                  <span className="text-[10px] text-slate-500">
                    {(ev.relevance * 100).toFixed(0)}% confidence
                  </span>
                </div>
                {!!ev.metadata?.region && (
                  <div className="mt-1 flex gap-4 text-[10px] text-slate-500">
                    <span>X: {(ev.metadata.region as { x: number }).x}</span>
                    <span>Y: {(ev.metadata.region as { y: number }).y}</span>
                    <span>W: {(ev.metadata.region as { width: number }).width}</span>
                    <span>H: {(ev.metadata.region as { height: number }).height}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata Anomalies */}
      {imageEvidence
        .filter((e) => e.type === 'metadata_anomaly')
        .map((ev, i) => (
          <div
            key={`meta-${i}`}
            className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
          >
            <div className="flex items-center justify-between">
              <Badge variant="warning" size="sm">
                {template.image.metadataAnomaliesLabel}
              </Badge>
              <span className="text-[11px] text-slate-500">{(ev.relevance * 100).toFixed(0)}%</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">{ev.description}</p>
            <p className="mt-1 break-all text-[11px] text-slate-500">{ev.content}</p>
          </div>
        ))}
    </div>
  )
}
