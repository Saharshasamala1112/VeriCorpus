import { AlertTriangle, CheckCircle } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoLimitationsProps {
  limitations: string[]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function VideoLimitations({ limitations }: VideoLimitationsProps) {
  const hasLimitations = limitations.length > 0

  return (
    <div
      className={`rounded-2xl border overflow-hidden ${
        hasLimitations
          ? 'border-amber-500/20 bg-amber-500/[0.02]'
          : 'border-slate-700/50 bg-slate-800/60'
      }`}
    >
      {/* Header */}
      <div
        className={`px-5 py-4 border-b ${
          hasLimitations
            ? 'border-amber-500/10 bg-amber-900/20'
            : 'border-slate-700/50 bg-slate-800/30'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-lg ${
              hasLimitations ? 'bg-amber-400/10 text-amber-400' : 'bg-slate-700/50 text-slate-500'
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Analysis Limitations</h3>
            <p className="text-[11px] text-slate-500">
              {hasLimitations
                ? `${limitations.length} known limitation${limitations.length === 1 ? '' : 's'}`
                : 'No known limitations for this analysis'}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {hasLimitations ? (
          <ul className="space-y-2.5">
            {limitations.map((limitation, index) => (
              <li
                key={index}
                className="flex items-start gap-3 rounded-xl bg-slate-800/40 border border-slate-700/30 px-4 py-3"
              >
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                <span className="text-sm text-slate-300 leading-relaxed">{limitation}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-center justify-center gap-3 py-4">
            <CheckCircle className="h-5 w-5 text-emerald-400" />
            <span className="text-sm text-slate-400">No known limitations for this analysis</span>
          </div>
        )}
      </div>
    </div>
  )
}
