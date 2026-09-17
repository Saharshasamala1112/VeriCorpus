import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Database,
  CheckCircle,
  Clock,
  AlertTriangle,
  User,
  GitBranch,
} from 'lucide-react'
import { Card, Badge } from '../../components/ui'
import AuthGate from '../../components/ml/AuthGate'
import { mlopsService } from '../../services/mlops.service'
import { AUTHORIZED_ROLES_FOR_MLOPS } from '../../types/mlops'
import type { Dataset } from '../../types/mlops'

const ANNOTATION_STATUS: Record<
  string,
  { variant: 'success' | 'warning' | 'info'; icon: React.ElementType }
> = {
  complete: { variant: 'success', icon: CheckCircle },
  in_progress: { variant: 'warning', icon: Clock },
  pending: { variant: 'info', icon: AlertTriangle },
}

const VALIDATION_STATUS: Record<
  string,
  { variant: 'success' | 'danger' | 'info'; icon: React.ElementType }
> = {
  passed: { variant: 'success', icon: CheckCircle },
  failed: { variant: 'danger', icon: AlertTriangle },
  pending: { variant: 'info', icon: Clock },
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

function SkeletonDatasetDetail() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-slate-800" />
        <div>
          <div className="h-6 w-48 rounded bg-slate-800" />
          <div className="mt-1 h-4 w-64 rounded bg-slate-800" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} padding="sm" className="space-y-2">
            <div className="h-3 w-20 rounded bg-slate-800" />
            <div className="h-6 w-16 rounded bg-slate-800" />
          </Card>
        ))}
      </div>
      <Card padding="none" className="space-y-0">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="px-6 py-4 border-b border-slate-800/50 space-y-2">
            <div className="h-4 w-32 rounded bg-slate-800" />
            <div className="h-3 w-48 rounded bg-slate-800" />
          </div>
        ))}
      </Card>
    </div>
  )
}

export default function DatasetVersionDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      try {
        const data = await mlopsService.getDatasetDetail(id)
        if (!cancelled) setDataset(data)
      } catch {
        // errors silently handled — show not found state
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <AuthGate allowedRoles={AUTHORIZED_ROLES_FOR_MLOPS}>
        <SkeletonDatasetDetail />
      </AuthGate>
    )
  }

  if (!dataset) {
    return (
      <AuthGate allowedRoles={AUTHORIZED_ROLES_FOR_MLOPS}>
        <div className="space-y-6">
          <button
            onClick={() => navigate('/ml/datasets')}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Datasets
          </button>
          <Card className="text-center py-12">
            <Database className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white">Dataset not found</h3>
            <p className="mt-2 text-sm text-slate-400">
              The requested dataset could not be found or you may not have access.
            </p>
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
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/ml/datasets')}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-white">{dataset.name}</h1>
              <p className="text-sm text-slate-500">{dataset.description}</p>
            </div>
          </div>
          <Badge variant={dataset.status === 'active' ? 'success' : 'warning'} size="sm">
            {dataset.status}
          </Badge>
        </div>

        {/* Overview stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <Card padding="sm">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Total Samples</p>
            <p className="mt-1 text-xl font-bold text-white">
              {dataset.totalSamples.toLocaleString()}
            </p>
          </Card>
          <Card padding="sm">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Current Version</p>
            <p className="mt-1 text-xl font-bold text-white">{dataset.currentVersion}</p>
          </Card>
          <Card padding="sm">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Quality Score</p>
            <p className="mt-1 text-xl font-bold text-emerald-400">
              {(dataset.quality.averageQualityScore * 100).toFixed(0)}%
            </p>
          </Card>
          <Card padding="sm">
            <p className="text-[11px] text-slate-500 uppercase tracking-wider">Versions</p>
            <p className="mt-1 text-xl font-bold text-white">{dataset.versions.length}</p>
          </Card>
        </div>

        {/* Version history */}
        <Card padding="none">
          <div className="border-b border-slate-800/50 px-6 py-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
              <GitBranch className="h-4 w-4 text-cyan-400" />
              Version History
            </h2>
          </div>
          <div className="divide-y divide-slate-800/50">
            {dataset.versions.map((version, i) => {
              const annotationConfig = ANNOTATION_STATUS[version.annotationStatus]
              const validationConfig = VALIDATION_STATUS[version.validationStatus]
              const AnnotationIcon = annotationConfig.icon
              const ValidationIcon = validationConfig.icon
              const isCurrent = version.version === dataset.currentVersion

              return (
                <div key={version.id} className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {/* Timeline dot */}
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-800">
                        <span className="text-[10px] font-bold text-slate-400">{i + 1}</span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">{version.version}</h3>
                          {isCurrent && (
                            <Badge variant="success" size="sm">
                              Current
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-400">{version.changelog}</p>

                        {/* Meta */}
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {version.createdBy}
                          </span>
                          <span>{formatTimestamp(version.createdAt)}</span>
                          <span>{version.sampleCount.toLocaleString()} samples</span>
                          <span>Preprocessing: {version.preprocessingVersion}</span>
                        </div>

                        {/* Status badges */}
                        <div className="mt-2 flex gap-2">
                          <Badge variant={annotationConfig.variant} size="sm">
                            <AnnotationIcon className="h-3 w-3" />
                            Annotation: {version.annotationStatus.replace('_', ' ')}
                          </Badge>
                          <Badge variant={validationConfig.variant} size="sm">
                            <ValidationIcon className="h-3 w-3" />
                            Validation: {version.validationStatus}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    {/* Changes from previous */}
                    {i < dataset.versions.length - 1 && (
                      <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-3 max-w-xs">
                        <p className="text-[11px] text-slate-500 mb-1">
                          Changes from {dataset.versions[i + 1].version}
                        </p>
                        <p className="text-xs text-slate-300">{version.changesFromPrevious}</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </AuthGate>
  )
}
