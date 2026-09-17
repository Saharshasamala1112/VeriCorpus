import { useState } from 'react'
import { Cpu, MonitorPlay, ChevronDown, Clock, Layers, AudioLines } from 'lucide-react'
import { Card, Badge } from '../ui'

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoModelInfoProps {
  modelInfo: {
    model_id: string | null
    display_name: string | null
    version: string | null
    architecture: string | null
    modality: string | null
    framework: string | null
    dataset_version: string | null
    training_run_id: string | null
    status: string | null
  } | null
  metadata: {
    duration_seconds: number | null
    width: number | null
    height: number | null
    fps: number | null
    codec: string | null
    audio_codec: string | null
    bit_rate: number | null
    sample_rate: number | null
    channels: number | null
    frame_count: number | null
    has_audio: boolean
    resolution_class: string | null
  } | null
  processingMetadata: Record<string, unknown> | null
  createdAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}m ${secs}s`
}

function formatBitrate(bps: number | null): string {
  if (bps == null) return '—'
  if (bps >= 1_000_000) return `${(bps / 1_000_000).toFixed(1)} Mbps`
  if (bps >= 1_000) return `${(bps / 1_000).toFixed(0)} kbps`
  return `${bps} bps`
}

function formatResolution(width: number | null, height: number | null): string {
  if (width == null || height == null) return '—'
  return `${width}×${height}`
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  } catch {
    return iso
  }
}

function getStatusVariant(status: string | null) {
  switch (status?.toLowerCase()) {
    case 'active':
    case 'deployed':
      return 'success' as const
    case 'deprecated':
    case 'archived':
      return 'warning' as const
    case 'error':
    case 'failed':
      return 'danger' as const
    default:
      return 'info' as const
  }
}

function flattenValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

// ─── Detail Row ──────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
        {label}
      </span>
      <span className="text-sm text-slate-200 font-medium text-right truncate">{value || '—'}</span>
    </div>
  )
}

// ─── Processing Metadata ─────────────────────────────────────────────────────

function ProcessingMetadataSection({ metadata }: { metadata: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)
  const keys = Object.keys(metadata)

  if (keys.length === 0) return null

  return (
    <div className="mt-4 border-t border-slate-700/50 pt-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full text-left group"
      >
        <Layers className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Processing Metadata
        </span>
        <span className="text-[10px] text-slate-600 bg-slate-800/50 px-1.5 py-0.5 rounded-full font-mono">
          {keys.length}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-600 ml-auto transition-transform duration-200 ${
            expanded ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>
      {expanded && (
        <div className="mt-3 bg-slate-800/30 rounded-lg border border-slate-700/30 p-3">
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {keys.map((key) => (
              <div key={key} className="flex gap-2 py-0.5 text-xs font-mono">
                <span className="text-slate-500 shrink-0">{key}:</span>
                <span className="text-slate-300 break-all">{flattenValue(metadata[key])}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VideoModelInfo({
  modelInfo,
  metadata,
  processingMetadata,
  createdAt,
}: VideoModelInfoProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Model Info */}
      <Card padding="md">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/10">
            <Cpu className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Model Information</h3>
            <p className="text-[11px] text-slate-500">
              {modelInfo?.display_name || modelInfo?.model_id || 'No model selected'}
            </p>
          </div>
          {modelInfo?.status && (
            <div className="ml-auto">
              <Badge variant={getStatusVariant(modelInfo.status)} size="sm">
                <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                {modelInfo.status}
              </Badge>
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <DetailRow label="Model ID" value={modelInfo?.model_id ?? ''} />
          <DetailRow label="Version" value={modelInfo?.version ?? ''} />
          <DetailRow label="Architecture" value={modelInfo?.architecture ?? ''} />
          <DetailRow label="Framework" value={modelInfo?.framework ?? ''} />
          <DetailRow label="Modality" value={modelInfo?.modality ?? ''} />
          <DetailRow label="Dataset" value={modelInfo?.dataset_version ?? ''} />
          <DetailRow label="Training Run" value={modelInfo?.training_run_id ?? ''} />
        </div>
      </Card>

      {/* Technical Details */}
      <Card padding="md">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10">
            <MonitorPlay className="h-4 w-4 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Technical Details</h3>
            <p className="text-[11px] text-slate-500">
              {metadata?.resolution_class ?? 'Video properties'}
            </p>
          </div>
          {metadata?.has_audio && (
            <div className="ml-auto">
              <Badge variant="info" size="sm">
                <AudioLines className="w-3 h-3" />
                Audio
              </Badge>
            </div>
          )}
        </div>

        <div className="space-y-0.5">
          <DetailRow
            label="Resolution"
            value={formatResolution(metadata?.width ?? null, metadata?.height ?? null)}
          />
          <DetailRow label="FPS" value={metadata?.fps != null ? `${metadata.fps}` : ''} />
          <DetailRow label="Codec" value={metadata?.codec ?? ''} />
          <DetailRow label="Bitrate" value={formatBitrate(metadata?.bit_rate ?? null)} />
          <DetailRow label="Duration" value={formatDuration(metadata?.duration_seconds ?? null)} />
          <DetailRow
            label="Frames"
            value={metadata?.frame_count != null ? `${metadata.frame_count}` : ''}
          />
          <DetailRow label="Audio Codec" value={metadata?.audio_codec ?? ''} />
          <DetailRow
            label="Sample Rate"
            value={metadata?.sample_rate != null ? `${metadata.sample_rate} Hz` : ''}
          />
          <DetailRow
            label="Channels"
            value={metadata?.channels != null ? `${metadata.channels}` : ''}
          />
        </div>

        {/* Analysis Timestamp */}
        <div className="mt-4 pt-4 border-t border-slate-700/50 flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-[11px] text-slate-500 uppercase tracking-wider font-medium">
            Analyzed
          </span>
          <span className="text-xs text-slate-400 font-mono ml-auto">
            {formatTimestamp(createdAt)}
          </span>
        </div>

        {/* Processing Metadata */}
        {processingMetadata && <ProcessingMetadataSection metadata={processingMetadata} />}
      </Card>
    </div>
  )
}
