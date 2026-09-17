import { useRef, useState, useCallback, useMemo } from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Segment {
  id: string
  start_seconds: number
  end_seconds: number
  score: number | null
  severity: string | null
  signal_type: string | null
  explanation: string | null
}

interface TemporalTimelineProps {
  duration: number
  segments: Segment[]
  currentTime: number
  onSeek: (time: number) => void
  onSegmentClick: (segmentId: string) => void
  selectedSegmentId: string | null
  hoveredSegmentId: string | null
  onSegmentHover: (segmentId: string | null) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

function severityColor(severity: string | null): string {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
    case 'HIGH':
      return '#ef4444'
    case 'MEDIUM':
      return '#f59e0b'
    case 'LOW':
      return '#22d3ee'
    default:
      return '#6b7280'
  }
}

function severityLabel(severity: string | null): string {
  return severity?.toUpperCase() ?? 'UNKNOWN'
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TemporalTimeline({
  duration,
  segments,
  currentTime,
  onSeek,
  onSegmentClick,
  selectedSegmentId,
  hoveredSegmentId,
  onSegmentHover,
}: TemporalTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{
    x: number
    segment: Segment
  } | null>(null)

  const safeDuration = duration > 0 ? duration : 1

  // ─── Seeking ─────────────────────────────────────────────────────────────

  const seekFromEvent = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const track = trackRef.current
      if (!track || safeDuration <= 0) return
      const rect = track.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onSeek(ratio * safeDuration)
    },
    [safeDuration, onSeek],
  )

  // ─── Segment geometry ────────────────────────────────────────────────────

  const segmentGeos = useMemo(() => {
    return segments.map((seg) => {
      const left = (seg.start_seconds / safeDuration) * 100
      const width = ((seg.end_seconds - seg.start_seconds) / safeDuration) * 100
      return { ...seg, left, width }
    })
  }, [segments, safeDuration])

  // ─── Playhead position ───────────────────────────────────────────────────

  const playheadPercent = safeDuration > 0 ? (currentTime / safeDuration) * 100 : 0

  // ─── Segment hover handlers ──────────────────────────────────────────────

  const handleSegmentEnter = useCallback(
    (seg: Segment, e: React.MouseEvent) => {
      onSegmentHover(seg.id)
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setTooltip({ x: rect.left + rect.width / 2, segment: seg })
    },
    [onSegmentHover],
  )

  const handleSegmentLeave = useCallback(() => {
    onSegmentHover(null)
    setTooltip(null)
  }, [onSegmentHover])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="w-full select-none">
      {/* Time labels */}
      <div className="flex justify-between items-center mb-1.5 px-0.5">
        <span className="text-[11px] font-mono text-slate-400 tabular-nums">{formatTime(0)}</span>
        <span className="text-[11px] font-mono text-slate-500 tabular-nums">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
          {formatTime(duration)}
        </span>
      </div>

      {/* Timeline track */}
      <div
        ref={trackRef}
        className="relative h-10 bg-slate-800 rounded-lg cursor-pointer overflow-hidden group"
        onClick={seekFromEvent}
      >
        {/* Background grid ticks */}
        <div className="absolute inset-0 flex items-end pointer-events-none">
          {Array.from({ length: 21 }, (_, i) => (
            <div
              key={i}
              className="absolute bottom-0 w-px bg-slate-700/50"
              style={{
                left: `${(i / 20) * 100}%`,
                height: i % 5 === 0 ? '10px' : '5px',
              }}
            />
          ))}
        </div>

        {/* Segment overlays */}
        {segmentGeos.map((seg) => {
          const color = severityColor(seg.severity)
          const isSelected = selectedSegmentId === seg.id
          const isHovered = hoveredSegmentId === seg.id

          return (
            <div
              key={seg.id}
              className="absolute top-1 bottom-1 rounded cursor-pointer transition-all duration-150"
              style={{
                left: `${seg.left}%`,
                width: `${Math.max(seg.width, 0.3)}%`,
                backgroundColor: color,
                opacity: isHovered ? 0.95 : isSelected ? 0.85 : 0.55,
                boxShadow: isSelected
                  ? `0 0 0 2px ${color}, 0 0 8px ${color}40`
                  : isHovered
                    ? `0 0 0 1px ${color}80`
                    : 'none',
                zIndex: isSelected ? 20 : isHovered ? 15 : 10,
              }}
              onClick={(e) => {
                e.stopPropagation()
                onSegmentClick(seg.id)
              }}
              onMouseEnter={(e) => handleSegmentEnter(seg, e)}
              onMouseLeave={handleSegmentLeave}
            />
          )
        })}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none transition-[left] duration-75 ease-linear"
          style={{ left: `${playheadPercent}%` }}
        >
          {/* Playhead triangle */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2">
            <div className="w-2.5 h-2.5 bg-white rotate-45 rounded-sm shadow-md" />
          </div>
          {/* Playhead line glow */}
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-white/30 blur-sm" />
        </div>

        {/* Hover seek indicator */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <div className="absolute bottom-full mb-1 hidden group-hover:block" id="seek-preview" />
        </div>
      </div>

      {/* Tooltip portal */}
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltip.x,
            top: -8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 shadow-xl max-w-[240px]">
            <div className="flex items-center gap-1.5 mb-1">
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: severityColor(tooltip.segment.severity) }}
              />
              <span className="text-[11px] font-semibold text-white">
                {severityLabel(tooltip.segment.severity)}
              </span>
              {tooltip.segment.signal_type && (
                <span className="text-[10px] text-slate-400 ml-auto">
                  {tooltip.segment.signal_type}
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-300 font-mono tabular-nums">
              {formatTime(tooltip.segment.start_seconds)} —{' '}
              {formatTime(tooltip.segment.end_seconds)}
            </div>
            {tooltip.segment.score != null && (
              <div className="text-[10px] text-slate-400 mt-0.5">
                Confidence: {(tooltip.segment.score * 100).toFixed(0)}%
              </div>
            )}
            {tooltip.segment.explanation && (
              <div className="text-[11px] text-slate-300 mt-1 leading-snug border-t border-slate-700/50 pt-1">
                {tooltip.segment.explanation}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Severity legend */}
      <div className="flex items-center gap-4 mt-2 px-0.5">
        {[
          { label: 'Critical/High', color: '#ef4444' },
          { label: 'Medium', color: '#f59e0b' },
          { label: 'Low', color: '#22d3ee' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: item.color, opacity: 0.7 }}
            />
            <span className="text-[10px] text-slate-500">{item.label}</span>
          </div>
        ))}
        {segments.length > 0 && (
          <span className="text-[10px] text-slate-600 ml-auto">
            {segments.length} segment{segments.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  )
}
