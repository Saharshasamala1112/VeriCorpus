import { lazy, Suspense, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { videoAnalysisService } from '../../services/videoAnalysis.service'
import { useVideoResultStore } from '../../store/videoResult'
import { Skeleton, ErrorState, EmptyState } from '../../components/ui'

// ─── Lazy Imports ─────────────────────────────────────────────────────────────

const VideoHeroAssessment = lazy(
  () => import('../../components/video-analysis/VideoHeroAssessment'),
)
const VideoPlayer = lazy(() => import('../../components/video-analysis/VideoPlayer'))
const VideoExplanationPanel = lazy(
  () => import('../../components/video-analysis/VideoExplanationPanel'),
)

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="space-y-5" role="status" aria-label="Loading analysis results">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <div className="space-y-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
      <Skeleton className="h-72 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="space-y-3">
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function VideoResultPage() {
  const { jobId } = useParams<{ jobId: string }>()
  const navigate = useNavigate()

  const {
    isPlaying,
    currentTime,
    volume: _volume,
    playbackRate: _playbackRate,
    isMuted: _isMuted,
    selectedSegmentId,
    selectedFrameId,
    selectedSignalType,
    hoveredSegmentId,
    hoveredFrameId,
    activeTab: _activeTab,
    evidenceFilter,
    setPlaying,
    setCurrentTime,
    setDuration,
    setVolume: _setVolume,
    setPlaybackRate: _setPlaybackRate,
    setMuted: _setMuted,
    selectSegment,
    selectFrame,
    selectSignalType,
    setHoveredSegment,
    setHoveredFrame,
    setActiveTab: _setActiveTab,
    setEvidenceFilter: _setEvidenceFilter,
    resetState,
  } = useVideoResultStore()

  const {
    data: analysis,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['videoAnalysis', jobId],
    queryFn: () => videoAnalysisService.getAnalysis(jobId!),
    enabled: !!jobId,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    return () => resetState()
  }, [resetState])

  const handleTimeUpdate = useCallback((time: number) => setCurrentTime(time), [setCurrentTime])

  const handlePlay = useCallback(() => setPlaying(true), [setPlaying])

  const handlePause = useCallback(() => setPlaying(false), [setPlaying])

  const handleSeek = useCallback((time: number) => setCurrentTime(time), [setCurrentTime])

  const handleDurationChange = useCallback(
    (duration: number) => setDuration(duration),
    [setDuration],
  )

  const handleSegmentClick = useCallback(
    (segmentId: string) => selectSegment(segmentId),
    [selectSegment],
  )

  const handleSegmentHover = useCallback(
    (segmentId: string | null) => setHoveredSegment(segmentId),
    [setHoveredSegment],
  )

  const _handleFrameClick = useCallback((_frameId: string) => selectFrame(_frameId), [selectFrame])

  const _handleFrameHover = useCallback(
    (_frameId: string | null) => setHoveredFrame(_frameId),
    [setHoveredFrame],
  )

  const _handleSignalTypeClick = useCallback(
    (_type: string) => selectSignalType(_type === selectedSignalType ? null : _type),
    [selectSignalType, selectedSignalType],
  )

  if (!jobId) {
    return (
      <div className="space-y-4">
        <EmptyState
          title="No analysis job specified"
          description="Please start an analysis from the uploads page."
        />
      </div>
    )
  }

  if (isLoading) {
    return <LoadingSkeleton />
  }

  if (isError) {
    return (
      <ErrorState
        message={error instanceof Error ? error.message : 'Failed to load analysis results.'}
        onRetry={() => refetch()}
      />
    )
  }

  if (!analysis) {
    return (
      <EmptyState
        title="No analysis data"
        description="The analysis result is empty or unavailable."
      />
    )
  }

  const mediaUrl = analysis.asset_id
    ? videoAnalysisService.getMediaUrl(analysis.asset_id)
    : undefined

  return (
    <div className="space-y-5" role="main" aria-label="Video analysis result">
      {/* ─── Header ─── */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-white"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Video Analysis Result</h1>
          <p className="text-sm text-slate-500">
            {analysis.duration != null
              ? `${Math.round(analysis.duration)}s video`
              : 'Video analysis'}
          </p>
        </div>
      </div>

      {/* ─── Hero Assessment (confidence metrics) ─── */}
      <Suspense fallback={<Skeleton className="h-40 w-full rounded-2xl" />}>
        <VideoHeroAssessment
          assessment={analysis.assessment}
          modelProbability={analysis.model_probability}
          calibratedProbability={analysis.calibrated_probability}
          evidenceStrength={analysis.evidence_strength}
          riskLevel={analysis.risk_level}
          summary={analysis.summary}
          processingStatus={analysis.processing_status}
        />
      </Suspense>

      {/* ─── Video Player (affected areas) ─── */}
      <Suspense fallback={<Skeleton className="h-72 w-full rounded-2xl" />}>
        <VideoPlayer
          videoUrl={mediaUrl}
          metadata={analysis.metadata ?? undefined}
          segments={analysis.segments}
          frames={analysis.frames}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onTimeUpdate={handleTimeUpdate}
          onPlay={handlePlay}
          onPause={handlePause}
          onSeek={handleSeek}
          onDurationChange={handleDurationChange}
          selectedSegmentId={selectedSegmentId}
          hoveredSegmentId={hoveredSegmentId}
          onSegmentClick={handleSegmentClick}
          onSegmentHover={handleSegmentHover}
        />
      </Suspense>

      {/* ─── Explanation ─── */}
      <Suspense fallback={<Skeleton className="h-48 w-full rounded-xl" />}>
        <VideoExplanationPanel explanation={analysis.explanation} />
      </Suspense>
    </div>
  )
}
