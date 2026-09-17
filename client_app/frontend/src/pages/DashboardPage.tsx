import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, Database, BrainCircuit, Clock, ArrowRight, Loader2 } from 'lucide-react'
import { Card, Badge, EmptyState } from '../components/ui'
import { MEDIA_REGISTRY, type MediaType, formatFileSize } from '../config/media-registry'
import { ROUTES } from '../config/routes'
import api from '../lib/axios'

const colorMap: Record<string, { border: string; icon: string; hover: string }> = {
  cyan: {
    border: 'hover:border-cyan-400/30',
    icon: 'text-cyan-400',
    hover: 'group-hover:bg-cyan-400/10',
  },
  purple: {
    border: 'hover:border-purple-400/30',
    icon: 'text-purple-400',
    hover: 'group-hover:bg-purple-400/10',
  },
  emerald: {
    border: 'hover:border-emerald-400/30',
    icon: 'text-emerald-400',
    hover: 'group-hover:bg-emerald-400/10',
  },
  amber: {
    border: 'hover:border-amber-400/30',
    icon: 'text-amber-400',
    hover: 'group-hover:bg-amber-400/10',
  },
  rose: {
    border: 'hover:border-rose-400/30',
    icon: 'text-rose-400',
    hover: 'group-hover:bg-rose-400/10',
  },
}

const routeMap: Record<MediaType, string> = {
  text: ROUTES.ANALYZE_TEXT,
  image: ROUTES.ANALYZE_IMAGE,
  audio: ROUTES.ANALYZE_AUDIO,
  video: ROUTES.ANALYZE_VIDEO,
  document: ROUTES.ANALYZE_DOCUMENT,
}

interface DashboardStats {
  total_analyses: number
  total_samples: number
  labeled_samples: number
  model_ready: boolean
  last_run_status: string | null
}

interface RecentAnalysis {
  id: string
  filename: string
  media_type: string
  status: string
  confidence: number
  assessment: string
  timestamp: string
  size_bytes: number
}

