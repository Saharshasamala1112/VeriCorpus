import { useState, useEffect, useCallback } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import TrainingPipeline from './TrainingPipeline'
import TrainingJobList from './TrainingJobList'
import DatasetVersionManager from './DatasetVersionManager'
import TriggerManager from './TriggerManager'
import ModelPromotion from './ModelPromotion'
import ModelEvaluation from './ModelEvaluation'
import DriftMonitor from './DriftMonitor'
import ActiveLearner from './ActiveLearner'
import EvaluationDetail from './EvaluationDetail'
import { lifelongLearningService } from '../../services/lifelong-learning.service'
import type {
  TrainingTrigger,
  TrainingJob,
  ModelCandidate,
  PromotionRecord,
  DriftSnapshot,
  ActiveLearningCandidate,
  EvaluationRun,
  ModelComparison,
  TriggerType,
  QualityGateResult,
} from '../../types/lifelong-learning'

type TabId =
  'overview' | 'triggers' | 'training' | 'datasets' | 'models' | 'drift' | 'active_learning'

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: 'Overview', icon: '🏠' },
  { id: 'triggers', label: 'Triggers', icon: '⏰' },
  { id: 'training', label: 'Training', icon: '🏋️' },
  { id: 'datasets', label: 'Datasets', icon: '📦' },
  { id: 'models', label: 'Models', icon: '🤖' },
  { id: 'drift', label: 'Drift', icon: '📊' },
  { id: 'active_learning', label: 'Active Learning', icon: '🧠' },
]

