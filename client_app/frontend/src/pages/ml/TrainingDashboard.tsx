import { useEffect, useState } from 'react'
import { Clock, CheckCircle, AlertTriangle, Loader2, Play, Calendar } from 'lucide-react'
import { Card, Badge, Tabs, TabsList, TabsTrigger, TabsContent } from '../../components/ui'
import AuthGate from '../../components/ml/AuthGate'
import { mlopsService } from '../../services/mlops.service'
import { AUTHORIZED_ROLES_FOR_MLOPS } from '../../types/mlops'
import type { TrainingStatus, TrainingJob } from '../../types/mlops'

const STATUS_CONFIG: Record<
  TrainingStatus,
  {
    label: string
    variant: 'success' | 'warning' | 'danger' | 'info' | 'default'
    icon: React.ElementType
  }
> = {
  completed: { label: 'Completed', variant: 'success', icon: CheckCircle },
  running: { label: 'Running', variant: 'warning', icon: Loader2 },
  failed: { label: 'Failed', variant: 'danger', icon: AlertTriangle },
  queued: { label: 'Queued', variant: 'info', icon: Clock },
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

function SkeletonCard() {
  return (
    <Card padding="sm" className="flex items-center gap-4 animate-pulse">
      <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-800" />
      <div className="space-y-2">
        <div className="h-5 w-12 rounded bg-slate-800" />
        <div className="h-3 w-16 rounded bg-slate-800" />
      </div>
    </Card>
  )
}

function SkeletonJob() {
  return (
    <div className="px-6 py-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="h-6 w-6 shrink-0 rounded-full bg-slate-800" />
        <div className="space-y-2 flex-1">
          <div className="h-4 w-32 rounded bg-slate-800" />
          <div className="h-3 w-48 rounded bg-slate-800" />
          <div className="h-3 w-64 rounded bg-slate-800" />
        </div>
      </div>
    </div>
  )
}

export default function TrainingDashboard() {
  const [jobs, setJobs] = useState<TrainingJob[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await mlopsService.listTrainingJobs({ limit: 100 })
        if (!cancelled) setJobs(data)
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

  const runningJobs = jobs.filter((j) => j.status === 'running')
  const completedJobs = jobs.filter((j) => j.status === 'completed')
  const failedJobs = jobs.filter((j) => j.status === 'failed')
  const queuedJobs = jobs.filter((j) => j.status === 'queued')

  if (loading) {
    return (
      <AuthGate allowedRoles={AUTHORIZED_ROLES_FOR_MLOPS}>
        <div className="space-y-6">
          <div>
            <div className="h-8 w-48 rounded bg-slate-800 animate-pulse" />
            <div className="mt-1 h-4 w-64 rounded bg-slate-800 animate-pulse" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
          <Card padding="none">
            <SkeletonJob />
            <SkeletonJob />
            <SkeletonJob />
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
            <h1 className="text-2xl font-bold text-white">Training Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">
              Monitor and manage model training operations.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card padding="sm" className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">{runningJobs.length}</p>
              <p className="text-xs text-slate-500">Running</p>
            </div>
          </Card>
          <Card padding="sm" className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">{completedJobs.length}</p>
              <p className="text-xs text-slate-500">Completed</p>
            </div>
          </Card>
          <Card padding="sm" className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">{failedJobs.length}</p>
              <p className="text-xs text-slate-500">Failed</p>
            </div>
          </Card>
          <Card padding="sm" className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800/50 text-slate-400">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">{queuedJobs.length}</p>
              <p className="text-xs text-slate-500">Queued</p>
            </div>
          </Card>
        </div>

        {/* Running Jobs */}
        {runningJobs.length > 0 && (
          <Card padding="none">
            <div className="border-b border-slate-800/50 px-6 py-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white">
                <Loader2 className="h-4 w-4 text-amber-400 animate-spin" />
                Running Jobs
              </h2>
            </div>
            <div className="divide-y divide-slate-800/50">
              {runningJobs.map((job) => (
                <div key={job.id} className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                        <Loader2 className="h-3 w-3 text-amber-400 animate-spin" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold text-white">{job.modelVersion}</h3>
                          <Badge variant="warning" size="sm">
                            Running
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-400">
                          {job.datasetName} → {job.modelName}
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1">
                            <Play className="h-3 w-3" />
                            Started: {formatTimestamp(job.startTime)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Epochs: {job.config.epochs}
                          </span>
                          <span>LR: {job.config.learningRate}</span>
                          <span>Batch: {job.config.batchSize}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">Optimizer</p>
                      <p className="text-sm font-medium text-white uppercase">
                        {job.config.optimizer}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Empty state */}
        {jobs.length === 0 && (
          <Card className="text-center py-12">
            <CheckCircle className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-white mb-2">No training jobs</h3>
            <p className="text-sm text-slate-400">No training jobs have been created yet.</p>
          </Card>
        )}

        {/* All Jobs Table */}
        {jobs.length > 0 && (
          <Tabs defaultTab="all">
            <TabsList>
              <TabsTrigger id="all">All Jobs ({jobs.length})</TabsTrigger>
              <TabsTrigger id="completed">Completed ({completedJobs.length})</TabsTrigger>
              <TabsTrigger id="failed">Failed ({failedJobs.length})</TabsTrigger>
              <TabsTrigger id="queued">Queued ({queuedJobs.length})</TabsTrigger>
            </TabsList>

            <TabsContent id="all">
              <JobList jobs={jobs} />
            </TabsContent>
            <TabsContent id="completed">
              <JobList jobs={completedJobs} />
            </TabsContent>
            <TabsContent id="failed">
              <JobList jobs={failedJobs} />
            </TabsContent>
            <TabsContent id="queued">
              <JobList jobs={queuedJobs} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AuthGate>
  )
}

function JobList({ jobs }: { jobs: TrainingJob[] }) {
  if (jobs.length === 0) {
    return (
      <Card className="text-center py-12">
        <CheckCircle className="h-12 w-12 text-slate-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">No jobs</h3>
        <p className="text-sm text-slate-400">No training jobs match this filter.</p>
      </Card>
    )
  }

  return (
    <Card padding="none">
      <div className="divide-y divide-slate-800/50">
        {jobs.map((job) => {
          const statusConfig = STATUS_CONFIG[job.status]
          const StatusIcon = statusConfig.icon

          return (
            <div key={job.id} className="px-6 py-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-700 bg-slate-800">
                    <StatusIcon
                      className={`h-3 w-3 ${job.status === 'running' ? 'animate-spin' : ''}`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-white">{job.modelVersion}</h3>
                      <Badge variant={statusConfig.variant} size="sm">
                        {statusConfig.label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {job.datasetName} → {job.modelName}
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatTimestamp(job.startTime)}
                      </span>
                      {job.endTime && <span>Duration: {job.duration}</span>}
                      {job.error && <span className="text-red-400">{job.error}</span>}
                      <span>By: {job.triggeredBy}</span>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                {job.metrics && (
                  <div className="rounded-lg bg-slate-800/30 p-3 text-right">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                      {job.metrics.accuracy != null && (
                        <>
                          <span className="text-slate-500">Accuracy:</span>
                          <span className="text-white font-medium">
                            {(job.metrics.accuracy * 100).toFixed(1)}%
                          </span>
                        </>
                      )}
                      {job.metrics.f1Score != null && (
                        <>
                          <span className="text-slate-500">F1:</span>
                          <span className="text-white font-medium">
                            {(job.metrics.f1Score * 100).toFixed(1)}%
                          </span>
                        </>
                      )}
                      {job.metrics.loss != null && (
                        <>
                          <span className="text-slate-500">Loss:</span>
                          <span className="text-white font-medium">
                            {job.metrics.loss.toFixed(4)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
