import { useEffect, useState } from 'react'
import { BrainCircuit, ArrowUpRight } from 'lucide-react'
import { Card, Badge, Button, Progress, EmptyState } from '../../components/ui'
import { mlopsService } from '../../services/mlops.service'
import type { Model } from '../../types/mlops'

const statusBadge: Record<string, { variant: 'success' | 'info' | 'default'; label: string }> = {
  production: { variant: 'success', label: 'Production' },
  staging: { variant: 'info', label: 'Staging' },
  development: { variant: 'default', label: 'Development' },
}

export default function ModelsPage() {
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await mlopsService.listModels()
        if (!cancelled) setModels(data)
      } catch {
        // errors silently handled
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Models</h1>
            <p className="mt-1 text-sm text-slate-500">Loading models...</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse space-y-4">
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
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Models</h1>
          <p className="mt-1 text-sm text-slate-500">View registered ML models and their status.</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {models.map((model) => {
          const latestVersion =
            model.versions.find((v) => v.status === 'production') || model.versions[0]
          const status = latestVersion?.status || 'development'
          const st = statusBadge[status] || statusBadge.development
          return (
            <Card key={model.id} variant="interactive">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                    <BrainCircuit className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{model.name}</h3>
                    <p className="text-xs text-slate-500">
                      {model.modality} — {model.versions.length} version(s)
                    </p>
                  </div>
                </div>
                <Badge variant={st.variant} size="sm">
                  {st.label}
                </Badge>
              </div>
              <div className="mt-4 space-y-2">
                <Progress
                  value={(latestVersion?.metrics?.accuracy ?? 0) * 100}
                  showLabel
                  label="Accuracy"
                  size="sm"
                />
                <Progress
                  value={(latestVersion?.metrics?.f1Score ?? 0) * 100}
                  showLabel
                  label="F1 Score"
                  size="sm"
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Trained:{' '}
                  {latestVersion?.createdAt
                    ? new Date(latestVersion.createdAt).toLocaleDateString()
                    : 'N/A'}
                </span>
                <Button variant="ghost" size="sm" icon={<ArrowUpRight className="h-3 w-3" />}>
                  Details
                </Button>
              </div>
            </Card>
          )
        })}
      </div>

      {models.length === 0 && (
        <EmptyState
          title="No models"
          description="Train your first model to see it registered here."
          icon={<BrainCircuit className="h-7 w-7" />}
        />
      )}
    </div>
  )
}
