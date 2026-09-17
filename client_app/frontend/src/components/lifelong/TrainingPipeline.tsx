import { useMemo } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type { PipelineStage, TrainingJob } from '../../types/lifelong-learning'
import { PIPELINE_STAGES } from '../../types/lifelong-learning'

interface TrainingPipelineProps {
  jobs: TrainingJob[]
  currentStage?: PipelineStage
}

const STAGE_LABELS: Record<PipelineStage, string> = {
  new_data: 'New Data',
  validation: 'Validate',
  sanitization: 'Sanitize',
  quality_check: 'Quality',
  duplicate_check: 'Duplicates',
  label_annotation: 'Label',
  corpus: 'Corpus',
  dataset_version: 'Dataset',
  training_queue: 'Queue',
  train: 'Train',
  validate: 'Validate',
  test: 'Test',
  calibrate: 'Calibrate',
  compare: 'Compare',
  candidate_model: 'Candidate',
  staging: 'Staging',
  promotion: 'Promote',
  production: 'Production',
}

const STAGE_ICONS: Record<PipelineStage, string> = {
  new_data: '📥',
  validation: '✅',
  sanitization: '🧹',
  quality_check: '🔍',
  duplicate_check: '🔗',
  label_annotation: '🏷️',
  corpus: '📚',
  dataset_version: '📦',
  training_queue: '⏳',
  train: '🏋️',
  validate: '📊',
  test: '🧪',
  calibrate: '⚖️',
  compare: '🔀',
  candidate_model: '🤖',
  staging: '📋',
  promotion: '🚀',
  production: '🟢',
}

function getStageStatus(
  stage: PipelineStage,
  jobs: TrainingJob[],
): 'completed' | 'active' | 'pending' | 'failed' {
  const activeJobs = jobs.filter(
    (j) => j.status !== 'succeeded' && j.status !== 'failed' && j.status !== 'cancelled',
  )
  const completedJobs = jobs.filter((j) => j.status === 'succeeded')
  const failedJobs = jobs.filter((j) => j.status === 'failed')

  const stageIndex = PIPELINE_STAGES.indexOf(stage)

  for (const job of activeJobs) {
    const jobStageIndex = PIPELINE_STAGES.indexOf(job.pipelineStage)
    if (jobStageIndex === stageIndex) return 'active'
    if (jobStageIndex > stageIndex) return 'completed'
  }

  for (const job of failedJobs) {
    const jobStageIndex = PIPELINE_STAGES.indexOf(job.pipelineStage)
    if (jobStageIndex === stageIndex) return 'failed'
  }

  for (const job of completedJobs) {
    const jobStageIndex = PIPELINE_STAGES.indexOf(job.pipelineStage)
    if (jobStageIndex >= stageIndex) return 'completed'
  }

  return 'pending'
}

export default function TrainingPipeline({ jobs, currentStage }: TrainingPipelineProps) {
  const stageStatuses = useMemo(
    () => PIPELINE_STAGES.map((stage) => ({ stage, status: getStageStatus(stage, jobs) })),
    [jobs],
  )

  return (
    <Card padding="md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Training Pipeline</h3>
        <Badge variant={currentStage ? 'info' : 'default'} size="sm">
          {currentStage ? STAGE_LABELS[currentStage] : 'Idle'}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {stageStatuses.map(({ stage, status }, i) => (
          <div key={stage} className="flex items-center">
            <div
              className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium transition-colors ${
                status === 'completed'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : status === 'active'
                    ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 animate-pulse'
                    : status === 'failed'
                      ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                      : 'bg-slate-800/50 text-slate-500 border border-slate-700/50'
              }`}
            >
              <span>{STAGE_ICONS[stage]}</span>
              <span>{STAGE_LABELS[stage]}</span>
            </div>
            {i < PIPELINE_STAGES.length - 1 && (
              <div
                className={`mx-0.5 h-px w-1.5 ${
                  status === 'completed' ? 'bg-emerald-500/40' : 'bg-slate-700/40'
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}
