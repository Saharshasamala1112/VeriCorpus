import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Database,
  RefreshCw,
  Plus,
  CheckCircle,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  Languages,
  BarChart3,
  Filter,
} from 'lucide-react'
import { Card, Badge, Button } from '../../components/ui'
import AuthGate from '../../components/ml/AuthGate'
import { mlopsService } from '../../services/mlops.service'
import { AUTHORIZED_ROLES_FOR_MLOPS } from '../../types/mlops'
import type { Dataset, DatasetStatus } from '../../types/mlops'

const STATUS_CONFIG: Record<
  DatasetStatus,
  {
    label: string
    variant: 'success' | 'warning' | 'danger' | 'info' | 'default'
    icon: React.ElementType
  }
> = {
  active: { label: 'Active', variant: 'success', icon: CheckCircle },
  stale: { label: 'Stale', variant: 'warning', icon: Clock },
  archived: { label: 'Archived', variant: 'default', icon: AlertTriangle },
  syncing: { label: 'Syncing', variant: 'info', icon: RefreshCw },
}

const MODALITY_COLORS: Record<string, string> = {
  text: 'bg-cyan-500',
  image: 'bg-purple-500',
  audio: 'bg-emerald-500',
  video: 'bg-amber-500',
  document: 'bg-rose-500',
}

function StatCard({
  label,
  value,
  icon: Icon,
  change,
}: {
  label: string
  value: string
  icon: React.ElementType
  change?: string
}) {
  return (
    <Card padding="sm" className="flex items-center gap-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-lg font-bold text-slate-900 dark:text-white">{value}</p>
        <p className="text-xs text-slate-500">{label}</p>
      </div>
      {change && (
        <Badge variant="success" size="sm" className="ml-auto">
          {change}
        </Badge>
      )}
    </Card>
  )
}

function SkeletonCard() {
  return (
    <Card className="animate-pulse space-y-4">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="space-y-2">
          <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-48 rounded bg-slate-200 dark:bg-slate-800" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-slate-800" />
      </div>
    </Card>
  )
}

export default function DatasetDashboard() {
  const navigate = useNavigate()
  const [datasets, setDatasets] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<DatasetStatus | 'all'>('all')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await mlopsService.listDatasets({ limit: 100 })
        if (!cancelled) setDatasets(data)
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

  const filteredDatasets = filter === 'all' ? datasets : datasets.filter((d) => d.status === filter)

  const totalSamples = datasets.reduce((sum, d) => sum + d.totalSamples, 0)
  const activeDatasets = datasets.filter((d) => d.status === 'active').length
  const totalVersions = datasets.reduce((sum, d) => sum + d.versions.length, 0)

  if (loading) {
    return (
      <AuthGate allowedRoles={AUTHORIZED_ROLES_FOR_MLOPS}>
        <div className="space-y-6">
          <div>
            <div className="h-8 w-48 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
            <div className="mt-1 h-4 w-64 rounded bg-slate-200 dark:bg-slate-800 animate-pulse" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} padding="sm" className="flex items-center gap-4 animate-pulse">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-200 dark:bg-slate-800" />
                <div className="space-y-2">
                  <div className="h-5 w-12 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-16 rounded bg-slate-200 dark:bg-slate-800" />
                </div>
              </Card>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dataset Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage training and evaluation datasets for all modalities.
            </p>
          </div>
          <Button size="sm" icon={<Plus className="h-3.5 w-3.5" />}>
            Add Dataset
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Datasets" value={String(datasets.length)} icon={Database} />
          <StatCard
            label="Active"
            value={String(activeDatasets)}
            icon={CheckCircle}
            change={`${activeDatasets}/${datasets.length}`}
          />
          <StatCard label="Total Samples" value={totalSamples.toLocaleString()} icon={BarChart3} />
          <StatCard label="Versions" value={String(totalVersions)} icon={RefreshCw} />
        </div>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-500" />
          <div className="flex gap-1">
            {(['all', 'active', 'stale', 'archived'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  filter === s
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Empty state */}
        {datasets.length === 0 && (
          <Card className="text-center py-12">
            <Database className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No datasets found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No dataset candidates have been registered yet.
            </p>
          </Card>
        )}

        {/* Dataset cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredDatasets.map((ds) => {
            const statusConfig = STATUS_CONFIG[ds.status]
            const StatusIcon = statusConfig.icon
            const totalModalities = Object.values(ds.modalities).reduce((a, b) => a + b, 0)

            return (
              <Card
                key={ds.id}
                variant="interactive"
                onClick={() => navigate(`/ml/datasets/${ds.id}`)}
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                      <Database className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{ds.name}</h3>
                      <p className="text-xs text-slate-500">
                        {ds.totalSamples.toLocaleString()} samples — {ds.currentVersion}
                      </p>
                    </div>
                  </div>
                  <Badge variant={statusConfig.variant} size="sm">
                    <StatusIcon
                      className={`h-3 w-3 ${ds.status === 'syncing' ? 'animate-spin' : ''}`}
                    />
                    {statusConfig.label}
                  </Badge>
                </div>

                {/* Description */}
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{ds.description}</p>

                {/* Modality distribution */}
                {totalModalities > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-[11px] text-slate-500 uppercase tracking-wider">
                      Modality Distribution
                    </p>
                    <div className="flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      {Object.entries(ds.modalities).map(([mod, count]) => {
                        if (count === 0) return null
                        const pct = (count / totalModalities) * 100
                        return (
                          <div
                            key={mod}
                            className={`${MODALITY_COLORS[mod]} h-full`}
                            style={{ width: `${pct}%` }}
                            title={`${mod}: ${count}`}
                          />
                        )
                      })}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {Object.entries(ds.modalities).map(([mod, count]) => {
                        if (count === 0) return null
                        return (
                          <span
                            key={mod}
                            className="flex items-center gap-1 text-[10px] text-slate-500"
                          >
                            <span className={`h-2 w-2 rounded-full ${MODALITY_COLORS[mod]}`} />
                            {mod} ({count.toLocaleString()})
                          </span>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Quality */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-slate-200/30 dark:bg-slate-800/30 p-2 text-center">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {(ds.quality.averageQualityScore * 100).toFixed(0)}%
                    </p>
                    <p className="text-[10px] text-slate-500">Quality</p>
                  </div>
                  <div className="rounded-lg bg-slate-200/30 dark:bg-slate-800/30 p-2 text-center">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {ds.quality.totalSamples > 0
                        ? ((ds.quality.labeledSamples / ds.quality.totalSamples) * 100).toFixed(0)
                        : '0'}
                      %
                    </p>
                    <p className="text-[10px] text-slate-500">Labeled</p>
                  </div>
                  <div className="rounded-lg bg-slate-200/30 dark:bg-slate-800/30 p-2 text-center">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      {(ds.quality.duplicateRate * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-slate-500">Duplicates</p>
                  </div>
                </div>

                {/* Languages */}
                {ds.languages.length > 0 && ds.languages[0].language !== 'N/A (Visual)' && (
                  <div className="mt-4">
                    <p className="mb-2 flex items-center gap-1 text-[11px] text-slate-500 uppercase tracking-wider">
                      <Languages className="h-3 w-3" />
                      Languages
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {ds.languages.map((lang) => (
                        <Badge key={lang.language} size="sm" variant="default">
                          {lang.language} ({lang.percentage.toFixed(0)}%)
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Latest change */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-200/50 dark:border-slate-800/50 pt-3">
                  <span className="text-xs text-slate-500">{ds.latestChange}</span>
                  <ArrowUpRight className="h-4 w-4 text-slate-600" />
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </AuthGate>
  )
}
