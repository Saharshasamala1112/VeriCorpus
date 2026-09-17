import {
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Loader2,
  Shield,
  TrendingUp,
  Activity,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoHeroAssessmentProps {
  assessment: string
  modelProbability: number | null
  calibratedProbability: number | null
  evidenceStrength: number | null
  riskLevel: string | null
  summary: string | null
  processingStatus: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getAssessmentConfig(assessment: string) {
  const lower = assessment.toLowerCase()
  if (lower.includes('ai-generated') || lower.includes('high')) {
    return {
      textClass: 'text-red-400',
      bgClass: 'bg-red-500/5',
      borderClass: 'border-red-500/20',
      shadowClass: 'shadow-red-500/10',
      icon: AlertTriangle,
      iconClass: 'text-red-400',
    }
  }
  if (lower.includes('manipulated') || lower.includes('tampered')) {
    return {
      textClass: 'text-amber-400',
      bgClass: 'bg-amber-500/5',
      borderClass: 'border-amber-500/20',
      shadowClass: 'shadow-amber-500/10',
      icon: AlertTriangle,
      iconClass: 'text-amber-400',
    }
  }
  if (lower.includes('authentic') || lower.includes('genuine')) {
    return {
      textClass: 'text-emerald-400',
      bgClass: 'bg-emerald-500/5',
      borderClass: 'border-emerald-500/20',
      shadowClass: 'shadow-emerald-500/10',
      icon: CheckCircle,
      iconClass: 'text-emerald-400',
    }
  }
  return {
    textClass: 'text-slate-300',
    bgClass: 'bg-slate-500/5',
    borderClass: 'border-slate-500/20',
    shadowClass: 'shadow-slate-500/10',
    icon: HelpCircle,
    iconClass: 'text-slate-400',
  }
}

function getRiskBadgeConfig(riskLevel: string | null) {
  switch (riskLevel?.toUpperCase()) {
    case 'HIGH':
      return 'bg-red-500/15 text-red-400 border border-red-500/30'
    case 'MEDIUM':
      return 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
    case 'LOW':
      return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
    default:
      return 'bg-slate-500/15 text-slate-400 border border-slate-500/30'
  }
}

function formatPercent(value: number | null): string {
  if (value == null) return '—'
  const pct = value <= 1 ? value * 100 : value
  return `${pct.toFixed(1)}%`
}

function getPercentColor(value: number | null): string {
  if (value == null) return 'text-slate-500'
  const v = value <= 1 ? value : value / 100
  if (v >= 0.7) return 'text-red-400'
  if (v >= 0.4) return 'text-amber-400'
  return 'text-emerald-400'
}

// ─── Metric Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  iconClass,
  description,
}: {
  label: string
  value: number | null
  icon: React.ElementType
  iconClass: string
  description?: string
}) {
  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 sm:p-5 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <div
          className={`flex items-center justify-center w-8 h-8 rounded-lg bg-slate-700/50 ${iconClass}`}
        >
          <Icon className="w-4 h-4" />
        </div>
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <span className={`text-2xl sm:text-3xl font-bold tabular-nums ${getPercentColor(value)}`}>
        {formatPercent(value)}
      </span>
      {description && (
        <span className="text-[11px] text-slate-500 leading-relaxed">{description}</span>
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VideoHeroAssessment({
  assessment,
  modelProbability,
  calibratedProbability,
  evidenceStrength,
  riskLevel,
  summary,
  processingStatus,
}: VideoHeroAssessmentProps) {
  const config = getAssessmentConfig(assessment)
  const AssessmentIcon = config.icon
  const isProcessing = processingStatus === 'processing' || processingStatus === 'pending'

  return (
    <div
      className={`rounded-2xl border ${config.borderClass} ${config.bgClass} shadow-lg ${config.shadowClass} overflow-hidden`}
    >
      {/* Processing Banner */}
      {isProcessing && (
        <div className="bg-cyan-500/5 border-b border-cyan-500/20 px-5 py-3 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
          <span className="text-xs font-medium text-cyan-400">
            {processingStatus === 'pending' ? 'Queued for analysis' : 'Analysis in progress'}
          </span>
          <div className="flex-1" />
          <div className="h-1.5 w-24 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-cyan-400 rounded-full animate-pulse"
              style={{ width: '60%' }}
            />
          </div>
        </div>
      )}

      <div className="p-5 sm:p-8">
        {/* Assessment Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <AssessmentIcon
                className={`w-6 h-6 ${config.iconClass} ${isProcessing ? 'animate-pulse' : ''}`}
              />
              <h2
                className={`text-2xl sm:text-3xl lg:text-4xl font-bold ${config.textClass} tracking-tight`}
              >
                {assessment}
              </h2>
            </div>
            {riskLevel && (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${getRiskBadgeConfig(riskLevel)}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
                  {riskLevel.toUpperCase()} RISK
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Metric Cards */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <MetricCard
            label="Model Probability"
            value={modelProbability}
            icon={Activity}
            iconClass="text-cyan-400"
            description="Raw model confidence in its prediction"
          />
          <MetricCard
            label="Calibrated Confidence"
            value={calibratedProbability}
            icon={TrendingUp}
            iconClass="text-violet-400"
            description="Post-calibration probability estimate"
          />
          <MetricCard
            label="Evidence Strength"
            value={evidenceStrength}
            icon={Shield}
            iconClass="text-amber-400"
            description="Aggregate strength of forensic signals"
          />
        </div>

        {/* Summary */}
        {summary && (
          <div className="mt-6 border-t border-slate-700/50 pt-5">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Assessment Summary
            </h3>
            <p className="text-sm leading-relaxed text-slate-300">{summary}</p>
          </div>
        )}
      </div>
    </div>
  )
}
