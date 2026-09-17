import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type { ModelComparison, MetricComparison } from '../../types/lifelong-learning'

interface ModelEvaluationProps {
  comparison: ModelComparison | null
  onApprove?: () => void
  onReject?: () => void
  loading?: boolean
}

function MetricRow({ metric }: { metric: MetricComparison }) {
  const deltaPercent = metric.percentageDelta
  const isPositive = metric.delta > 0
  const isZero = Math.abs(metric.delta) < 0.001

  return (
    <div className="flex items-center justify-between border-b border-slate-800/40 py-2 last:border-0">
      <span className="text-xs text-slate-400">{metric.metric}</span>
      <div className="flex items-center gap-3">
        <span className="w-16 text-right text-xs text-slate-500">
          {(metric.production * 100).toFixed(1)}%
        </span>
        <span className="text-[10px] text-slate-600">→</span>
        <span className="w-16 text-left text-xs text-slate-300">
          {(metric.candidate * 100).toFixed(1)}%
        </span>
        <span
          className={`w-16 text-right text-xs font-medium ${
            isZero ? 'text-slate-500' : isPositive ? 'text-emerald-400' : 'text-red-400'
          }`}
        >
          {isZero ? '0.0%' : `${isPositive ? '+' : ''}${deltaPercent.toFixed(1)}%`}
        </span>
        <Badge
          variant={
            metric.winner === 'candidate'
              ? 'success'
              : metric.winner === 'production'
                ? 'danger'
                : 'default'
          }
          size="sm"
        >
          {metric.winner === 'candidate' ? '✓' : metric.winner === 'production' ? '✗' : '='}
        </Badge>
      </div>
    </div>
  )
}

export default function ModelEvaluation({
  comparison,
  onApprove,
  onReject,
  loading,
}: ModelEvaluationProps) {
  if (!comparison) {
    return (
      <Card padding="md">
        <h3 className="text-sm font-semibold text-slate-200">Model Comparison</h3>
        <p className="mt-2 text-center text-xs text-slate-500">No comparison data available</p>
      </Card>
    )
  }

  return (
    <Card padding="md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Candidate vs Production</h3>
        <Badge
          variant={
            comparison.overallWinner === 'candidate'
              ? 'success'
              : comparison.overallWinner === 'production'
                ? 'danger'
                : 'default'
          }
        >
          {comparison.overallWinner === 'candidate'
            ? 'Candidate Wins'
            : comparison.overallWinner === 'production'
              ? 'Production Wins'
              : 'Tie'}
        </Badge>
      </div>

      <div className="mb-3 flex items-center gap-4 text-[11px] text-slate-500">
        <span className="w-20 text-center">Production</span>
        <span className="w-20 text-center">Candidate</span>
        <span className="w-16 text-center">Delta</span>
      </div>

      <div className="space-y-0">
        {comparison.metricsComparison.map((m) => (
          <MetricRow key={m.metric} metric={m} />
        ))}
      </div>

      {comparison.regressionDetected && (
        <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 p-2.5">
          <p className="text-xs font-medium text-red-400">Regression Detected</p>
          {comparison.regressionDetails.map((detail, i) => (
            <p key={i} className="mt-1 text-[11px] text-red-300/70">
              {detail}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          onClick={onApprove}
          disabled={loading || comparison.promotionRecommendation === 'reject'}
          className="flex-1 rounded-xl bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-400 border border-emerald-500/20 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Approve & Promote'}
        </button>
        <button
          onClick={onReject}
          disabled={loading}
          className="flex-1 rounded-xl bg-red-500/10 px-3 py-2 text-xs font-medium text-red-400 border border-red-500/20 transition-colors hover:bg-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Reject
        </button>
      </div>
    </Card>
  )
}
