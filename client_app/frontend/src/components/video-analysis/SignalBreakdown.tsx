import { useState } from 'react'
import { Check, X, ChevronDown, AlertTriangle, Info } from 'lucide-react'
import { Card, Badge } from '../ui'

// ─── Types ───────────────────────────────────────────────────────────────────

interface SignalBreakdownProps {
  signalBreakdown: Array<{
    signal_type: string
    label: string
    detected: boolean
    strength: number | null
    description: string | null
    signal_count: number
  }>
  signals: Array<{
    id: string
    signal_type: string
    analyzer_type: string
    severity: string
    confidence: number
    title: string
    description: string
  }>
  onSignalTypeClick?: (type: string) => void
  selectedSignalType?: string | null
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function severityBadge(severity: string) {
  switch (severity.toUpperCase()) {
    case 'CRITICAL':
      return 'danger' as const
    case 'HIGH':
      return 'warning' as const
    case 'MEDIUM':
      return 'info' as const
    case 'LOW':
      return 'default' as const
    default:
      return 'default' as const
  }
}

function strengthBarColor(detected: boolean, strength: number | null): string {
  if (!detected || strength == null) return 'bg-slate-700'
  if (strength >= 75) return 'bg-emerald-500'
  if (strength >= 50) return 'bg-amber-500'
  return 'bg-red-500'
}

// ─── Signal Detail Row ───────────────────────────────────────────────────────

function SignalDetail({
  signal,
}: {
  signal: {
    id: string
    signal_type: string
    analyzer_type: string
    severity: string
    confidence: number
    title: string
    description: string
  }
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="group">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-800/50 transition-colors text-left"
      >
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-200 flex-shrink-0 ${
            expanded ? 'rotate-0' : '-rotate-90'
          }`}
        />
        <span className="text-xs font-medium text-slate-200 truncate flex-1">{signal.title}</span>
        <Badge variant={severityBadge(signal.severity)} size="sm">
          {signal.severity}
        </Badge>
        <span className="text-[11px] text-slate-500 font-mono tabular-nums flex-shrink-0">
          {(signal.confidence * 100).toFixed(0)}%
        </span>
      </button>
      {expanded && (
        <div className="ml-8 mr-3 mb-2 px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/50">
          <p className="text-[11px] text-slate-400 leading-relaxed">{signal.description}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] text-slate-600">Analyzer:</span>
            <span className="text-[10px] text-slate-400 font-mono">{signal.analyzer_type}</span>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SignalBreakdown({
  signalBreakdown,
  signals,
  onSignalTypeClick,
  selectedSignalType,
}: SignalBreakdownProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const toggleCategory = (type: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const signalsByType = signals.reduce<Record<string, typeof signals>>((acc, signal) => {
    if (!acc[signal.signal_type]) acc[signal.signal_type] = []
    acc[signal.signal_type].push(signal)
    return acc
  }, {})

  const totalDetected = signalBreakdown.filter((s) => s.detected).length
  const totalCategories = signalBreakdown.length

  return (
    <Card padding="none">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-800/80">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-400/10">
              <Info className="h-4 w-4 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Signal Breakdown</h3>
              <p className="text-[11px] text-slate-500">
                {totalDetected}/{totalCategories} categories detected
              </p>
            </div>
          </div>
          <Badge variant="info" size="sm">
            {signals.length} signals
          </Badge>
        </div>
      </div>

      {/* Category List */}
      <div className="divide-y divide-slate-800/60">
        {signalBreakdown.map((category) => {
          const categorySignals = signalsByType[category.signal_type] ?? []
          const isExpanded = expandedCategories.has(category.signal_type)
          const isSelected = selectedSignalType === category.signal_type

          return (
            <div
              key={category.signal_type}
              className={`transition-colors ${isSelected ? 'bg-cyan-400/5' : ''}`}
            >
              {/* Category Row */}
              <div className="px-5 py-3.5">
                <div className="flex items-center gap-3">
                  {/* Status Icon */}
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0 transition-colors ${
                      category.detected
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-slate-800/50 text-slate-600'
                    }`}
                  >
                    {category.detected ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </div>

                  {/* Label & Description */}
                  <button
                    onClick={() => {
                      toggleCategory(category.signal_type)
                      onSignalTypeClick?.(category.signal_type)
                    }}
                    className="flex-1 text-left group/cat"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-200 group-hover/cat:text-white transition-colors">
                        {category.label}
                      </span>
                      {category.signal_count > 0 && (
                        <span className="text-[10px] text-slate-500 bg-slate-800/50 px-1.5 py-0.5 rounded-full font-mono">
                          {category.signal_count}
                        </span>
                      )}
                    </div>
                    {category.description && (
                      <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                        {category.description}
                      </p>
                    )}
                  </button>

                  {/* Strength */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {category.strength != null && (
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${strengthBarColor(
                              category.detected,
                              category.strength,
                            )}`}
                            style={{ width: `${category.strength}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono tabular-nums w-8 text-right">
                          {category.strength}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Expand */}
                  {categorySignals.length > 0 && (
                    <button
                      onClick={() => toggleCategory(category.signal_type)}
                      className="ml-1 p-1 rounded hover:bg-slate-800/50 transition-colors text-slate-500 hover:text-slate-300"
                      aria-label={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      <ChevronDown
                        className={`h-4 w-4 transition-transform duration-200 ${
                          isExpanded ? 'rotate-0' : '-rotate-90'
                        }`}
                      />
                    </button>
                  )}
                </div>

                {/* Strength bar for no-strength categories */}
                {category.strength == null && category.signal_count > 0 && (
                  <div className="mt-2 ml-10">
                    <div className="w-full h-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-cyan-500/40"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Expanded Signals */}
              {isExpanded && categorySignals.length > 0 && (
                <div className="px-5 pb-3 ml-10">
                  <div className="border-l-2 border-slate-800 ml-0 space-y-0.5">
                    {categorySignals.map((signal) => (
                      <SignalDetail key={signal.id} signal={signal} />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {isExpanded && categorySignals.length === 0 && (
                <div className="px-5 pb-3 ml-10">
                  <p className="text-[11px] text-slate-600 italic">
                    No individual signals detected
                  </p>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Empty State */}
      {signalBreakdown.length === 0 && (
        <div className="px-5 py-12 text-center">
          <AlertTriangle className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500">No signal breakdown available</p>
        </div>
      )}
    </Card>
  )
}