export default function LifelongLearningOrchestrator() {
  const [activeTab, setActiveTab] = useState<TabId>('overview')
  const [loading, setLoading] = useState(false)

  // Data state
  const [triggers, setTriggers] = useState<TrainingTrigger[]>([])
  const [jobs, setJobs] = useState<TrainingJob[]>([])
  const [candidates, setCandidates] = useState<ModelCandidate[]>([])
  const [promotions, setPromotions] = useState<PromotionRecord[]>([])
  const [driftSnapshots, setDriftSnapshots] = useState<DriftSnapshot[]>([])
  const [driftAlerts, setDriftAlerts] = useState<DriftSnapshot[]>([])
  const [activeLearningCandidates, setActiveLearningCandidates] = useState<
    ActiveLearningCandidate[]
  >([])
  const [_evaluations, setEvaluations] = useState<EvaluationRun[]>([])
  const [selectedEvaluation, setSelectedEvaluation] = useState<EvaluationRun | null>(null)
  const [gateResults, setGateResults] = useState<QualityGateResult[]>([])
  const [selectedComparison] = useState<ModelComparison | null>(null)
  const [pipelineStatus, setPipelineStatus] = useState<Record<string, number>>({})

  // Fetch all data
  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [triggerData, jobData, candidateData, promotionData, evalData, alData, statusData] =
        await Promise.all([
          lifelongLearningService.listTriggers(),
          lifelongLearningService.listJobs({ limit: 50 }),
          lifelongLearningService.listCandidates({ limit: 20 }),
          lifelongLearningService.listPromotions({ limit: 20 }),
          lifelongLearningService.listEvaluations({ limit: 20 }),
          lifelongLearningService.listActiveLearningCandidates({ limit: 20 }),
          lifelongLearningService.getPipelineStatus(),
        ])

      setTriggers(triggerData)
      setJobs(jobData)
      setCandidates(candidateData)
      setPromotions(promotionData)
      setEvaluations(evalData as EvaluationRun[])
      setActiveLearningCandidates(alData)

      setPipelineStatus({
        dataset_candidates: statusData.datasetCandidates,
        pending_approvals: statusData.pendingApprovals,
        active_training_jobs: statusData.activeTrainingJobs,
        completed_training_jobs: statusData.completedTrainingJobs,
        failed_training_jobs: statusData.failedTrainingJobs,
        models_in_staging: statusData.modelsInStaging,
        models_in_production: statusData.modelsInProduction,
        drift_alerts: statusData.driftAlerts,
        active_learning_pending: statusData.activeLearningPending,
      })

      const resolvedGateResults = evalData.length > 0 ? (evalData[0]?.gateResults ?? []) : []
      setGateResults(resolvedGateResults)

      // Fetch drift data for the first model with drift data
      if (candidateData.length > 0) {
        const modelId = candidateData[0].modelId
        const [snapshotData, alertData] = await Promise.all([
          lifelongLearningService.listDriftSnapshots(modelId),
          lifelongLearningService.getDriftAlerts(modelId),
        ])
        setDriftSnapshots(snapshotData)
        setDriftAlerts(alertData)
      }
    } catch {
      // Silently handle errors - components will show empty states
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handlers
  const handleCreateTrigger = async (params: {
    type: TriggerType
    name: string
    description: string
    config: Record<string, unknown>
    cooldownMinutes: number
  }) => {
    await lifelongLearningService.createTrigger(params)
    fetchData()
  }

  const handleToggleTrigger = async (triggerId: string, active: boolean) => {
    await lifelongLearningService.updateTrigger(triggerId, {
      status: active ? 'active' : 'paused',
    })
    fetchData()
  }

  const handleEvaluateTrigger = async (triggerId: string) => {
    await lifelongLearningService.evaluateTrigger(triggerId)
    fetchData()
  }

  const handleApproveEvaluation = async () => {
    if (!selectedEvaluation) return
    await lifelongLearningService.approveEvaluation(
      selectedEvaluation.id,
      true,
      'Approved by admin',
    )
    fetchData()
    setSelectedEvaluation(null)
  }

  const handleRejectEvaluation = async () => {
    if (!selectedEvaluation) return
    await lifelongLearningService.approveEvaluation(
      selectedEvaluation.id,
      false,
      'Rejected by admin',
    )
    fetchData()
    setSelectedEvaluation(null)
  }

  const handlePromoteCandidate = async (candidateId: string) => {
    const candidate = candidates.find((c) => c.id === candidateId)
    if (!candidate) return
    await lifelongLearningService.promote(candidate.modelId, candidate.version, 'Promoted by admin')
    fetchData()
  }

  const handleRollback = async (modelId: string, versionId: string) => {
    await lifelongLearningService.rollback(modelId, versionId, 'Rollback by admin')
    fetchData()
  }

  const handleAnnotate = async (candidateId: string, annotation: string) => {
    await lifelongLearningService.annotateCandidate(candidateId, annotation, 'admin')
    fetchData()
  }

  const handleSkip = async (candidateId: string) => {
    await lifelongLearningService.skipCandidate(candidateId)
    fetchData()
  }

  const activeJob = jobs.find(
    (j) => j.status !== 'succeeded' && j.status !== 'failed' && j.status !== 'cancelled',
  )

  const healthStatus =
    driftAlerts.length > 0
      ? 'critical'
      : jobs.some((j) => j.status === 'failed')
        ? 'degraded'
        : 'healthy'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">Lifelong Learning System</h1>
          <p className="text-xs text-slate-400">
            Continuous model improvement from expanding corpus
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge
            variant={
              healthStatus === 'healthy'
                ? 'success'
                : healthStatus === 'degraded'
                  ? 'warning'
                  : 'danger'
            }
          >
            {healthStatus === 'healthy'
              ? 'System Healthy'
              : healthStatus === 'degraded'
                ? 'Degraded'
                : 'Critical'}
          </Badge>
          <button
            onClick={fetchData}
            disabled={loading}
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-slate-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Pipeline visualization */}
      <TrainingPipeline jobs={jobs} currentStage={activeJob?.pipelineStage} />

      {/* Tab navigation */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-800/60 bg-slate-900/30 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                : 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
            }`}
          >
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {/* Pipeline status cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                {
                  label: 'Active Jobs',
                  value: pipelineStatus['active_training_jobs'] || 0,
                  variant: 'info' as const,
                },
                {
                  label: 'Completed',
                  value: pipelineStatus['completed_training_jobs'] || 0,
                  variant: 'success' as const,
                },
                {
                  label: 'Failed',
                  value: pipelineStatus['failed_training_jobs'] || 0,
                  variant: 'danger' as const,
                },
                {
                  label: 'Pending Approval',
                  value: pipelineStatus['pending_approvals'] || 0,
                  variant: 'warning' as const,
                },
              ].map((stat) => (
                <Card key={stat.label} padding="sm">
                  <p className="text-[10px] text-slate-500">{stat.label}</p>
                  <p className="text-xl font-bold text-slate-200">{stat.value}</p>
                </Card>
              ))}
            </div>

            {/* Recent jobs */}
            <TrainingJobList jobs={jobs.slice(0, 10)} />
          </div>

          <div className="space-y-4">
            {/* Quick stats */}
            <Card padding="md">
              <h3 className="mb-3 text-sm font-semibold text-slate-200">System Status</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Triggers Active</span>
                  <span className="text-xs font-medium text-slate-300">
                    {triggers.filter((t) => t.status === 'active').length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Models in Production</span>
                  <span className="text-xs font-medium text-slate-300">
                    {pipelineStatus['models_in_production'] || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Models in Staging</span>
                  <span className="text-xs font-medium text-slate-300">
                    {pipelineStatus['models_in_staging'] || 0}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Drift Alerts</span>
                  <Badge variant={driftAlerts.length > 0 ? 'danger' : 'success'} size="sm">
                    {driftAlerts.length}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Active Learning</span>
                  <Badge
                    variant={
                      activeLearningCandidates.filter((c) => c.status === 'pending').length > 0
                        ? 'warning'
                        : 'default'
                    }
                    size="sm"
                  >
                    {activeLearningCandidates.filter((c) => c.status === 'pending').length} pending
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Promotion queue */}
            <ModelPromotion
              candidates={candidates.slice(0, 5)}
              promotions={promotions.slice(0, 5)}
              onPromote={handlePromoteCandidate}
              onRollback={handleRollback}
              loading={loading}
            />
          </div>
        </div>
      )}

      {activeTab === 'triggers' && (
        <TriggerManager
          triggers={triggers}
          onCreateTrigger={handleCreateTrigger}
          onToggleTrigger={handleToggleTrigger}
          onEvaluateTrigger={handleEvaluateTrigger}
          loading={loading}
        />
      )}

      {activeTab === 'training' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TrainingJobList jobs={jobs} />
          {selectedEvaluation && (
            <EvaluationDetail evaluation={selectedEvaluation} gateResults={gateResults} />
          )}
        </div>
      )}

      {activeTab === 'datasets' && <DatasetVersionManager versions={[]} />}

      {activeTab === 'models' && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ModelPromotion
            candidates={candidates}
            promotions={promotions}
            onPromote={handlePromoteCandidate}
            onRollback={handleRollback}
            loading={loading}
          />
          <ModelEvaluation
            comparison={selectedComparison}
            onApprove={handleApproveEvaluation}
            onReject={handleRejectEvaluation}
            loading={loading}
          />
        </div>
      )}

      {activeTab === 'drift' && <DriftMonitor snapshots={driftSnapshots} alerts={driftAlerts} />}

      {activeTab === 'active_learning' && (
        <ActiveLearner
          candidates={activeLearningCandidates}
          onAnnotate={handleAnnotate}
          onSkip={handleSkip}
          loading={loading}
        />
      )}
    </div>
  )
}
