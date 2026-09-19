import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search,
  Download,
  Trash2,
  Eye,
  Filter,
  Clock,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from 'lucide-react'
import { Card, Badge, EmptyState, Input } from '../components/ui'
import api from '../lib/axios'
import type { AnalysisStatus } from '../types/analysis'
import type { MediaType } from '../config/media-registry'

const STATUS_CONFIG: Record<
  AnalysisStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info'; icon: React.ElementType }
> = {
  completed: { label: 'Completed', variant: 'success', icon: CheckCircle },
  processing: { label: 'Processing', variant: 'info', icon: Loader2 },
  failed: { label: 'Failed', variant: 'danger', icon: AlertTriangle },
  needs_review: { label: 'Needs Review', variant: 'warning', icon: AlertTriangle },
}

const MEDIA_TYPE_OPTIONS: { value: MediaType | 'all'; label: string }[] = [
  { value: 'all', label: 'All Types' },
  { value: 'text', label: 'Text' },
  { value: 'image', label: 'Image' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
  { value: 'document', label: 'Document' },
]

const STATUS_OPTIONS: { value: AnalysisStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All Status' },
  { value: 'completed', label: 'Completed' },
  { value: 'processing', label: 'Processing' },
  { value: 'failed', label: 'Failed' },
  { value: 'needs_review', label: 'Needs Review' },
]

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
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

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getConfidenceColor(score: number): string {
  if (score > 70) return 'text-amber-400'
  if (score > 40) return 'text-yellow-400'
  return 'text-emerald-400'
}

interface HistoryItem {
  id: string
  filename: string
  mediaType: MediaType
  status: AnalysisStatus
  confidence: number
  assessment: string
  timestamp: string
  sizeBytes: number
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<AnalysisStatus | 'all'>('all')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    async function fetchHistory() {
      try {
        const res = await api.get('/analysis-v2/', {
          params: { page_size: 100 },
          signal: controller.signal,
        })
        const items = (res.data?.items ?? []).map((item: Record<string, unknown>) => ({
          id: item.id as string,
          filename: (item.input_text as string)?.slice(0, 40) || 'Text analysis',
          mediaType: (item.modality as MediaType) || 'text',
          status: (item.status as AnalysisStatus) || 'completed',
          confidence: 0,
          assessment: 'Pending',
          timestamp: (item.created_at as string) || new Date().toISOString(),
          sizeBytes: 0,
        }))
        setHistory(items)
      } catch {
        setHistory([])
      } finally {
        setLoading(false)
      }
    }
    fetchHistory()
    return () => controller.abort()
  }, [])

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesSearch = item.filename.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesMediaType = mediaTypeFilter === 'all' || item.mediaType === mediaTypeFilter
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      return matchesSearch && matchesMediaType && matchesStatus
    })
  }, [history, searchQuery, mediaTypeFilter, statusFilter])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Analysis History</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review past content analyses with stable IDs and status tracking.
          </p>
        </div>
        <Badge variant="info" size="sm">
          {filteredHistory.length} analyses
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <Input
            placeholder="Search by filename..."
            icon={<Search className="h-4 w-4" />}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <select
              value={mediaTypeFilter}
              onChange={(e) => setMediaTypeFilter(e.target.value as MediaType | 'all')}
              className="h-10 appearance-none rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 pl-3 pr-8 text-sm text-slate-900 dark:text-white transition-all focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
            >
              {MEDIA_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <Filter className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as AnalysisStatus | 'all')}
              className="h-10 appearance-none rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 pl-3 pr-8 text-sm text-slate-900 dark:text-white transition-all focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <Filter className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          </div>
        </div>
      </div>

      {/* History table */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200/50 dark:border-slate-800/50 text-xs text-slate-500">
                <th className="px-6 py-3 font-medium">File</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">AI Score</th>
                <th className="px-6 py-3 font-medium">Assessment</th>
                <th className="px-6 py-3 font-medium">Size</th>
                <th className="px-6 py-3 font-medium">Date</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/50 dark:divide-slate-800/50">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-3">
                        <div className="h-4 w-32 rounded bg-slate-200/50 dark:bg-slate-800/50" />
                      </td>
                      <td className="px-6 py-3">
                        <div className="h-5 w-16 rounded bg-slate-200/50 dark:bg-slate-800/50" />
                      </td>
                      <td className="px-6 py-3">
                        <div className="h-4 w-12 rounded bg-slate-200/50 dark:bg-slate-800/50" />
                      </td>
                      <td className="px-6 py-3">
                        <div className="h-4 w-24 rounded bg-slate-200/50 dark:bg-slate-800/50" />
                      </td>
                      <td className="px-6 py-3">
                        <div className="h-4 w-16 rounded bg-slate-200/50 dark:bg-slate-800/50" />
                      </td>
                      <td className="px-6 py-3">
                        <div className="h-4 w-20 rounded bg-slate-200/50 dark:bg-slate-800/50" />
                      </td>
                      <td className="px-6 py-3">
                        <div className="h-5 w-20 rounded bg-slate-200/50 dark:bg-slate-800/50" />
                      </td>
                      <td className="px-6 py-3">
                        <div className="h-4 w-16 rounded bg-slate-200/50 dark:bg-slate-800/50" />
                      </td>
                    </tr>
                  ))
                : filteredHistory.map((item) => {
                    const statusConfig = STATUS_CONFIG[item.status]
                    const StatusIcon = statusConfig.icon

                    return (
                      <tr
                        key={item.id}
                        className="transition hover:bg-slate-100/20 dark:hover:bg-slate-800/20 cursor-pointer"
                        onClick={() => navigate(`/result/${item.id}`)}
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-[10px] text-slate-600">{item.id}</span>
                          </div>
                          <p className="text-slate-900 dark:text-white font-medium">{item.filename}</p>
                        </td>
                        <td className="px-6 py-3">
                          <Badge size="sm" className="capitalize">
                            {item.mediaType}
                          </Badge>
                        </td>
                        <td className="px-6 py-3">
                          {item.confidence > 0 ? (
                            <div className="flex items-center gap-2">
                              <span
                                className={`font-semibold ${getConfidenceColor(item.confidence * 100)}`}
                              >
                                {(item.confidence * 100).toFixed(0)}%
                              </span>
                              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                                <div
                                  className={`h-full rounded-full ${
                                    item.confidence > 0.7
                                      ? 'bg-amber-500'
                                      : item.confidence > 0.4
                                        ? 'bg-yellow-500'
                                        : 'bg-emerald-500'
                                  }`}
                                  style={{ width: `${item.confidence * 100}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-600">--</span>
                          )}
                        </td>
                        <td className="px-6 py-3">
                          <span className="text-xs text-slate-500 dark:text-slate-400">{item.assessment}</span>
                        </td>
                        <td className="px-6 py-3 text-xs text-slate-500">
                          {formatBytes(item.sizeBytes)}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <Clock className="h-3.5 w-3.5" />
                            <span className="text-xs">{formatTimestamp(item.timestamp)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3">
                          <Badge variant={statusConfig.variant} size="sm">
                            <StatusIcon
                              className={`h-3 w-3 ${
                                item.status === 'processing' ? 'animate-spin' : ''
                              }`}
                            />
                            {statusConfig.label}
                          </Badge>
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => navigate(`/result/${item.id}`)}
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-cyan-400"
                              aria-label="View"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                              aria-label="Download"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </button>
                            <button
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-400"
                              aria-label="Delete"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
        {!loading && filteredHistory.length === 0 && (
          <EmptyState
            title="No analyses found"
            description={
              searchQuery || mediaTypeFilter !== 'all' || statusFilter !== 'all'
                ? 'Try adjusting your filters.'
                : 'Run your first content analysis to see results here.'
            }
          />
        )}
      </Card>
    </div>
  )
}
