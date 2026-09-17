import { useEffect, useState, useMemo } from 'react'
import {
  Search,
  Shield,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  RefreshCw,
  Tag,
  Filter,
  User,
} from 'lucide-react'
import { Card, Badge, Input } from '../../components/ui'
import AuthGate from '../../components/ml/AuthGate'
import { mlopsService } from '../../services/mlops.service'
import { AUTHORIZED_ROLES_FOR_MLOPS } from '../../types/mlops'
import type { AuditEvent, AuditLogEntry } from '../../types/mlops'

const EVENT_CONFIG: Record<
  AuditEvent,
  {
    label: string
    variant: 'success' | 'info' | 'danger' | 'warning' | 'default'
    icon: React.ElementType
  }
> = {
  model_promoted: { label: 'Promotion', variant: 'success', icon: ArrowUpRight },
  model_rolled_back: { label: 'Rollback', variant: 'danger', icon: ArrowDownRight },
  training_triggered: { label: 'Training Triggered', variant: 'info', icon: RefreshCw },
  training_started: { label: 'Training Start', variant: 'info', icon: RefreshCw },
  training_completed: { label: 'Training Complete', variant: 'success', icon: RefreshCw },
  training_failed: { label: 'Training Failed', variant: 'danger', icon: AlertTriangle },
  dataset_created: { label: 'Dataset Created', variant: 'default', icon: Tag },
  dataset_updated: { label: 'Dataset Updated', variant: 'default', icon: Tag },
  dataset_version_created: { label: 'Version Created', variant: 'default', icon: Tag },
  dataset_version_validated: { label: 'Version Validated', variant: 'info', icon: Tag },
  corpus_item_approved: { label: 'Item Approved', variant: 'success', icon: Shield },
  corpus_item_rejected: { label: 'Item Rejected', variant: 'danger', icon: Shield },
  model_created: { label: 'Model Created', variant: 'info', icon: ArrowUpRight },
  model_evaluated: { label: 'Evaluation', variant: 'success', icon: ArrowUpRight },
  model_archived: { label: 'Model Archived', variant: 'default', icon: AlertTriangle },
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(ts: string): string {
  const now = Date.now()
  const then = new Date(ts).getTime()
  const diffMs = now - then
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMinutes < 60) return `${diffMinutes}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

function DetailsView({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details)
  if (entries.length === 0) return null

  return (
    <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
      {entries.map(([key, value]) => (
        <span key={key} className="text-slate-500">
          {key}:{' '}
          <span className="text-white">
            {typeof value === 'number'
              ? value < 1
                ? `${(value * 100).toFixed(1)}%`
                : value.toLocaleString()
              : String(value)}
          </span>
        </span>
      ))}
    </div>
  )
}

function SkeletonAuditEntry() {
  return (
    <div className="px-6 py-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-6 w-6 shrink-0 rounded-full bg-slate-800" />
        <div className="space-y-2 flex-1">
          <div className="flex items-center gap-2">
            <div className="h-5 w-20 rounded bg-slate-800" />
            <div className="h-4 w-32 rounded bg-slate-800" />
          </div>
          <div className="h-3 w-48 rounded bg-slate-800" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-16 rounded bg-slate-800" />
          <div className="h-3 w-20 rounded bg-slate-800" />
        </div>
      </div>
    </div>
  )
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await mlopsService.listAuditLogs({ limit: 200 })
        if (!cancelled) setLogs(data)
      } catch {
        // errors silently handled — show empty state
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      const matchesSearch =
        !search ||
        entry.event.toLowerCase().includes(search.toLowerCase()) ||
        entry.username.toLowerCase().includes(search.toLowerCase()) ||
        entry.targetName.toLowerCase().includes(search.toLowerCase())

      const matchesEvent = !selectedEvent || entry.event === selectedEvent

      return matchesSearch && matchesEvent
    })
  }, [logs, search, selectedEvent])

  const uniqueEventTypes = useMemo(() => {
    const types = new Set(logs.map((e) => e.event))
    return Array.from(types).sort()
  }, [logs])

  if (loading) {
    return (
      <AuthGate allowedRoles={AUTHORIZED_ROLES_FOR_MLOPS}>
        <div className="space-y-6">
          <div>
            <div className="h-8 w-40 rounded bg-slate-800 animate-pulse" />
            <div className="mt-1 h-4 w-64 rounded bg-slate-800 animate-pulse" />
          </div>
          <Card padding="none">
            <SkeletonAuditEntry />
            <SkeletonAuditEntry />
            <SkeletonAuditEntry />
          </Card>
        </div>
      </AuthGate>
    )
  }

  return (
    <AuthGate allowedRoles={AUTHORIZED_ROLES_FOR_MLOPS}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Log</h1>
            <p className="mt-1 text-sm text-slate-500">
              Track all model and dataset operations for compliance and review.
            </p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search audit log..."
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" />
            {uniqueEventTypes.map((type) => {
              const config = EVENT_CONFIG[type]
              const isActive = selectedEvent === type
              return (
                <button
                  key={type}
                  onClick={() => setSelectedEvent(isActive ? null : type)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition ${
                    isActive
                      ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                      : 'border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-400'
                  }`}
                >
                  {config?.label ?? type}
                </button>
              )
            })}
          </div>
        </div>

        {/* Results count */}
        <p className="text-xs text-slate-500">
          Showing {filteredLogs.length} of {logs.length} entries
        </p>

        {/* Log entries */}
        <Card padding="none">
          <div className="divide-y divide-slate-800/50">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-12">
                <Search className="h-12 w-12 text-slate-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No entries found</h3>
                <p className="text-sm text-slate-400">Try adjusting your search or filters.</p>
              </div>
            ) : (
              filteredLogs.map((entry) => {
                const config = EVENT_CONFIG[entry.event]
                const EventIcon = config?.icon ?? Shield

                return (
                  <div key={entry.id} className="px-6 py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-800">
                        <EventIcon className="h-3 w-3" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={config?.variant ?? 'default'} size="sm">
                            {config?.label ?? entry.event}
                          </Badge>
                          <span className="text-xs text-slate-400 font-medium">
                            {entry.targetName}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300">
                          Target: <span className="text-white">{entry.targetName}</span>
                          <span className="text-slate-600 mx-2">|</span>
                          <span className="text-slate-500">{entry.targetType}</span>
                        </p>
                        <DetailsView details={entry.details} />
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="text-[11px] text-slate-500">
                          {formatRelativeTime(entry.timestamp)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {formatTimestamp(entry.timestamp)}
                        </p>
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
                          <User className="h-3 w-3" />
                          {entry.username}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </Card>
      </div>
    </AuthGate>
  )
}
