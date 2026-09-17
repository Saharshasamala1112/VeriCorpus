import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type { TrainingJob } from '../../types/lifelong-learning'

interface TrainingJobListProps {
  jobs: TrainingJob[]
  onSelectJob?: (jobId: string) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / 3600000)
  const minutes = Math.floor((ms % 3600000) / 60000)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

const STATUS_VARIANT: Record<
  TrainingJob['status'],
  'success' | 'warning' | 'danger' | 'info' | 'default'
> = {
  queued: 'default',
  preprocessing: 'info',
  training: 'info',
  evaluating: 'warning',
  comparing: 'warning',
  calibrating: 'warning',
  staging: 'warning',
  promoting: 'info',
  succeeded: 'success',
  failed: 'danger',
  cancelled: 'danger',
}

export default function TrainingJobList({ jobs, onSelectJob }: TrainingJobListProps) {
  return (
    <Card padding="md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Training Jobs</h3>
        <Badge variant="info" size="sm">
          {jobs.length} total
        </Badge>
      </div>

      <div className="space-y-2">
        {jobs.length === 0 && (
          <p className="text-center text-xs text-slate-500">No training jobs</p>
        )}

        {jobs.map((job) => {
          const duration =
            job.completedAt && job.createdAt
              ? formatDuration(
                  new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime(),
                )
              : null

          return (
            <div
              key={job.id}
              onClick={() => onSelectJob?.(job.id)}
              className={`flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/30 px-3 py-2.5 transition-colors ${
                onSelectJob ? 'cursor-pointer hover:border-slate-700' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-slate-300">
                  {job.datasetVersion}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-200">{job.modelName}</span>
                    <Badge variant={STATUS_VARIANT[job.status]} size="sm">
                      {job.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-500">
                    <span>Dataset: {job.datasetVersion}</span>
                    {job.triggerType && (
                      <>
                        <span>·</span>
                        <span>Trigger: {job.triggerType}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-right">
                {duration && <p className="text-[11px] text-slate-500">{duration}</p>}
                <p className="text-[10px] text-slate-600">{formatDate(job.createdAt)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
