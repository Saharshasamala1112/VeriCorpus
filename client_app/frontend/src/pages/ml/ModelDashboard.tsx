import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrainCircuit, ArrowUpRight, CheckCircle, Beaker, BarChart3 } from 'lucide-react'
import { Card, Badge, Button, Progress } from '../../components/ui'
import AuthGate from '../../components/ml/AuthGate'
import { mlopsService } from '../../services/mlops.service'
import { AUTHORIZED_ROLES_FOR_MLOPS } from '../../types/mlops'
import type { Model } from '../../types/mlops'

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

export default function ModelDashboard() {
  const navigate = useNavigate()
  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await mlopsService.listModels()
        if (!cancelled) setModels(data)
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

  const totalModels = models.length
  const productionModels = models.filter((m) =>
    m.versions.some((v) => v.status === 'production'),
  ).length
  const candidateModels = models.reduce((sum, m) => sum + m.candidateVersions.length, 0)
  const totalVersions = models.reduce((sum, m) => sum + m.versions.length, 0)

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
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Model Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              Monitor model versions, evaluations, and deployment status.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/ml/compare')}
              icon={<BarChart3 className="h-3.5 w-3.5" />}
            >
              Compare
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card padding="sm" className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
              <BrainCircuit className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{totalModels}</p>
              <p className="text-xs text-slate-500">Total Models</p>
            </div>
          </Card>
          <Card padding="sm" className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{productionModels}</p>
              <p className="text-xs text-slate-500">In Production</p>
            </div>
          </Card>
          <Card padding="sm" className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
              <Beaker className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{candidateModels}</p>
              <p className="text-xs text-slate-500">Candidates</p>
            </div>
          </Card>
          <Card padding="sm" className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <BarChart3 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{totalVersions}</p>
              <p className="text-xs text-slate-500">Total Versions</p>
            </div>
          </Card>
        </div>

        {/* Empty state */}
        {models.length === 0 && (
          <Card className="text-center py-12">
            <BrainCircuit className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No models found</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No models have been registered in the pipeline yet.
            </p>
          </Card>
        )}

        {/* Model cards */}
        <div className="grid gap-4 sm:grid-cols-2">
          {models.map((model) => {
            const productionVersion = model.versions.find(
              (v) => v.version === model.currentProductionVersion,
            )
            const candidateVersion =
              model.candidateVersions.length > 0
                ? model.versions.find((v) => v.version === model.candidateVersions[0])
                : null

            return (
              <Card
                key={model.id}
                variant="interactive"
                onClick={() => navigate(`/ml/models/${model.id}`)}
              >
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200/50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                      <BrainCircuit className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{model.name}</h3>
                      <p className="text-xs text-slate-500">
                        {model.task} — {model.modality}
                      </p>
                    </div>
                  </div>
                  {productionVersion && (
                    <Badge variant="success" size="sm">
                      Production
                    </Badge>
                  )}
                </div>

                {/* Production version metrics */}
                {productionVersion && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-slate-500 uppercase tracking-wider">
                        {productionVersion.version} — Production
                      </span>
                      <span className="text-[11px] text-slate-500">
                        Dataset: {productionVersion.datasetVersion}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Progress
                          value={productionVersion.metrics.accuracy * 100}
                          showLabel
                          label="Accuracy"
                          size="sm"
                        />
                      </div>
                      <div>
                        <Progress
                          value={productionVersion.metrics.f1Score * 100}
                          showLabel
                          label="F1 Score"
                          size="sm"
                          variant="success"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Candidate */}
                {candidateVersion && (
                  <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] text-cyan-400 font-medium uppercase tracking-wider">
                        Candidate: {candidateVersion.version}
                      </span>
                      <Badge variant="info" size="sm">
                        Staging
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <span className="text-slate-500 dark:text-slate-400">
                        Accuracy:{' '}
                        <span className="text-slate-900 dark:text-white">
                          {(candidateVersion.metrics.accuracy * 100).toFixed(1)}%
                        </span>
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        F1:{' '}
                        <span className="text-slate-900 dark:text-white">
                          {(candidateVersion.metrics.f1Score * 100).toFixed(1)}%
                        </span>
                      </span>
                    </div>
                  </div>
                )}

                {/* Footer */}
                <div className="mt-4 flex items-center justify-between border-t border-slate-200/50 dark:border-slate-800/50 pt-3">
                  <span className="text-xs text-slate-500">
                    {model.versions.length} versions — {model.datasetName}
                  </span>
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
