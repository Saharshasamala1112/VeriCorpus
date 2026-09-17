import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type { ModelCandidate, PromotionRecord } from '../../types/lifelong-learning'

interface ModelPromotionProps {
  candidates: ModelCandidate[]
  promotions: PromotionRecord[]
  onPromote?: (candidateId: string) => void
  onRollback?: (modelId: string, versionId: string) => void
  loading?: boolean
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_CONFIG: Record<
  ModelCandidate['status'],
  { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; label: string }
> = {
  evaluating: { variant: 'info', label: 'Evaluating' },
  gate_check: { variant: 'warning', label: 'Gate Check' },
  comparison: { variant: 'info', label: 'Comparing' },
  staging: { variant: 'warning', label: 'Staging' },
  verified: { variant: 'info', label: 'Verified' },
  promoted: { variant: 'success', label: 'Promoted' },
  rejected: { variant: 'danger', label: 'Rejected' },
}

export default function ModelPromotion({
  candidates,
  promotions,
  onPromote,
  onRollback,
  loading,
}: ModelPromotionProps) {
  return (
    <Card padding="md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Promotion Queue</h3>
        <Badge variant="info" size="sm">
          {candidates.filter((c) => c.status === 'staging' || c.status === 'verified').length}{' '}
          pending
        </Badge>
      </div>

      <div className="space-y-2">
        {candidates.length === 0 && (
          <p className="text-center text-xs text-slate-500">No candidates in pipeline</p>
        )}

        {candidates.map((c) => {
          const statusConfig = STATUS_CONFIG[c.status] || STATUS_CONFIG.evaluating
          return (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/30 px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-slate-300">
                  {c.version}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-200">{c.modelName}</span>
                    <Badge variant={statusConfig.variant} size="sm">
                      {statusConfig.label}
                    </Badge>
                  </div>
                  {c.parentVersion && (
                    <span className="text-[11px] text-slate-500">from {c.parentVersion}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {(c.status === 'staging' || c.status === 'verified') && onPromote && (
                  <button
                    onClick={() => onPromote(c.id)}
                    disabled={loading}
                    className="rounded-lg bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-400 border border-emerald-500/20 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                  >
                    Promote
                  </button>
                )}
                {c.rejectionReason && (
                  <span className="max-w-[120px] truncate text-[11px] text-red-400">
                    {c.rejectionReason}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {promotions.length > 0 && (
        <>
          <h4 className="mt-4 mb-2 text-xs font-semibold text-slate-400">Recent Promotions</h4>
          <div className="space-y-1.5">
            {promotions.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/20 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      p.status === 'promoted'
                        ? 'success'
                        : p.status === 'rolled_back'
                          ? 'danger'
                          : 'warning'
                    }
                    size="sm"
                  >
                    {p.status}
                  </Badge>
                  <span className="text-[11px] text-slate-400">{p.candidateVersionId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-600">{formatDate(p.createdAt)}</span>
                  {p.status === 'promoted' && onRollback && (
                    <button
                      onClick={() => onRollback(p.modelId, p.previousProductionVersionId)}
                      disabled={loading}
                      className="rounded-lg bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                    >
                      Rollback
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
