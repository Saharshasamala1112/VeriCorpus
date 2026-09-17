import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BrainCircuit,
  CheckCircle,
  Clock,
  Archive,
  Beaker,
  BarChart3,
  Shield,
  AlertTriangle,
  ArrowUpRight,
  History,
} from 'lucide-react'
import {
  Card,
  Badge,
  Button,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Modal,
} from '../../components/ui'
import AuthGate, { useIsAuthorized } from '../../components/ml/AuthGate'
import { mlopsService } from '../../services/mlops.service'
import {
  AUTHORIZED_ROLES_FOR_MLOPS,
  AUTHORIZED_ROLES_FOR_PROMOTION,
  AUTHORIZED_ROLES_FOR_ROLLBACK,
} from '../../types/mlops'
import type { Model, ModelVersion, ModelStatus } from '../../types/mlops'

const STATUS_CONFIG: Record<
  ModelStatus,
  { label: string; variant: 'success' | 'info' | 'default' | 'danger'; icon: React.ElementType }
> = {
  production: { label: 'Production', variant: 'success', icon: CheckCircle },
  staging: { label: 'Staging', variant: 'info', icon: Beaker },
  development: { label: 'Development', variant: 'default', icon: Clock },
  archived: { label: 'Archived', variant: 'danger', icon: Archive },
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

function SkeletonDetail() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-slate-800" />
        <div>
          <div className="h-6 w-48 rounded bg-slate-800" />
          <div className="mt-1 h-4 w-32 rounded bg-slate-800" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} padding="sm" className="space-y-2">
            <div className="h-3 w-16 rounded bg-slate-800" />
            <div className="h-5 w-24 rounded bg-slate-800" />
          </Card>
        ))}
      </div>
      <Card className="space-y-4">
        <div className="h-5 w-40 rounded bg-slate-800" />
        <div className="grid gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg bg-slate-800/30 p-3 space-y-2">
              <div className="h-3 w-12 rounded bg-slate-800" />
              <div className="h-6 w-16 rounded bg-slate-800" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

