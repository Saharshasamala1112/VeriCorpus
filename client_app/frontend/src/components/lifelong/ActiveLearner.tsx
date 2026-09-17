import { useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type { ActiveLearningCandidate } from '../../types/lifelong-learning'

interface ActiveLearnerProps {
  candidates: ActiveLearningCandidate[]
  onAnnotate?: (candidateId: string, annotation: string) => void
  onSkip?: (candidateId: string) => void
  loading?: boolean
}

const STRATEGY_LABELS: Record<ActiveLearningCandidate['strategy'], string> = {
  low_confidence: 'Low Confidence',
  disagreement: 'Disagreement',
  priority: 'Priority',
  random: 'Random',
}

export default function ActiveLearner({
  candidates,
  onAnnotate,
  onSkip,
  loading,
}: ActiveLearnerProps) {
  const [annotations, setAnnotations] = useState<Record<string, string>>({})

  const handleAnnotate = (candidateId: string) => {
    const annotation = annotations[candidateId]
    if (!annotation?.trim()) return
    onAnnotate?.(candidateId, annotation)
    setAnnotations((prev) => {
      const next = { ...prev }
      delete next[candidateId]
      return next
    })
  }

  const pendingCandidates = candidates.filter((c) => c.status === 'pending')

  return (
    <Card padding="md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Active Learning</h3>
        <Badge variant="warning" size="sm">
          {pendingCandidates.length} pending
        </Badge>
      </div>

      <div className="space-y-3">
        {pendingCandidates.length === 0 && (
          <p className="text-center text-xs text-slate-500">No pending annotations</p>
        )}

        {pendingCandidates.slice(0, 10).map((c) => (
          <div key={c.id} className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="info" size="sm">
                  {c.mediaType}
                </Badge>
                <Badge variant="default" size="sm">
                  {STRATEGY_LABELS[c.strategy]}
                </Badge>
              </div>
              <span className="text-[11px] text-slate-500">
                Confidence: {(c.confidence * 100).toFixed(0)}%
              </span>
            </div>

            <p className="mb-2 line-clamp-2 text-xs text-slate-300">{c.contentPreview}</p>

            <div className="mb-2 flex items-center gap-2 text-[11px]">
              <span className="text-slate-500">Prediction:</span>
              <span className="text-slate-400">{c.modelPrediction}</span>
            </div>

            {c.groundTruth && (
              <div className="mb-2 flex items-center gap-2 text-[11px]">
                <span className="text-slate-500">Ground truth:</span>
                <span className="text-emerald-400">{c.groundTruth}</span>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={annotations[c.id] || ''}
                onChange={(e) => setAnnotations((prev) => ({ ...prev, [c.id]: e.target.value }))}
                placeholder="Enter annotation (e.g., authentic, manipulated, uncertain)"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAnnotate(c.id)
                }}
              />
              <button
                onClick={() => handleAnnotate(c.id)}
                disabled={loading || !annotations[c.id]?.trim()}
                className="rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-400 border border-emerald-500/20 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
              >
                Annotate
              </button>
              <button
                onClick={() => onSkip?.(c.id)}
                disabled={loading}
                className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-[11px] text-slate-400 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                Skip
              </button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
