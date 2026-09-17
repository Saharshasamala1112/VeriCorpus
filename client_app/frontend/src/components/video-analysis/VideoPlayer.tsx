import { useRef, useState, useEffect, useCallback } from 'react'
import type {
  AffectedSegmentResponse,
  VideoFrameResponse,
  VideoMetadataResponse,
} from '../../types/video-analysis'

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoPlayerProps {
  videoUrl?: string
  metadata?: VideoMetadataResponse
  segments?: AffectedSegmentResponse[]
  frames?: VideoFrameResponse[]
  currentTime: number
  isPlaying: boolean
  onTimeUpdate: (time: number) => void
  onPlay: () => void
  onPause: () => void
  onSeek: (time: number) => void
  onDurationChange: (duration: number) => void
  selectedSegmentId?: string | null
  hoveredSegmentId?: string | null
  onSegmentClick?: (segmentId: string) => void
  onSegmentHover?: (segmentId: string | null) => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function severityColor(severity: string): string {
  switch (severity) {
    case 'CRITICAL':
      return '#ef4444'
    case 'HIGH':
      return '#f97316'
    case 'MEDIUM':
      return '#f59e0b'
    case 'LOW':
      return '#22d3ee'
    default:
      return '#6b7280'
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VideoPlayer({
  videoUrl,
  metadata: _metadata,
  segments = [],
  frames = [],
  currentTime,
  isPlaying,
  onTimeUpdate,
  onPlay,
  onPause,
  onSeek,
  onDurationChange,
  selectedSegmentId,
  hoveredSegmentId,
  onSegmentClick,
  onSegmentHover,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)

  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [playbackRate, setPlaybackRate] = useState(1)
  const [showSpeedMenu, setShowSpeedMenu] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [duration, setDuration] = useState(0)

  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Video Sync ──────────────────────────────────────────────────────────

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      setDuration(video.duration)
      onDurationChange(video.duration)
    }

    const handleTimeUpdate = () => {
      if (!isDragging) {
        onTimeUpdate(video.currentTime)
      }
    }

    const handleEnded = () => {
      onPause()
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('ended', handleEnded)

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('ended', handleEnded)
    }
  }, [isDragging, onTimeUpdate, onDurationChange, onPause])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (isPlaying) {
      video.play().catch(() => onPause())
    } else {
      video.pause()
    }
  }, [isPlaying, onPause])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (Math.abs(video.currentTime - currentTime) > 0.5) {
      video.currentTime = currentTime
    }
  }, [currentTime])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.volume = volume
    video.muted = isMuted
  }, [volume, isMuted])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.playbackRate = playbackRate
  }, [playbackRate])

  // ─── Fullscreen ──────────────────────────────────────────────────────────

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      container.requestFullscreen()
    }
  }, [])

  // ─── Controls Visibility ─────────────────────────────────────────────────

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true)
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current)
    if (isPlaying) {
      controlsTimeout.current = setTimeout(() => setShowControls(false), 3000)
    }
  }, [isPlaying])

  useEffect(() => {
    if (!isPlaying) setShowControls(true)
  }, [isPlaying])

  // ─── Seek ────────────────────────────────────────────────────────────────

  const handleProgressClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const bar = progressRef.current
      if (!bar || !duration) return
      const rect = bar.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      onSeek(ratio * duration)
    },
    [duration, onSeek],
  )

  const handleProgressMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setIsDragging(true)
      handleProgressClick(e)

      const handleMouseMove = (ev: MouseEvent) => {
        const bar = progressRef.current
        if (!bar || !duration) return
        const rect = bar.getBoundingClientRect()
        const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
        onSeek(ratio * duration)
      }

      const handleMouseUp = () => {
        setIsDragging(false)
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [duration, onSeek, handleProgressClick],
  )

  // ─── Active segments/frames at current time ──────────────────────────────

  const activeSegments = segments.filter(
    (s) => currentTime >= s.start_seconds && currentTime <= s.end_seconds,
  )

  const activeFrame = frames.find((f) => {
    if (frames.length === 0) return false
    const closest = frames.reduce((prev, curr) =>
      Math.abs(curr.timestamp - currentTime) < Math.abs(prev.timestamp - currentTime) ? curr : prev,
    )
    return f.frame_id === closest.frame_id && Math.abs(f.timestamp - currentTime) < 0.5
  })

  const topSeverity = [...activeSegments, ...(activeFrame ? [activeFrame] : [])].reduce<
    string | null
  >((max, item) => {
    const sev = item.severity ?? 'LOW'
    const order = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
    const idx = order.indexOf(sev.toUpperCase())
    const maxIdx = max ? order.indexOf(max) : -1
    return idx > maxIdx ? sev.toUpperCase() : max
  }, null)

  const currentSegment = segments.find(
    (s) => currentTime >= s.start_seconds && currentTime <= s.end_seconds,
  )

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className={`relative bg-black rounded-lg overflow-hidden group select-none ${
        isFullscreen ? 'w-screen h-screen' : ''
      }`}
      onMouseMove={showControlsTemporarily}
      onMouseLeave={() => isPlaying && setShowControls(false)}
    >
      {/* Severity border */}
      {topSeverity && (
        <div
          className="absolute top-0 left-0 right-0 h-1 z-20"
          style={{ backgroundColor: severityColor(topSeverity) }}
        />
      )}

      {/* Video element */}
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-full object-contain"
        playsInline
        preload="metadata"
      />

      {/* Bounding box overlay */}
      {activeFrame && activeFrame.regions && activeFrame.regions.length > 0 && (
        <div className="absolute inset-0 z-10 pointer-events-none">
          {activeFrame.regions.map((region) => (
            <div
              key={region.id}
              className="absolute rounded border-2"
              style={{
                left: `${region.x}%`,
                top: `${region.y}%`,
                width: `${region.width}%`,
                height: `${region.height}%`,
                borderColor: severityColor(activeFrame.severity ?? 'MEDIUM'),
                backgroundColor: `${severityColor(activeFrame.severity ?? 'MEDIUM')}15`,
              }}
            >
              <span
                className="absolute -top-5 left-0 text-[10px] font-medium px-1 rounded"
                style={{
                  backgroundColor: severityColor(activeFrame.severity ?? 'MEDIUM'),
                  color: '#000',
                }}
              >
                {region.explanation ?? 'Region'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Segment overlay on video */}
      {activeSegments.map((seg) => (
        <div
          key={seg.id}
          className={`absolute inset-x-0 top-1 bottom-0 z-10 pointer-events-auto cursor-pointer transition-all ${
            selectedSegmentId === seg.id
              ? 'ring-2 ring-white/40'
              : hoveredSegmentId === seg.id
                ? 'ring-1 ring-white/20'
                : ''
          }`}
          style={{
            borderLeft: `3px solid ${severityColor(seg.severity ?? 'MEDIUM')}`,
            borderRight: `3px solid ${severityColor(seg.severity ?? 'MEDIUM')}`,
          }}
          onClick={() => onSegmentClick?.(seg.id)}
          onMouseEnter={() => onSegmentHover?.(seg.id)}
          onMouseLeave={() => onSegmentHover?.(null)}
        />
      ))}

      {/* Segment label */}
      {currentSegment && (
        <div className="absolute top-3 left-3 z-20">
          <div
            className="flex items-center gap-2 px-2 py-1 rounded text-xs font-medium"
            style={{
              backgroundColor: `${severityColor(currentSegment.severity ?? 'MEDIUM')}20`,
              color: severityColor(currentSegment.severity ?? 'MEDIUM'),
              border: `1px solid ${severityColor(currentSegment.severity ?? 'MEDIUM')}40`,
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: severityColor(currentSegment.severity ?? 'MEDIUM') }}
            />
            {currentSegment.explanation ?? 'Segment'}
            {currentSegment.score != null && (
              <span className="text-[10px] opacity-70">
                {(currentSegment.score * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>
      )}

      {/* Center play button overlay */}
      {!isPlaying && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <button
            onClick={() => (isPlaying ? onPause() : onPlay())}
            className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-all"
            aria-label="Play video"
          >
            <svg className="w-7 h-7 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      )}

      {/* Controls bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-30 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-10 pb-3 px-4">
          {/* Progress bar */}
          <div
            ref={progressRef}
            className="relative h-1.5 bg-white/20 rounded-full cursor-pointer group/progress mb-3 hover:h-2.5 transition-all"
            onClick={handleProgressClick}
            onMouseDown={handleProgressMouseDown}
          >
            {/* Buffered */}
            <div
              className="absolute inset-y-0 left-0 bg-white/10 rounded-full"
              style={{ width: '100%' }}
            />

            {/* Progress fill */}
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${progressPercent}%`,
                backgroundColor: topSeverity ? severityColor(topSeverity) : '#3b82f6',
              }}
            />

            {/* Segment markers */}
            {segments.map((seg) => {
              const start = (seg.start_seconds / duration) * 100
              const width = ((seg.end_seconds - seg.start_seconds) / duration) * 100
              return (
                <div
                  key={seg.id}
                  className="absolute top-1/2 -translate-y-1/2 h-1 rounded"
                  style={{
                    left: `${start}%`,
                    width: `${width}%`,
                    backgroundColor: `${severityColor(seg.severity ?? 'MEDIUM')}60`,
                  }}
                />
              )
            })}

            {/* Playhead */}
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-lg opacity-0 group-hover/progress:opacity-100 transition-opacity"
              style={{ left: `${progressPercent}%` }}
            />
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button
              onClick={() => (isPlaying ? onPause() : onPlay())}
              className="text-white hover:text-white/80 transition-colors"
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Time */}
            <span className="text-xs text-white/70 font-mono tabular-nums min-w-[90px]">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Volume */}
            <div className="flex items-center gap-1.5 group/vol">
              <button
                onClick={() => setIsMuted(!isMuted)}
                className="text-white/70 hover:text-white transition-colors"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                  </svg>
                ) : volume < 0.5 ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  setVolume(v)
                  if (v > 0) setIsMuted(false)
                }}
                className="w-20 h-1 accent-white appearance-none bg-white/30 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white opacity-0 group-hover/vol:opacity-100 transition-opacity"
                aria-label="Volume"
              />
            </div>

            {/* Playback speed */}
            <div className="relative">
              <button
                onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                className="text-[11px] text-white/70 hover:text-white transition-colors font-mono min-w-[36px] text-center"
                aria-label="Playback speed"
              >
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-full right-0 mb-2 bg-slate-900 border border-slate-700 rounded-lg py-1 shadow-xl">
                  {speeds.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => {
                        setPlaybackRate(speed)
                        setShowSpeedMenu(false)
                      }}
                      className={`block w-full text-left px-3 py-1 text-xs transition-colors ${
                        playbackRate === speed
                          ? 'text-white bg-white/10'
                          : 'text-slate-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="text-white/70 hover:text-white transition-colors"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Keyboard shortcut hint */}
      {!isPlaying && !videoUrl && (
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="text-center text-slate-500">
            <svg
              className="w-12 h-12 mx-auto mb-3 opacity-50"
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
            <p className="text-sm">No video loaded</p>
          </div>
        </div>
      )}
    </div>
  )
}
