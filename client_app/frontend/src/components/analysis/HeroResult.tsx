import { AlertTriangle, CheckCircle, HelpCircle, Clock, Loader2 } from 'lucide-react'
import { Badge } from '../ui'
import type { VerdictCategory, ConfidenceLevel } from '../../types/explainability'
import type { ExplanationTemplate } from '../../types/explainability'
import type { AnalysisStatus } from '../../types/analysis'

interface HeroResultProps {
  assessment: string
  verdictCategory: VerdictCategory
  confidence: number
  modelProbability: number | null
  calibratedConfidence: number | null
  evidenceStrength: number | null
  confidenceLevel: ConfidenceLevel
  manipulationProbability: number | null
  explanation: string
  status: AnalysisStatus
  filename: string
  mediaType: string
  timestamp: string
  template: ExplanationTemplate
}

const VERDICT_CONFIG: Record<
  VerdictCategory,
  { icon: React.ElementType; border: string; bg: string; text: string; glow: string }
> = {
  likely_manipulated: {
    icon: AlertTriangle,
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    text: 'text-amber-300',
    glow: 'shadow-amber-500/10',
  },
  likely_authentic: {
    icon: CheckCircle,
    border: 'border-emerald-500/30',
    bg: 'bg-emerald-500/5',
    text: 'text-emerald-300',
    glow: 'shadow-emerald-500/10',
  },
  inconclusive: {
    icon: HelpCircle,
    border: 'border-slate-500/30',
    bg: 'bg-slate-500/5',
    text: 'text-slate-300',
    glow: 'shadow-slate-500/10',
  },
}

function getStatusConfig(
  template: ExplanationTemplate,
): Record<
  AnalysisStatus,
  { label: string; variant: 'success' | 'warning' | 'danger' | 'info'; icon: React.ElementType }
> {
  return {
    completed: { label: template.hero.completed, variant: 'success', icon: CheckCircle },
    processing: { label: template.hero.processing, variant: 'info', icon: Loader2 },
    failed: { label: template.hero.failed, variant: 'danger', icon: AlertTriangle },
    needs_review: { label: template.hero.needsReview, variant: 'warning', icon: AlertTriangle },
  }
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function HeroResult({
  assessment,
  verdictCategory,
  confidence,
  modelProbability,
  calibratedConfidence,
  evidenceStrength,
  manipulationProbability,
  explanation,
  status,
  filename,
  mediaType,
  timestamp,
  template,
}: HeroResultProps) {
  const config = VERDICT_CONFIG[verdictCategory]
  const statusConfig = getStatusConfig(template)[status]
  const StatusIcon = statusConfig.icon

  return (
    <div
      className={`rounded-2xl border ${config.border} ${config.bg} p-6 sm:p-8 shadow-lg ${config.glow}`}
    >
      {/* Header row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        {/* Left: Assessment */}
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <StatusIcon
              className={`h-4 w-4 ${status === 'processing' ? 'animate-spin text-cyan-400' : ''} ${
                statusConfig.variant === 'success' ? 'text-emerald-400' : ''
              } ${statusConfig.variant === 'danger' ? 'text-red-400' : ''} ${
                statusConfig.variant === 'warning' ? 'text-amber-400' : ''
              } ${
                statusConfig.variant === 'info' && status !== 'processing' ? 'text-cyan-400' : ''
              }`}
            />
            <Badge variant={statusConfig.variant} size="sm">
              {statusConfig.label}
            </Badge>
          </div>

          <h2 className={`text-2xl sm:text-3xl font-bold ${config.text} mt-2`}>{assessment}</h2>

          <p className="mt-3 text-sm leading-relaxed text-slate-300 max-w-2xl">{explanation}</p>
        </div>

        {/* Right: Confidence ring */}
        <div className="flex flex-col items-center gap-2 sm:items-end">
          <div className="relative h-28 w-28 sm:h-32 sm:w-32">
            {/* Background circle */}
            <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="currentColor"
                strokeWidth="8"
                className="text-slate-800"
              />
              <circle
                cx="60"
                cy="60"
                r="52"
                fill="none"
                stroke="url(#confidenceGradient)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${confidence * 327} 327`}
                className="transition-all duration-1000 ease-out"
              />
              <defs>
                <linearGradient id="confidenceGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" className="text-cyan-400" stopColor="currentColor" />
                  <stop offset="100%" className="text-cyan-600" stopColor="currentColor" />
                </linearGradient>
              </defs>
            </svg>
            {/* Center text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">
                {(confidence * 100).toFixed(0)}%
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">
                {template.hero.calibratedConfidence}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Metadata row */}
      <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-slate-500" />
          <span>{formatTimestamp(timestamp)}</span>
        </div>
        <span className="text-slate-700">|</span>
        <span className="font-medium text-slate-300">{filename}</span>
        <span className="text-slate-700">|</span>
        <span className="capitalize">{mediaType}</span>
        {manipulationProbability != null && (
          <>
            <span className="text-slate-700">|</span>
            <span>
              {template.hero.manipulationProbability}
              {(manipulationProbability * 100).toFixed(0)}%
            </span>
          </>
        )}
        {modelProbability != null && (
          <>
            <span className="text-slate-700">|</span>
            <span>
              {template.hero.modelProbability}
              {(modelProbability * 100).toFixed(0)}%
            </span>
          </>
        )}
        {calibratedConfidence != null && (
          <>
            <span className="text-slate-700">|</span>
            <span>
              {template.hero.calibratedConfidence}
              {(calibratedConfidence * 100).toFixed(0)}%
            </span>
          </>
        )}
        {evidenceStrength != null && (
          <>
            <span className="text-slate-700">|</span>
            <span>
              {template.hero.evidenceStrength}
              {(evidenceStrength * 100).toFixed(0)}%
            </span>
          </>
        )}
      </div>
    </div>
  )
}
