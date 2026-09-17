import { useState } from 'react'
import { Badge } from '../../ui'
import type { ExplanationResult } from '../../../types/explainability'
import { getExplanationTemplate } from '../../../i18n'

interface AudioExplanationProps {
  explanation: ExplanationResult
  language: string
}

export default function AudioExplanation({ explanation, language }: AudioExplanationProps) {
  const template = getExplanationTemplate(language)
  const [selectedSegment, setSelectedSegment] = useState<number | null>(null)
  const [showWaveform, setShowWaveform] = useState(true)

  const audioEvidence = explanation.evidence.filter((e) =>
    ['temporal_segment', 'spectrogram_region', 'acoustic_indicator'].includes(e.type),
  )

  if (audioEvidence.length === 0) {
    return <p className="text-xs text-slate-500 italic">{template.noExplanationAvailable}</p>
  }

  const temporalSegments = audioEvidence.filter((e) => e.type === 'temporal_segment')
  const spectrogramRegions = audioEvidence.filter((e) => e.type === 'spectrogram_region')

  // Calculate total duration for timeline
  const maxEndTime = temporalSegments.reduce((max, seg) => {
    const end = (seg.metadata?.endTime as number) ?? 0
    return end > max ? end : max
  }, 0)

  return (
    <div className="space-y-4">
      {/* Waveform Visualization */}
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
        <div className="flex items-center justify-between">
          <Badge variant="info" size="sm">
            Audio Waveform
          </Badge>
          <button
            onClick={() => setShowWaveform(!showWaveform)}
            className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700"
          >
            {showWaveform ? 'Hide' : 'Show'} Waveform
          </button>
        </div>

        {showWaveform && (
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900">
            <div className="relative h-24">
              {/* Simulated waveform */}
              <svg className="h-full w-full" viewBox="0 0 400 80" preserveAspectRatio="none">
                {Array.from({ length: 200 }).map((_, i) => {
                  const x = (i / 200) * 400
                  const height = Math.abs(Math.sin(i * 0.1) * 30 + Math.random() * 10)
                  // Highlight segments that have suspicious activity
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
              {/* Time markers */}
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

      {/* Temporal Timeline */}
      {temporalSegments.length > 0 && (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
          <div className="flex items-center justify-between">
            <Badge variant="info" size="sm">
              {template.audio.temporalSegmentsLabel} ({temporalSegments.length})
            </Badge>
            <span className="text-[11px] text-slate-500">
              {temporalSegments.length} segment(s) analyzed
            </span>
          </div>

          {/* Timeline Bar */}
          {maxEndTime > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900 p-2">
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
                      className={`absolute top-0 h-full rounded ${
                        selectedSegment === i ? 'bg-emerald-500/50' : 'bg-emerald-500/30'
                      } hover:bg-emerald-500/40`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={`Segment ${i + 1}: ${start.toFixed(1)}s - ${end.toFixed(1)}s`}
                    />
                  )
                })}
                {/* Time axis */}
                <div className="absolute -bottom-4 left-0 right-0 flex justify-between text-[8px] text-slate-600">
                  <span>0s</span>
                  <span>{maxEndTime.toFixed(0)}s</span>
                </div>
              </div>
            </div>
          )}

          {/* Segment Details */}
          <div className="mt-4 space-y-2">
            {temporalSegments.map((ev, i) => {
              const start = ev.metadata?.startTime as number | undefined
              const end = ev.metadata?.endTime as number | undefined
              const duration = start != null && end != null ? (end - start).toFixed(1) : null

              return (
                <div
                  key={`temp-${i}`}
                  className={`rounded-lg p-3 ${
                    selectedSegment === i
                      ? 'border border-emerald-400/30 bg-emerald-500/10'
                      : 'border border-emerald-500/20 bg-emerald-500/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="info" size="sm">
                        Segment {i + 1}
                      </Badge>
                      {duration && (
                        <Badge variant="default" size="sm">
                          {duration}s
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {(ev.relevance * 100).toFixed(0)}% relevance
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-300">{ev.description}</p>
                  <div className="mt-2 flex gap-4 text-[11px] text-slate-500">
                    {start != null && <span>Start: {start.toFixed(1)}s</span>}
                    {end != null && <span>End: {end.toFixed(1)}s</span>}
                    {ev.metadata?.energy != null && (
                      <span>Energy: {(ev.metadata.energy as number).toFixed(2)}</span>
                    )}
                    {!!ev.metadata?.anomalyType && (
                      <Badge variant="warning" size="sm">
                        {ev.metadata.anomalyType as string}
                      </Badge>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Spectrogram Regions */}
      {spectrogramRegions.length > 0 && (
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3">
          <div className="flex items-center justify-between">
            <Badge variant="info" size="sm">
              {template.audio.spectrogramRegionsLabel} ({spectrogramRegions.length})
            </Badge>
          </div>

          <div className="mt-2 space-y-2">
            {spectrogramRegions.map((ev, i) => (
              <div key={`spec-${i}`} className="rounded bg-slate-950/30 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Region {i + 1}</span>
                  <span className="text-[10px] text-slate-500">
                    {(ev.relevance * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{ev.description}</p>
                {!!ev.metadata?.frequencyRange && (
                  <div className="mt-1 flex gap-4 text-[10px] text-slate-500">
                    <span>
                      Freq: {(ev.metadata.frequencyRange as [number, number])[0]}Hz -{' '}
                      {(ev.metadata.frequencyRange as [number, number])[1]}Hz
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acoustic Indicators */}
      {audioEvidence
        .filter((e) => e.type === 'acoustic_indicator')
        .map((ev, i) => (
          <div
            key={`acou-${i}`}
            className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-3"
          >
            <div className="flex items-center justify-between">
              <Badge variant="default" size="sm">
                {template.audio.acousticIndicatorsLabel}
              </Badge>
              <span className="text-[11px] text-slate-500">{(ev.relevance * 100).toFixed(0)}%</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">{ev.description}</p>
          </div>
        ))}
    </div>
  )
}
