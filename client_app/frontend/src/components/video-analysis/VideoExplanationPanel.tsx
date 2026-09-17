import { AlertTriangle, BookOpen, CheckCircle2 } from 'lucide-react'
import { Card } from '../ui'

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoExplanationPanelProps {
  explanation: {
    narrative: string
    key_factors: string[]
    recommendations: string[]
    language: string
  } | null
}

// ─── Empty State ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/80 mb-4">
        <AlertTriangle className="h-6 w-6 text-slate-500" />
      </div>
      <p className="text-sm text-slate-400 text-center max-w-xs">
        Explanation not available for this analysis
      </p>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VideoExplanationPanel({ explanation }: VideoExplanationPanelProps) {
  if (!explanation) {
    return (
      <Card padding="none">
        <EmptyState />
      </Card>
    )
  }

  return (
    <Card padding="none">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/10">
            <BookOpen className="h-4 w-4 text-violet-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Analysis Explanation</h3>
            <p className="text-[11px] text-slate-500">Why the model reached its verdict</p>
          </div>
        </div>
      </div>

      {/* Narrative */}
      <div className="px-5 py-4 border-b border-slate-800/60">
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
          Narrative
        </h4>
        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
          {explanation.narrative}
        </p>
      </div>

      {/* Key Factors */}
      {explanation.key_factors.length > 0 && (
        <div className="px-5 py-4 border-b border-slate-800/60">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Key Factors
          </h4>
          <ol className="space-y-2.5">
            {explanation.key_factors.map((factor, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-cyan-400/10 text-[11px] font-semibold text-cyan-400 shrink-0 mt-0.5">
                  {index + 1}
                </span>
                <span className="text-sm text-slate-300 leading-relaxed">{factor}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Recommendations */}
      {explanation.recommendations.length > 0 && (
        <div className="px-5 py-4">
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            Recommendations
          </h4>
          <div className="space-y-2">
            {explanation.recommendations.map((recommendation, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-lg bg-emerald-400/5 border border-emerald-400/10"
              >
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="text-sm text-slate-300 leading-relaxed">{recommendation}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
