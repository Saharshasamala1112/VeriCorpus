import { useState } from 'react'
import type { EvidenceItem } from '../../../types/explainability'

interface VideoVisualizationProps {
  evidence: EvidenceItem[]
  language: string
}

export default function VideoVisualization({
  evidence,
  language: _language,
}: VideoVisualizationProps) {
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null)
  const [showTimeline, setShowTimeline] = useState(true)

  const suspiciousFrames = evidence.filter((e) => e.type === 'suspicious_frame')
  const temporalSegments = evidence.filter((e) => e.type === 'temporal_segment')

  if (suspiciousFrames.length === 0 && temporalSegments.length === 0) return null

  const maxEndTime = Math.max(
    ...temporalSegments.map(
      (seg) =>
        ((seg.metadata?.startTime as number) ?? 0) + ((seg.metadata?.duration as number) ?? 0),
    ),
    ...suspiciousFrames.map((f) => (f.metadata?.timestamp as number) ?? 0),
    0,
  )

  return (
    <div className="space-y-4" role="region" aria-label="Video forensics visualization">
      {/* Timeline */}
      <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
            Video Timeline
          </h4>
          <button
            onClick={() => setShowTimeline(!showTimeline)}
            className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400 hover:bg-slate-700 transition-colors"
            aria-label={showTimeline ? 'Hide timeline' : 'Show timeline'}
          >
            {showTimeline ? 'Hide' : 'Show'} Timeline
          </button>
        </div>

        {showTimeline && maxEndTime > 0 && (
          <div className="overflow-hidden rounded-lg border border-slate-700/50 bg-slate-900 p-2">
            <div className="relative h-16">
              {/* Background bar */}
              <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-slate-700" />

              {/* Temporal segments */}
              {temporalSegments.map((seg, i) => {
                const startTime = (seg.metadata?.startTime as number) ?? 0
                const duration = (seg.metadata?.duration as number) ?? 0
                const left = (startTime / maxEndTime) * 100
                const width = (duration / maxEndTime) * 100
                return (
                  <div
                    key={`seg-${i}`}
                    className="absolute top-1/2 h-3 -translate-y-1/2 rounded bg-cyan-500/40"
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`Segment: ${startTime.toFixed(1)}s - ${(startTime + duration).toFixed(1)}s`}
                  />
                )
              })}

              {/* Suspicious frame markers */}
              {suspiciousFrames.map((frame, i) => {
                const timestamp = (frame.metadata?.timestamp as number) ?? 0
                const left = (timestamp / maxEndTime) * 100
                const isSelected = selectedFrame === i
                return (
                  <button
                    key={`marker-${i}`}
                    onClick={() => setSelectedFrame(selectedFrame === i ? null : i)}
                    className={`absolute top-0 h-full w-2 -translate-x-1/2 rounded transition-colors ${
                      isSelected ? 'bg-rose-500' : 'bg-amber-500'
                    } hover:bg-rose-400`}
                    style={{ left: `${left}%` }}
                    title={`Suspicious frame at ${timestamp.toFixed(2)}s`}
                    aria-label={`Select suspicious frame at ${timestamp.toFixed(2)}s`}
                  />
                )
              })}

              {/* Time axis */}
              <div className="absolute -bottom-4 left-0 right-0 flex justify-between text-[8px] text-slate-600">
                <span>0:00</span>
                <span>{`0:${maxEndTime.toFixed(0).padStart(2, '0')}`}</span>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 flex items-center gap-4 text-[10px] text-slate-500">
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-cyan-500/40" />
                <span>Temporal Segment</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="h-2 w-2 rounded-full bg-amber-500" />
                <span>Suspicious Frame</span>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="flex gap-4 mt-2 text-[11px] text-slate-500">
          <span>{suspiciousFrames.length} suspicious frame(s)</span>
          <span>{temporalSegments.length} temporal segment(s)</span>
          <span>Total duration: {maxEndTime.toFixed(1)}s</span>
        </div>
      </div>

      {/* Suspicious Frames */}
      {suspiciousFrames.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
              Suspicious Frames ({suspiciousFrames.length})
            </h4>
          </div>

          {/* Frame selector buttons */}
          <div className="flex flex-wrap gap-1 mb-3">
            {suspiciousFrames.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelectedFrame(selectedFrame === i ? null : i)}
                className={`rounded px-2 py-1 text-[10px] transition-colors ${
                  selectedFrame === i
                    ? 'bg-amber-500/30 text-amber-300'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
                aria-pressed={selectedFrame === i}
                aria-label={`Select frame ${i + 1}`}
              >
                Frame {i + 1}
              </button>
            ))}
          </div>

          {/* Frame details */}
          <div className="space-y-2">
            {suspiciousFrames.map((frame, i) => (
              <div
                key={`frame-${i}`}
                className={`rounded-lg p-3 transition-colors ${
                  selectedFrame === i
                    ? 'border border-amber-400/30 bg-amber-500/10'
                    : 'border border-amber-500/20 bg-amber-500/5'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-amber-300">Frame {i + 1}</span>
                    {typeof frame.metadata?.faceSwapDetected === 'boolean' &&
                      frame.metadata.faceSwapDetected && (
                        <span className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] text-red-300">
                          Face swap detected
                        </span>
                      )}
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {(frame.relevance * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">{frame.description}</p>
                <div className="flex flex-wrap gap-3 mt-1 text-[10px] text-slate-500">
                  {frame.metadata?.frameIndex != null && (
                    <span>Frame: #{frame.metadata.frameIndex as number}</span>
                  )}
                  {frame.metadata?.timestamp != null && (
                    <span>Time: {(frame.metadata.timestamp as number).toFixed(2)}s</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Temporal segments */}
      {temporalSegments.length > 0 && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-3">
            Temporal Segments ({temporalSegments.length})
          </h4>
          <div className="space-y-2">
            {temporalSegments.map((seg, i) => (
              <div key={`seg-${i}`} className="rounded bg-slate-950/30 p-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Segment {i + 1}</span>
                  <span className="text-[10px] text-slate-500">
                    {(seg.relevance * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1">{seg.description}</p>
                <div className="flex gap-4 mt-1 text-[10px] text-slate-500">
                  {seg.metadata?.startTime != null && (
                    <span>Start: {(seg.metadata.startTime as number).toFixed(1)}s</span>
                  )}
                  {seg.metadata?.duration != null && (
                    <span>Duration: {(seg.metadata.duration as number).toFixed(1)}s</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
