import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, BarChart3, Minus, TrendingUp, TrendingDown } from 'lucide-react'
import { Card, Badge, Button, Progress, Select } from '../../components/ui'
import AuthGate from '../../components/ml/AuthGate'
import { mlopsService } from '../../services/mlops.service'
import { AUTHORIZED_ROLES_FOR_MLOPS } from '../../types/mlops'
import type { Model } from '../../types/mlops'

function MetricComparison({
  label,
  production,
  candidate,
  higherIsBetter = true,
}: {
  label: string
  production: number
  candidate: number
  higherIsBetter?: boolean
}) {
  const delta = candidate - production
  const isSame = delta === 0
  const isBetter = higherIsBetter ? delta > 0 : delta < 0

  return (
    <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 uppercase tracking-wider">{label}</span>
        <span
          className={`flex items-center gap-1 text-xs font-medium ${
            isSame ? 'text-slate-500' : isBetter ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {isSame ? (
            <Minus className="h-3 w-3" />
          ) : isBetter ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {isSame ? 'Same' : `${delta > 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-[11px] text-slate-500 mb-1">Production</p>
          <Progress
            value={production * 100}
            showLabel
            label={`${(production * 100).toFixed(1)}%`}
            size="sm"
          />
        </div>
        <div>
          <p className="text-[11px] text-slate-500 mb-1">Candidate</p>
          <Progress
            value={candidate * 100}
            showLabel
            label={`${(candidate * 100).toFixed(1)}%`}
            size="sm"
            variant={isBetter ? 'success' : isSame ? 'default' : 'danger'}
          />
        </div>
      </div>
    </div>
  )
}

export default function ModelComparison() {
  const navigate = useNavigate()

  const [models, setModels] = useState<Model[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null)
  const [productionVersionId, setProductionVersionId] = useState<string | null>(null)
  const [candidateVersionId, setCandidateVersionId] = useState<string | null>(null)
  const initializedRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await mlopsService.listModelsV2()
        if (!cancelled) {
          setModels(data)
          if (data.length > 0 && !initializedRef.current) {
            initializedRef.current = true
            setSelectedModelId(data[0].id)
          }
        }
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

  const model = models.find((m) => m.id === selectedModelId)

  if (loading) {
    return (
      <AuthGate allowedRoles={AUTHORIZED_ROLES_FOR_MLOPS}>
        <div className="space-y-6 animate-pulse">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-slate-800" />
            <div>
              <div className="h-8 w-48 rounded bg-slate-800" />
              <div className="mt-1 h-4 w-64 rounded bg-slate-800" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} padding="sm" className="space-y-2">
                <div className="h-3 w-20 rounded bg-slate-800" />
                <div className="h-9 w-full rounded bg-slate-800" />
              </Card>
            ))}
          </div>
          <Card className="h-48 rounded-xl bg-slate-800/50" />
        </div>
      </AuthGate>
    )
  }

  const productionVersions = model?.versions.filter((v) => v.status === 'production') ?? []
  const candidateVersions = model?.versions.filter((v) => v.status === 'staging') ?? []

  const productionVersion =
    productionVersions.find((v) => v.id === productionVersionId) ?? productionVersions[0] ?? null
  const candidateVersion =
    candidateVersions.find((v) => v.id === candidateVersionId) ?? candidateVersions[0] ?? null

  return (
    <AuthGate allowedRoles={AUTHORIZED_ROLES_FOR_MLOPS}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/ml/models')}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">Model Comparison</h1>
              <p className="mt-1 text-sm text-slate-500">
                Compare production vs candidate model versions before promotion.
              </p>
            </div>
          </div>
        </div>

        {/* Selectors */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card padding="sm">
            <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-2">
              Model
            </label>
            <Select
              value={selectedModelId ?? ''}
              onChange={(val) => {
                setSelectedModelId(val)
                setProductionVersionId(null)
                setCandidateVersionId(null)
              }}
              options={models.map((m) => ({ value: m.id, label: m.name }))}
              placeholder="Select a model..."
            />
          </Card>
          <Card padding="sm">
            <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-2">
              Production Version
            </label>
            <Select
              value={productionVersion?.id ?? ''}
              onChange={(val) => setProductionVersionId(val)}
              options={productionVersions.map((v) => ({
                value: v.id,
                label: `${v.version} — ${v.datasetVersion}`,
              }))}
              placeholder="Select production version..."
            />
          </Card>
          <Card padding="sm">
            <label className="block text-[11px] text-slate-500 uppercase tracking-wider mb-2">
              Candidate Version
            </label>
            <Select
              value={candidateVersion?.id ?? ''}
              onChange={(val) => setCandidateVersionId(val)}
              options={candidateVersions.map((v) => ({
                value: v.id,
                label: `${v.version} — ${v.datasetVersion}`,
              }))}
              placeholder="Select candidate version..."
            />
          </Card>
        </div>

        {/* Comparison */}
        {productionVersion && candidateVersion ? (
          <>
            {/* Header cards */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Card className="border-emerald-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <Badge variant="success" size="sm">
                    Production
                  </Badge>
                  <h3 className="text-sm font-semibold text-white">{productionVersion.version}</h3>
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <p>Dataset: {productionVersion.datasetVersion}</p>
                  <p>Training: {productionVersion.trainingRunId}</p>
                  <p>Evaluated: {new Date(productionVersion.lastEvaluatedAt).toLocaleString()}</p>
                </div>
              </Card>
              <Card className="border-cyan-500/20">
                <div className="flex items-center gap-3 mb-3">
                  <Badge variant="info" size="sm">
                    Candidate
                  </Badge>
                  <h3 className="text-sm font-semibold text-white">{candidateVersion.version}</h3>
                </div>
                <div className="space-y-1 text-xs text-slate-400">
                  <p>Dataset: {candidateVersion.datasetVersion}</p>
                  <p>Training: {candidateVersion.trainingRunId}</p>
                  <p>Evaluated: {new Date(candidateVersion.lastEvaluatedAt).toLocaleString()}</p>
                </div>
              </Card>
            </div>

            {/* Metric comparisons */}
            <Card>
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
                <BarChart3 className="h-4 w-4 text-cyan-400" />
                Metric Comparison
              </h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <MetricComparison
                  label="Accuracy"
                  production={productionVersion.metrics.accuracy}
                  candidate={candidateVersion.metrics.accuracy}
                />
                <MetricComparison
                  label="F1 Score"
                  production={productionVersion.metrics.f1Score}
                  candidate={candidateVersion.metrics.f1Score}
                />
                <MetricComparison
                  label="Precision"
                  production={productionVersion.metrics.precision}
                  candidate={candidateVersion.metrics.precision}
                />
                <MetricComparison
                  label="Recall"
                  production={productionVersion.metrics.recall}
                  candidate={candidateVersion.metrics.recall}
                />
                {productionVersion.metrics.aucRoc != null &&
                  candidateVersion.metrics.aucRoc != null && (
                    <MetricComparison
                      label="AUC-ROC"
                      production={productionVersion.metrics.aucRoc}
                      candidate={candidateVersion.metrics.aucRoc}
                    />
                  )}
                {productionVersion.metrics.loss != null &&
                  candidateVersion.metrics.loss != null && (
                    <MetricComparison
                      label="Loss (lower is better)"
                      production={productionVersion.metrics.loss}
                      candidate={candidateVersion.metrics.loss}
                      higherIsBetter={false}
                    />
                  )}
              </div>
            </Card>

            {/* Changelog */}
            <Card>
              <h3 className="mb-3 text-sm font-semibold text-white">Changelog</h3>
              <div className="space-y-3">
                <div>
                  <p className="text-xs text-slate-500 mb-1">
                    Production ({productionVersion.version})
                  </p>
                  <p className="text-sm text-slate-300">{productionVersion.changelog}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 mb-1">
                    Candidate ({candidateVersion.version})
                  </p>
                  <p className="text-sm text-slate-300">{candidateVersion.changelog}</p>
                </div>
              </div>
            </Card>

            {/* Promotion recommendation */}
            <Card className="border-cyan-500/20 bg-cyan-500/5">
              <h3 className="mb-2 text-sm font-semibold text-white">Promotion Summary</h3>
              <p className="text-xs text-slate-400 mb-4">
                Review the metric differences above before promoting the candidate to production.
                Promotion requires authorized roles and will be logged.
              </p>
              <Button onClick={() => navigate(`/ml/models/${model?.id}`)}>
                View Full Model Details
              </Button>
            </Card>
          </>
        ) : (
          <Card className="text-center py-12">
            <BarChart3 className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">Select a model to compare</h3>
            <p className="text-sm text-slate-400">
              Choose a model and two versions to see a detailed comparison.
            </p>
          </Card>
        )}
      </div>
    </AuthGate>
  )
}
