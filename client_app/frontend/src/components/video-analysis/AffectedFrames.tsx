import React from 'react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface AffectedRegion {
  id: string
  x: number
  y: number
  width: number
  height: number
  explanation: string | null
}

interface AffectedFrame {
  frame_id: string
  frame_number: number
  timestamp: number
  thumbnail_url: string | null
  signal_type: string | null
  severity: string | null
  description: string | null
  regions: AffectedRegion[]
}

interface AffectedFramesProps {
  frames: AffectedFrame[]
  onFrameClick?: (frameId: string) => void
  onFrameHover?: (frameId: string | null) => void
  selectedFrameId?: string | null
  hoveredFrameId?: string | null
  currentTime?: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00.000'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const ms = Math.round((seconds - Math.floor(seconds)) * 1000)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`
}

function severityStyles(severity: string | null): {
  bg: string
  text: string
  dot: string
  ring: string
} {
  switch (severity?.toUpperCase()) {
    case 'CRITICAL':
      return {
        bg: 'bg-red-500/20',
        text: 'text-red-400',
        dot: 'bg-red-500',
        ring: 'ring-red-500/60',
      }
    case 'HIGH':
      return {
        bg: 'bg-orange-500/20',
        text: 'text-orange-400',
        dot: 'bg-orange-500',
        ring: 'ring-orange-500/60',
      }
    case 'MEDIUM':
      return {
        bg: 'bg-amber-500/20',
        text: 'text-amber-400',
        dot: 'bg-amber-500',
        ring: 'ring-amber-500/60',
      }
    case 'LOW':
      return {
        bg: 'bg-cyan-500/20',
        text: 'text-cyan-400',
        dot: 'bg-cyan-500',
        ring: 'ring-cyan-500/60',
      }
    default:
      return {
        bg: 'bg-gray-500/20',
        text: 'text-gray-400',
        dot: 'bg-gray-500',
        ring: 'ring-gray-500/60',
      }
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const SeverityBadge: React.FC<{ severity: string | null }> = ({ severity }) => {
  const styles = severityStyles(severity)
  const label = severity?.toUpperCase() ?? 'UNKNOWN'

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${styles.bg} ${styles.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${styles.dot}`} />
      {label}
    </span>
  )
}

const FrameThumbnail: React.FC<{ frame: AffectedFrame }> = ({ frame }) => {
  if (frame.thumbnail_url) {
    return (
      <img
        src={frame.thumbnail_url}
        alt={`Frame ${frame.frame_number}`}
        className="w-full h-full object-cover"
        loading="lazy"
      />
    )
  }

  return (
    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
      <div className="text-center">
        <svg
          className="w-8 h-8 text-gray-600 mx-auto mb-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <span className="text-xs text-gray-500 font-mono">#{frame.frame_number}</span>
      </div>
    </div>
  )
}

const FrameCard: React.FC<{
  frame: AffectedFrame
  isSelected: boolean
  isHovered: boolean
  onClick: () => void
  onMouseEnter: () => void
  onMouseLeave: () => void
}> = ({ frame, isSelected, isHovered, onClick, onMouseEnter, onMouseLeave }) => {
  const styles = severityStyles(frame.severity)

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={`
        group relative rounded-lg overflow-hidden border transition-all duration-200 text-left w-full
        ${
          isSelected
            ? `border-blue-500/70 ring-2 ${styles.ring} shadow-lg`
            : isHovered
              ? 'border-gray-500/60 bg-gray-800/80'
              : 'border-gray-700/40 bg-gray-800/50 hover:border-gray-600/60'
        }
      `}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video bg-gray-900">
        <FrameThumbnail frame={frame} />

        {/* Region count overlay */}
        {frame.regions.length > 0 && (
          <div className="absolute top-1.5 right-1.5 bg-black/60 backdrop-blur-sm rounded px-1.5 py-0.5 flex items-center gap-1">
            <svg
              className="w-3 h-3 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
              />
            </svg>
            <span className="text-[10px] text-gray-300 font-medium">{frame.regions.length}</span>
          </div>
        )}

        {/* Play icon overlay on hover */}
        <div
          className={`
          absolute inset-0 flex items-center justify-center bg-black/30 transition-opacity duration-200
          ${isHovered || isSelected ? 'opacity-100' : 'opacity-0'}
        `}
        >
          <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
            <svg className="w-4 h-4 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>

      {/* Card info */}
      <div className="p-2 space-y-1.5">
        <div className="flex items-center justify-between gap-1">
          <span className="text-[11px] font-mono text-gray-400 tabular-nums">
            #{frame.frame_number}
          </span>
          <span className="text-[11px] font-mono text-gray-500 tabular-nums">
            {formatTimestamp(frame.timestamp)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-1">
          <SeverityBadge severity={frame.severity} />
          {frame.signal_type && (
            <span className="text-[10px] text-gray-500 truncate" title={frame.signal_type}>
              {frame.signal_type}
            </span>
          )}
        </div>

        {frame.description && (
          <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
            {frame.description}
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Main Component ──────────────────────────────────────────────────────────

export const AffectedFrames: React.FC<AffectedFramesProps> = ({
  frames,
  onFrameClick,
  onFrameHover,
  selectedFrameId,
  hoveredFrameId,
}) => {
  if (frames.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center mb-3">
          <svg
            className="w-6 h-6 text-gray-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </div>
        <p className="text-sm text-gray-500">No affected frames detected</p>
      </div>
    )
  }

  return (
    <div className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Affected Frames ({frames.length})
        </h3>
      </div>

      {/* Frame grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {frames.map((frame) => (
          <FrameCard
            key={frame.frame_id}
            frame={frame}
            isSelected={selectedFrameId === frame.frame_id}
            isHovered={hoveredFrameId === frame.frame_id}
            onClick={() => onFrameClick?.(frame.frame_id)}
            onMouseEnter={() => onFrameHover?.(frame.frame_id)}
            onMouseLeave={() => onFrameHover?.(null)}
          />
        ))}
      </div>
    </div>
  )
}

export default AffectedFrames
