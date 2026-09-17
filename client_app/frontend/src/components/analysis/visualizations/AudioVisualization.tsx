import { useState } from 'react'
import type { EvidenceItem } from '../../../types/explainability'

interface AudioVisualizationProps {
  evidence: EvidenceItem[]
  language: string
}

export default function AudioVisualization({
  evidence,
  language: _language,
}: AudioVisualizationProps) {
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null)
  const [showWaveform, setShowWaveform] = useState(true)

  const temporalSegments = evidence.filter((e) => e.type === 'temporal_segment')
  const spectrogramRegions = evidence.filter((e) => e.type === 'spectrogram_region')
  const acousticIndicators = evidence.filter((e) => e.type === 'acoustic_indicator')

  if (
    temporalSegments.length === 0 &&
    spectrogramRegions.length === 0 &&
    acousticIndicators.length === 0
  )
    return null

  const maxEndTime = temporalSegments.reduce((max, seg) => {
    const end = (seg.metadata?.endTime as number) ?? 0
    return end > max ? end : max
  }, 0)

  return (
    <div className="space-y-4" role="region" aria-label="Audio forensics visualization">
      {/* Waveform */}
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
            Audio Waveform
          </h4>
          <button
            onClick={() => setShowWaveform(!showWaveform)}
            className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700 transition-colors"
            aria-label={showWaveform ? 'Hide waveform' : 'Show waveform'}
          >
            {showWaveform ? 'Hide' : 'Show'} Waveform
          </button>
        </div>

        {showWaveform && (
          <div className="overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900">
            <div className="relative h-24">
              <svg className="h-full w-full" viewBox="0 0 400 80" preserveAspectRatio="none">
                {Array.from({ length: 200 }).map((_, i) => {
                  const x = (i / 200) * 400
                  const height = Math.abs(Math.sin(i * 0.1) * 30 + Math.random() * 10)
                  const isAnomalous = temporalSegments.some((seg) => {
                    const start = (seg.metadata?.startTime as number) ?? 0
                    const end = (seg.metadata?.endTime as number) ?? 0
                    const timePos = (i / 200) * maxEndTime
                    return timePos >= start && timePos <= end
                  })
                  return (
                    <rect
                      key={i}
                      x={x}
                      y={40 - height}
                      width={2}
                      height={height * 2}
                      fill={isAnomalous ? '#ef4444' : '#06b6d4'}
                      opacity={isAnomalous ? 0.8 : 0.5}
                    />
                  )
                })}
              </svg>
              <div className="absolute bottom-0 left-0 right-0 flex justify-between px-2 pb-1">
                <span className="text-[9px] text-slate-500">0:00</span>
                <span className="text-[9px] text-slate-500">
                  {maxEndTime > 0 ? `0:${maxEndTime.toFixed(0).padStart(2, '0')}` : '0:00'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Temporal Segments with timeline */}
      {temporalSegments.length > 0 && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Temporal Segments ({temporalSegments.length})
            </h4>
          </div>

          {/* Timeline bar */}
          {maxEndTime > 0 && (
            <div className="overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900 p-2 mb-3">
              <div className="relative h-8">
                {temporalSegments.map((seg, i) => {
                  const start = (seg.metadata?.startTime as number) ?? 0
                  const end = (seg.metadata?.endTime as number) ?? 0
                  const left = (start / maxEndTime) * 100
                  const width = ((end - start) / maxEndTime) * 100
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedSegment(selectedSegment === i ? null : i)}
                      className={`absolute top-0 h-full rounded transition-colors ${
                        selectedSegment === i ? 'bg-emerald-500/50' : 'bg-emerald-500/30'
                      } hover:bg-emerald-500/40`}
                      style={{ left: `${left}%`, width: `${Math.max(width, 2)}%` }}
                      title={`Segment ${i + 1}: ${start.toFixed(1)}s - ${end.toFixed(1)}s`}
                      aria-label={`Select segment ${i + 1}, ${start.toFixed(1)}s to ${end.toFixed(1)}s`}
                    />
                  )
                })}
                <div className="absolute -bottom-4 left-0 right-0 flex justify-between text-[8px] text-slate-600">
                  <span>0s</span>
                  <span>{maxEndTime.toFixed(0)}s</span>
                </div>
              </div>
            </div>
          )}

          {/* Segment details */}
          <div className="space-y-2 mt-4">
            {temporalSegments.map((seg, i) => {
              const start = seg.metadata?.startTime as number | undefined
              const end = seg.metadata?.endTime as number | undefined
              const duration = start != null && end != null ? (end - start).toFixed(1) : null

              return (
                <div
                  key={`temp-${i}`}
                  className={`rounded-lg p-3 transition-colors ${
                    selectedSegment === i
                      ? 'border border-emerald-400/30 bg-emerald-500/10'
                      : 'border border-emerald-500/20 bg-emerald-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                        Segment {i + 1}
                      </span>
                      {duration && (
                        <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-300">
                          {duration}s
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {(seg.relevance * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1">{seg.description}</p>
                  <div className="flex gap-4 mt-1 text-[10px] text-slate-500">
                    {start != null && <span>Start: {start.toFixed(1)}s</span>}
                    {end != null && <span>End: {end.toFixed(1)}s</span>}
                    {seg.metadata?.energy != null && (
                      <span>Energy: {Number(seg.metadata.energy).toFixed(2)}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Spectrogram regions */}
      {spectrogramRegions.length > 0 && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-purple-400 mb-3">
            Spectrogram Regions ({spectrogramRegions.length})
          </h4>
          <div className="space-y-2">
            {spectrogramRegions.map((region, i) => (
              <div key={`spec-${i}`} className="rounded bg-slate-950/30 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Region {i + 1}</span>
                  <span className="text-[10px] text-slate-500">
                    {(region.relevance * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">{region.description}</p>
                {Array.isArray(region.metadata?.frequencyRange) &&
                  region.metadata.frequencyRange.length >= 2 && (
                    <div className="flex gap-4 mt-1 text-[10px] text-slate-500">
                      <span>
                        Freq: {Number(region.metadata.frequencyRange[0])}Hz -{' '}
                        {Number(region.metadata.frequencyRange[1])}Hz
                      </span>
                    </div>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acoustic indicators */}
      {acousticIndicators.length > 0 && (
        <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Acoustic Indicators
          </h4>
          <div className="space-y-2">
            {acousticIndicators.map((indicator, i) => (
              <div key={`acou-${i}`} className="rounded bg-slate-900/50 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Indicator {i + 1}</span>
                  <span className="text-[10px] text-slate-500">
                    {(indicator.relevance * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">{indicator.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
