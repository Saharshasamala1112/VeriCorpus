import { useState } from 'react'
import type { EvidenceItem } from '../../../types/explainability'

interface ImageVisualizationProps {
  evidence: EvidenceItem[]
  language: string
}

export default function ImageVisualization({
  evidence,
  language: _language,
}: ImageVisualizationProps) {
  const [selectedRegion, setSelectedRegion] = useState<number | null>(null)
  const [showOverlay, setShowOverlay] = useState(true)

  const saliencyMap = evidence.find((e) => e.type === 'saliency_map')
  const suspiciousRegions = evidence.filter((e) => e.type === 'suspicious_region')
  const metadataAnomalies = evidence.filter((e) => e.type === 'metadata_anomaly')

  if (!saliencyMap && suspiciousRegions.length === 0 && metadataAnomalies.length === 0) return null

  return (
    <div className="space-y-4" role="region" aria-label="Image forensics visualization">
      {/* Saliency Map / Grad-CAM */}
      {saliencyMap && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-400">
              Saliency Map (Grad-CAM)
            </h4>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowOverlay(!showOverlay)}
                className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700 transition-colors"
                aria-label={showOverlay ? 'Hide heatmap overlay' : 'Show heatmap overlay'}
              >
                {showOverlay ? 'Hide' : 'Show'} Overlay
              </button>
              <span className="text-[11px] text-slate-500">
                {(saliencyMap.relevance * 100).toFixed(0)}% relevance
              </span>
            </div>
          </div>
          <p className="text-xs text-slate-300 mb-3">{saliencyMap.description}</p>

          {/* Heatmap visualization */}
          <div className="relative overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900">
            <div className="aspect-video flex items-center justify-center">
              {showOverlay ? (
                <div className="relative h-full w-full">
                  {/* Gradient heatmap overlay - represents model attention */}
                  <div className="absolute inset-0 bg-gradient-to-br from-red-500/30 via-yellow-500/20 to-green-500/10" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="grid grid-cols-3 gap-1 opacity-60">
                      {Array.from({ length: 9 }).map((_, i) => {
                        const isCenter = i === 4
                        const isAdjacent = i === 1 || i === 3 || i === 5 || i === 7
                        return (
                          <div
                            key={i}
                            className="h-8 w-8 rounded"
                            style={{
                              backgroundColor: isCenter
                                ? 'rgba(239, 68, 68, 0.7)'
                                : isAdjacent
                                  ? 'rgba(234, 179, 8, 0.5)'
                                  : 'rgba(34, 197, 94, 0.3)',
                            }}
                          />
                        )
                      })}
                    </div>
                  </div>
                  <div className="absolute bottom-1 right-1 rounded bg-black/60 px-1 py-0.5 text-[9px] text-slate-400">
                    Grad-CAM Heatmap
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Heatmap overlay hidden</p>
              )}
            </div>
          </div>

          {/* Metadata availability */}
          <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
            {typeof saliencyMap.metadata?.gradcamAvailable === 'boolean' &&
              saliencyMap.metadata.gradcamAvailable && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  Grad-CAM data available
                </span>
              )}
            {typeof saliencyMap.metadata?.confidenceMap === 'boolean' &&
              saliencyMap.metadata.confidenceMap && (
                <span className="flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                  Confidence map available
                </span>
              )}
          </div>
        </div>
      )}

      {/* Suspicious Regions */}
      {suspiciousRegions.length > 0 && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-400">
              Suspicious Regions ({suspiciousRegions.length})
            </h4>
          </div>

          {/* Region selector buttons */}
          <div className="flex flex-wrap gap-1 mb-3">
            {suspiciousRegions.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelectedRegion(selectedRegion === i ? null : i)}
                className={`rounded px-2 py-1 text-[10px] transition-colors ${
                  selectedRegion === i
                    ? 'bg-rose-500/30 text-rose-300'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
                aria-pressed={selectedRegion === i}
                aria-label={`Select region ${i + 1}`}
              >
                Region {i + 1}
              </button>
            ))}
          </div>

          {/* Region details */}
          <div className="space-y-2">
            {suspiciousRegions.map((region, i) => (
              <div
                key={`reg-${i}`}
                className={`rounded-lg p-3 transition-colors ${
                  selectedRegion === i
                    ? 'border border-rose-400/30 bg-rose-500/10'
                    : 'border border-rose-500/20 bg-rose-500/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-rose-300">Region {i + 1}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/30">
                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{ width: `${region.relevance * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {(region.relevance * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <p className="text-xs text-slate-300 mt-1">{region.description}</p>
                {typeof region.metadata?.region === 'object' && region.metadata.region !== null && (
                  <div className="flex gap-4 mt-1 text-[10px] text-slate-500">
                    <span>X: {Number((region.metadata.region as { x?: number }).x ?? 0)}</span>
                    <span>Y: {Number((region.metadata.region as { y?: number }).y ?? 0)}</span>
                    <span>
                      W: {Number((region.metadata.region as { width?: number }).width ?? 0)}
                    </span>
                    <span>
                      H: {Number((region.metadata.region as { height?: number }).height ?? 0)}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata Anomalies */}
      {metadataAnomalies.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">
            Metadata Anomalies
          </h4>
          <div className="space-y-2">
            {metadataAnomalies.map((anomaly, i) => (
              <div key={`meta-${i}`} className="rounded bg-slate-950/30 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Anomaly {i + 1}</span>
                  <span className="text-[10px] text-slate-500">
                    {(anomaly.relevance * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">{anomaly.description}</p>
                <p className="text-[11px] text-slate-500 mt-1 break-all">{anomaly.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