export default function ModelDetail() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [model, setModel] = useState<Model | null>(null)
  const [loading, setLoading] = useState(true)

  const [showPromoteModal, setShowPromoteModal] = useState(false)
  const [showRollbackModal, setShowRollbackModal] = useState(false)
  const [promoteVersion, setPromoteVersion] = useState<ModelVersion | null>(null)
  const [rollbackToVersion, setRollbackToVersion] = useState<ModelVersion | null>(null)
  const [promotionReason, setPromotionReason] = useState('')
  const [rollbackReason, setRollbackReason] = useState('')

  const canPromote = useIsAuthorized(AUTHORIZED_ROLES_FOR_PROMOTION)
  const canRollback = useIsAuthorized(AUTHORIZED_ROLES_FOR_ROLLBACK)

  useEffect(() => {
    let cancelled = false
    async function load() {
      if (!id) return
      try {
        const data = await mlopsService.getModel(id)
        if (!cancelled) setModel(data)
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
        <SkeletonDetail />
      </AuthGate>
    )
  }

  if (!model) {
    return (
      <AuthGate allowedRoles={AUTHORIZED_ROLES_FOR_MLOPS}>
        <div className="space-y-6">
          <button
            onClick={() => navigate('/ml/models')}
            className="flex items-center gap-2 text-sm text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Models
          </button>
          <Card className="text-center py-12">
            <BrainCircuit className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white">Model not found</h3>
            <p className="mt-2 text-sm text-slate-400">
              The requested model could not be found or you may not have access.
            </p>
          </Card>
        </div>
      </AuthGate>
    )
  }

  const productionVersion = model.versions.find((v) => v.status === 'production')
  const stagingVersions = model.versions.filter((v) => v.status === 'staging')
  const archivedVersions = model.versions.filter((v) => v.status === 'archived')

  const handlePromote = async () => {
    if (!promoteVersion || !model) return
    const success = await mlopsService.promoteModel(
      model.id,
      promoteVersion.version,
      promotionReason,
    )
    if (success) {
      const refreshed = await mlopsService.getModel(model.id)
      if (refreshed) setModel(refreshed)
    }
    setShowPromoteModal(false)
    setPromoteVersion(null)
    setPromotionReason('')
  }

  const handleRollback = async () => {
    if (!rollbackToVersion || !model) return
    const success = await mlopsService.rollbackModel(
      model.id,
      rollbackToVersion.version,
      rollbackReason,
    )
    if (success) {
      const refreshed = await mlopsService.getModel(model.id)
      if (refreshed) setModel(refreshed)
    }
    setShowRollbackModal(false)
    setRollbackToVersion(null)
    setRollbackReason('')
  }

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
              <h1 className="text-xl font-bold text-white">{model.name}</h1>
              <p className="text-sm text-slate-500">
                {model.task} — {model.modality}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/ml/compare')}
              icon={<BarChart3 className="h-3.5 w-3.5" />}
            >
              Compare Versions
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultTab="overview">
          <TabsList>
            <TabsTrigger id="overview">Overview</TabsTrigger>
            <TabsTrigger id="versions">Versions</TabsTrigger>
            <TabsTrigger id="training">Training Runs</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent id="overview">
            <div className="space-y-4">
              {/* Key info */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card padding="sm">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Model</p>
                  <p className="mt-1 text-sm font-semibold text-white">{model.name}</p>
                </Card>
                <Card padding="sm">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">
                    Production Version
                  </p>
                  <p className="mt-1 text-sm font-semibold text-emerald-400">
                    {model.currentProductionVersion}
                  </p>
                </Card>
                <Card padding="sm">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">Dataset</p>
                  <p className="mt-1 text-sm font-semibold text-white">{model.datasetName}</p>
                </Card>
                <Card padding="sm">
                  <p className="text-[11px] text-slate-500 uppercase tracking-wider">
                    Last Updated
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {formatTimestamp(model.updatedAt)}
                  </p>
                </Card>
              </div>

              {/* Production version details */}
              {productionVersion && (
                <Card>
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <CheckCircle className="h-4 w-4 text-emerald-400" />
                    Production Version: {productionVersion.version}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg bg-slate-800/30 p-3">
                      <p className="text-[11px] text-slate-500">Accuracy</p>
                      <p className="text-lg font-bold text-white">
                        {(productionVersion.metrics.accuracy * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-800/30 p-3">
                      <p className="text-[11px] text-slate-500">F1 Score</p>
                      <p className="text-lg font-bold text-white">
                        {(productionVersion.metrics.f1Score * 100).toFixed(1)}%
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-800/30 p-3">
                      <p className="text-[11px] text-slate-500">AUC-ROC</p>
                      <p className="text-lg font-bold text-white">
                        {productionVersion.metrics.aucRoc
                          ? (productionVersion.metrics.aucRoc * 100).toFixed(1)
                          : 'N/A'}
                        {productionVersion.metrics.aucRoc ? '%' : ''}
                      </p>
                    </div>
                    <div className="rounded-lg bg-slate-800/30 p-3">
                      <p className="text-[11px] text-slate-500">Loss</p>
                      <p className="text-lg font-bold text-white">
                        {productionVersion.metrics.loss?.toFixed(3) ?? 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
                    <span>Dataset: {productionVersion.datasetVersion}</span>
                    <span>|</span>
                    <span>Training Run: {productionVersion.trainingRunId}</span>
                    <span>|</span>
                    <span>
                      Last evaluated: {formatTimestamp(productionVersion.lastEvaluatedAt)}
                    </span>
                  </div>
                  {productionVersion.promotedAt && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                      <Shield className="h-3.5 w-3.5 text-emerald-400" />
                      Promoted by {productionVersion.promotedBy} on{' '}
                      {formatTimestamp(productionVersion.promotedAt)}
                    </div>
                  )}
                </Card>
              )}

              {/* Candidate versions */}
              {stagingVersions.length > 0 && (
                <Card className="border-cyan-500/20 bg-cyan-500/5">
                  <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                    <Beaker className="h-4 w-4 text-cyan-400" />
                    Candidate Versions
                  </h3>
                  <div className="space-y-3">
                    {stagingVersions.map((version) => (
                      <div
                        key={version.id}
                        className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-4"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="info" size="sm">
                              {version.version}
                            </Badge>
                            <span className="text-xs text-slate-500">
                              Created {formatTimestamp(version.createdAt)}
                            </span>
                          </div>
                          {canPromote && (
                            <Button
                              size="sm"
                              onClick={() => {
                                setPromoteVersion(version)
                                setShowPromoteModal(true)
                              }}
                              icon={<ArrowUpRight className="h-3.5 w-3.5" />}
                            >
                              Promote
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-3 text-[11px]">
                          <div>
                            <span className="text-slate-500">Accuracy:</span>{' '}
                            <span className="text-white">
                              {(version.metrics.accuracy * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">F1:</span>{' '}
                            <span className="text-white">
                              {(version.metrics.f1Score * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Dataset:</span>{' '}
                            <span className="text-white">{version.datasetVersion}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Evaluated:</span>{' '}
                            <span className="text-white">
                              {formatTimestamp(version.lastEvaluatedAt)}
                            </span>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-slate-400">{version.changelog}</p>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          </TabsContent>

          {/* Versions Tab */}
          <TabsContent id="versions">
            <Card padding="none">
              <div className="divide-y divide-slate-800/50">
                {model.versions.map((version) => {
                  const statusConfig = STATUS_CONFIG[version.status]
                  const StatusIcon = statusConfig.icon

                  return (
                    <div key={version.id} className="px-6 py-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-800">
                            <StatusIcon className="h-3 w-3" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-semibold text-white">
                                {version.version}
                              </h3>
                              <Badge variant={statusConfig.variant} size="sm">
                                {statusConfig.label}
                              </Badge>
                            </div>
                            <p className="mt-1 text-xs text-slate-400">{version.changelog}</p>
                            <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                              <span>Dataset: {version.datasetVersion}</span>
                              <span>Training: {version.trainingRunId}</span>
                              <span>Created: {formatTimestamp(version.createdAt)}</span>
                              <span>Evaluated: {formatTimestamp(version.lastEvaluatedAt)}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-4 gap-4 text-xs">
                              <span className="text-slate-400">
                                Accuracy:{' '}
                                <span className="text-white">
                                  {(version.metrics.accuracy * 100).toFixed(1)}%
                                </span>
                              </span>
                              <span className="text-slate-400">
                                Precision:{' '}
                                <span className="text-white">
                                  {(version.metrics.precision * 100).toFixed(1)}%
                                </span>
                              </span>
                              <span className="text-slate-400">
                                Recall:{' '}
                                <span className="text-white">
                                  {(version.metrics.recall * 100).toFixed(1)}%
                                </span>
                              </span>
                              <span className="text-slate-400">
                                F1:{' '}
                                <span className="text-white">
                                  {(version.metrics.f1Score * 100).toFixed(1)}%
                                </span>
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          {version.status !== 'production' && canPromote && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setPromoteVersion(version)
                                setShowPromoteModal(true)
                              }}
                            >
                              Promote
                            </Button>
                          )}
                          {version.status === 'production' &&
                            canRollback &&
                            archivedVersions.length > 0 && (
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setShowRollbackModal(true)}
                              >
                                Rollback
                              </Button>
                            )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          </TabsContent>

          {/* Training Runs Tab */}
          <TabsContent id="training">
            <Card className="text-center py-12">
              <History className="h-12 w-12 text-slate-600 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Training History</h3>
              <p className="text-sm text-slate-400 mb-4">View all training runs for this model.</p>
              <Button variant="outline" onClick={() => navigate('/ml/training')}>
                View Training Dashboard
              </Button>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Promote Modal */}
        <Modal
          open={showPromoteModal}
          onClose={() => setShowPromoteModal(false)}
          title="Promote Model Version"
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-semibold text-white">Authorization Required</span>
              </div>
              <p className="text-xs text-slate-400">
                Only authorized roles (admin, ml_engineer) may promote models to production. This
                action will be recorded in the audit log.
              </p>
            </div>

            {promoteVersion && (
              <div className="rounded-lg bg-slate-800/30 p-4">
                <p className="text-xs text-slate-500 mb-1">Promoting</p>
                <p className="text-sm font-semibold text-white">
                  {promoteVersion.version} → Production
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <span className="text-slate-400">
                    Accuracy:{' '}
                    <span className="text-white">
                      {(promoteVersion.metrics.accuracy * 100).toFixed(1)}%
                    </span>
                  </span>
                  <span className="text-slate-400">
                    F1:{' '}
                    <span className="text-white">
                      {(promoteVersion.metrics.f1Score * 100).toFixed(1)}%
                    </span>
                  </span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-500 mb-1">Reason for promotion</label>
              <textarea
                value={promotionReason}
                onChange={(e) => setPromotionReason(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
                placeholder="Describe why this version should be promoted..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPromoteModal(false)}>
                Cancel
              </Button>
              <Button onClick={handlePromote} disabled={!promotionReason.trim()}>
                Confirm Promotion
              </Button>
            </div>
          </div>
        </Modal>

        {/* Rollback Modal */}
        <Modal
          open={showRollbackModal}
          onClose={() => setShowRollbackModal(false)}
          title="Rollback Model"
        >
          <div className="space-y-4">
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className="text-sm font-semibold text-white">Admin Only</span>
              </div>
              <p className="text-xs text-slate-400">
                Rollback requires admin authorization. This action will revert the production model
                to a previous version and is recorded in the audit log.
              </p>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-2">Rollback to version</label>
              <div className="space-y-2">
                {archivedVersions.map((version) => (
                  <button
                    key={version.id}
                    onClick={() => setRollbackToVersion(version)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      rollbackToVersion?.id === version.id
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-white">{version.version}</span>
                      <span className="text-[11px] text-slate-500">
                        {formatTimestamp(version.createdAt)}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-400">
                      Accuracy: {(version.metrics.accuracy * 100).toFixed(1)}% | F1:{' '}
                      {(version.metrics.f1Score * 100).toFixed(1)}%
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Reason for rollback</label>
              <textarea
                value={rollbackReason}
                onChange={(e) => setRollbackReason(e.target.value)}
                className="w-full rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
                placeholder="Describe why this rollback is necessary..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRollbackModal(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleRollback}
                disabled={!rollbackToVersion || !rollbackReason.trim()}
              >
                Confirm Rollback
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AuthGate>
  )
}