interface SystemStatus {
  name: string
  status: 'online' | 'warning' | 'offline'
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getConfidenceColor(score: number): string {
  if (score > 0.7) return 'text-amber-400'
  if (score > 0.4) return 'text-yellow-400'
  return 'text-emerald-400'
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentAnalyses, setRecentAnalyses] = useState<RecentAnalysis[]>([])
  const [systemStatus, setSystemStatus] = useState<SystemStatus[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    async function fetchData() {
      try {
        const [statsRes, historyRes, modelStatusRes] = await Promise.allSettled([
          api.get('/training/dashboard', { signal: controller.signal }),
          api.get('/analysis-v2/', { params: { page_size: 5 }, signal: controller.signal }),
          api.get('/authenticity/model-status', { signal: controller.signal }),
        ])

        if (statsRes.status === 'fulfilled') {
          const d = statsRes.value.data
          setStats({
            total_analyses: d.total_analyses ?? 0,
            total_samples: d.total_samples ?? 0,
            labeled_samples: d.labeled_samples ?? 0,
            model_ready: d.model_ready ?? false,
            last_run_status: d.last_run_status ?? null,
          })
        }

        if (historyRes.status === 'fulfilled') {
          const items = historyRes.value.data?.items ?? []
          setRecentAnalyses(
            items.map((item: Record<string, unknown>) => ({
              id: item.id as string,
              filename: (item.input_text as string)?.slice(0, 30) || 'Text analysis',
              media_type: (item.modality as string) || 'text',
              status: (item.status as string) || 'completed',
              confidence: 0,
              assessment: 'Pending',
              timestamp: (item.created_at as string) || new Date().toISOString(),
              size_bytes: 0,
            })),
          )
        }

        const statuses: SystemStatus[] = [{ name: 'API Server', status: 'online' }]
        if (modelStatusRes.status === 'fulfilled') {
          const ms = modelStatusRes.value.data
          statuses.push({
            name: 'ML Pipeline',
            status: ms.forensic?.ready ? 'online' : ms.learning?.model_ready ? 'online' : 'warning',
          })
          statuses.push({
            name: 'Text Model',
            status: ms.learning?.model_ready ? 'online' : 'warning',
          })
        } else {
          statuses.push({ name: 'ML Pipeline', status: 'offline' })
          statuses.push({ name: 'Text Model', status: 'offline' })
        }
        statuses.push({ name: 'Database', status: 'online' })
        setSystemStatus(statuses)
      } catch {
        setSystemStatus([
          { name: 'API Server', status: 'offline' },
          { name: 'ML Pipeline', status: 'offline' },
          { name: 'Database', status: 'offline' },
        ])
      } finally {
        setLoading(false)
      }
    }
    fetchData()
    return () => controller.abort()
  }, [])

  const overviewStats = [
    {
      label: 'Analyses run',
      value: stats?.total_analyses?.toLocaleString() ?? '—',
      icon: Activity,
    },
    {
      label: 'Training samples',
      value: stats?.total_samples?.toLocaleString() ?? '—',
      icon: Database,
    },
    {
      label: 'Labeled samples',
      value: stats?.labeled_samples?.toLocaleString() ?? '—',
      icon: BrainCircuit,
    },
    {
      label: 'Model status',
      value: stats?.model_ready ? 'Ready' : 'Not trained',
      icon: Clock,
    },
  ]

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">
          Analyze and verify content authenticity across media types.
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} padding="sm" className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/50">
                  <Loader2 className="h-5 w-5 text-slate-500 animate-spin" />
                </div>
                <div className="space-y-2">
                  <div className="h-5 w-16 rounded bg-slate-800/50" />
                  <div className="h-3 w-24 rounded bg-slate-800/50" />
                </div>
              </Card>
            ))
          : overviewStats.map((stat) => (
              <Card key={stat.label} padding="sm" className="flex items-center gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/50 text-slate-400">
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-lg font-bold text-white">{stat.value}</p>
                  <p className="text-xs text-slate-500">{stat.label}</p>
                </div>
              </Card>
            ))}
      </div>

      {/* Media Cards */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Analyze Content</h2>
          <button
            onClick={() => navigate(ROUTES.ANALYZE)}
            className="flex items-center gap-1 text-xs text-slate-500 transition hover:text-cyan-400"
          >
            View all <ArrowRight className="h-3 w-3" />
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {(Object.keys(MEDIA_REGISTRY) as MediaType[]).map((type) => {
            const config = MEDIA_REGISTRY[type]
            const colors = colorMap[config.color]
            return (
              <button
                key={type}
                onClick={() => navigate(routeMap[type])}
                className={`group flex flex-col rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 text-left transition-all duration-200 ${colors.border}`}
              >
                <div
                  className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800/50 transition-colors ${colors.hover}`}
                >
                  <config.icon className={`h-6 w-6 ${colors.icon}`} />
                </div>
                <h3 className="text-sm font-semibold text-white">{config.label}</h3>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500">{config.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {config.acceptedFormats.slice(0, 3).map((fmt) => (
                    <span
                      key={fmt}
                      className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-500"
                    >
                      {fmt}
                    </span>
                  ))}
                  {config.acceptedFormats.length > 3 && (
                    <span className="rounded bg-slate-800/60 px-1.5 py-0.5 text-[10px] text-slate-500">
                      +{config.acceptedFormats.length - 3}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[10px] text-slate-600">
                    Max {formatFileSize(config.maxFileSize)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-600 transition group-hover:text-cyan-400" />
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Recent + System Status */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent Analyses */}
        <Card className="lg:col-span-2" padding="none">
          <div className="flex items-center justify-between border-b border-slate-800/50 px-6 py-4">
            <h2 className="text-sm font-semibold text-white">Recent Analyses</h2>
            <button
              onClick={() => navigate(ROUTES.HISTORY)}
              className="text-xs text-slate-500 transition hover:text-cyan-400"
            >
              View all
            </button>
          </div>
          <div className="divide-y divide-slate-800/50">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="h-4 w-48 rounded bg-slate-800/50" />
                    <div className="h-3 w-20 rounded bg-slate-800/50" />
                  </div>
                </div>
              ))
            ) : recentAnalyses.length > 0 ? (
              recentAnalyses.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-4 px-6 py-3 transition hover:bg-slate-800/20 cursor-pointer"
                  onClick={() => navigate(`/result/${item.id}`)}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-white">{item.filename}</p>
                    <p className="text-xs text-slate-500">{formatTimestamp(item.timestamp)}</p>
                  </div>
                  <Badge variant="default" size="sm">
                    {item.media_type}
                  </Badge>
                  <div className="text-right">
                    {item.confidence > 0 ? (
                      <>
                        <p
                          className={`text-sm font-semibold ${getConfidenceColor(item.confidence)}`}
                        >
                          {(item.confidence * 100).toFixed(0)}%
                        </p>
                        <p className="text-[10px] text-slate-600">confidence</p>
                      </>
                    ) : (
                      <span className="text-xs text-slate-600">—</span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-8">
                <EmptyState
                  title="No analyses yet"
                  description="Run your first content analysis to see results here."
                />
              </div>
            )}
          </div>
        </Card>

        {/* System Status */}
        <Card padding="none">
          <div className="border-b border-slate-800/50 px-6 py-4">
            <h2 className="text-sm font-semibold text-white">System Status</h2>
          </div>
          <div className="space-y-0 divide-y divide-slate-800/50">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-6 py-3">
                    <div className="h-4 w-24 rounded bg-slate-800/50" />
                    <div className="h-5 w-16 rounded bg-slate-800/50" />
                  </div>
                ))
              : systemStatus.map((svc) => (
                  <div key={svc.name} className="flex items-center justify-between px-6 py-3">
                    <span className="text-sm text-slate-300">{svc.name}</span>
                    <Badge
                      variant={
                        svc.status === 'online'
                          ? 'success'
                          : svc.status === 'warning'
                            ? 'warning'
                            : 'danger'
                      }
                      size="sm"
                    >
                      {svc.status === 'online'
                        ? 'Operational'
                        : svc.status === 'warning'
                          ? 'Degraded'
                          : 'Offline'}
                    </Badge>
                  </div>
                ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
