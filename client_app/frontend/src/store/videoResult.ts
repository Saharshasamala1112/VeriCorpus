import { create } from 'zustand'

type ActiveTab = 'overview' | 'evidence' | 'explanation' | 'technical'
type EvidenceFilter = 'all' | 'supporting' | 'counter'

interface VideoResultState {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  playbackRate: number
  isMuted: boolean
  isFullscreen: boolean

  selectedSegmentId: string | null
  selectedFrameId: string | null
  selectedSignalType: string | null
  hoveredSegmentId: string | null
  hoveredFrameId: string | null

  activeTab: ActiveTab
  showHeatmap: boolean
  showBoundingBoxes: boolean
  evidenceFilter: EvidenceFilter
  timelineZoom: number

  setPlaying: (playing: boolean) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setVolume: (volume: number) => void
  setPlaybackRate: (rate: number) => void
  setMuted: (muted: boolean) => void
  setFullscreen: (fullscreen: boolean) => void
  selectSegment: (id: string | null) => void
  selectFrame: (id: string | null) => void
  selectSignalType: (type: string | null) => void
  setHoveredSegment: (id: string | null) => void
  setHoveredFrame: (id: string | null) => void
  setActiveTab: (tab: ActiveTab) => void
  setShowHeatmap: (show: boolean) => void
  setShowBoundingBoxes: (show: boolean) => void
  setEvidenceFilter: (filter: EvidenceFilter) => void
  setTimelineZoom: (zoom: number) => void
  seekToSegment: (segmentId: string) => void
  seekToTime: (time: number) => void
  resetState: () => void
}

const initialState = {
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 1,
  playbackRate: 1,
  isMuted: false,
  isFullscreen: false,

  selectedSegmentId: null,
  selectedFrameId: null,
  selectedSignalType: null,
  hoveredSegmentId: null,
  hoveredFrameId: null,

  activeTab: 'overview' as ActiveTab,
  showHeatmap: true,
  showBoundingBoxes: true,
  evidenceFilter: 'all' as EvidenceFilter,
  timelineZoom: 5,
}

export const useVideoResultStore = create<VideoResultState>((set) => ({
  ...initialState,

  setPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setVolume: (volume) => set({ volume }),
  setPlaybackRate: (playbackRate) => set({ playbackRate }),
  setMuted: (isMuted) => set({ isMuted }),
  setFullscreen: (isFullscreen) => set({ isFullscreen }),

  selectSegment: (selectedSegmentId) => set({ selectedSegmentId }),
  selectFrame: (selectedFrameId) => set({ selectedFrameId }),
  selectSignalType: (selectedSignalType) => set({ selectedSignalType }),
  setHoveredSegment: (hoveredSegmentId) => set({ hoveredSegmentId }),
  setHoveredFrame: (hoveredFrameId) => set({ hoveredFrameId }),

  setActiveTab: (activeTab) => set({ activeTab }),
  setShowHeatmap: (showHeatmap) => set({ showHeatmap }),
  setShowBoundingBoxes: (showBoundingBoxes) => set({ showBoundingBoxes }),
  setEvidenceFilter: (evidenceFilter) => set({ evidenceFilter }),
  setTimelineZoom: (timelineZoom) => set({ timelineZoom }),

  seekToSegment: (segmentId) => set({ selectedSegmentId: segmentId, isPlaying: true }),
  seekToTime: (time) => set({ currentTime: time, isPlaying: true }),
  resetState: () => set(initialState),
}))
