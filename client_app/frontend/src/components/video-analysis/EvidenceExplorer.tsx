import React, { useState, useMemo } from 'react'

// Types
interface EvidenceItem {
  id: string
  evidence_type: string
  content: string
  locator: Record<string, unknown> | null
  support_score: number | null
  provenance: Record<string, unknown> | null
}

interface ClaimItem {
  id: string
  text: string
  status: string
  extraction_method: string
}

interface EvidenceExplorerProps {
  evidence: EvidenceItem[]
  claims: ClaimItem[]
  filter: 'all' | 'supporting' | 'counter'
  onFilterChange: (filter: 'all' | 'supporting' | 'counter') => void
  onEvidenceClick?: (evidenceId: string) => void
}

// Helpers
const TYPE_COLORS: Record<string, { bg: string; text: string; border: string; bar: string }> = {
  visual_analysis: {
    bg: 'bg-blue-500/15',
    text: 'text-blue-400',
    border: 'border-blue-500/30',
    bar: 'bg-blue-500',
  },
  audio_analysis: {
    bg: 'bg-purple-500/15',
    text: 'text-purple-400',
    border: 'border-purple-500/30',
    bar: 'bg-purple-500',
  },
  temporal_analysis: {
    bg: 'bg-amber-500/15',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    bar: 'bg-amber-500',
  },
  metadata: {
    bg: 'bg-gray-500/15',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    bar: 'bg-gray-500',
  },
  ai_detection: {
    bg: 'bg-red-500/15',
    text: 'text-red-400',
    border: 'border-red-500/30',
    bar: 'bg-red-500',
  },
}

const CLAIM_STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  supported: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Supported' },
  refuted: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Refuted' },
  mixed: { bg: 'bg-amber-500/15', text: 'text-amber-400', label: 'Mixed' },
  unknown: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: 'Unknown' },
}

function getTypeColor(type: string) {
  return TYPE_COLORS[type] ?? TYPE_COLORS.metadata
}

function getStatusStyle(status: string) {
  return CLAIM_STATUS_STYLES[status] ?? CLAIM_STATUS_STYLES.unknown
}

function formatTypeLabel(type: string) {
  return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatLocator(locator: Record<string, unknown> | null): string {
  if (!locator) return ''
  const parts: string[] = []
  if (locator.timestamp) parts.push(String(locator.timestamp))
  if (locator.start_time && locator.end_time) {
    parts.push(`${locator.start_time} - ${locator.end_time}`)
  }
  if (locator.frame) parts.push(`Frame ${locator.frame}`)
  if (locator.region) parts.push(String(locator.region))
  if (locator.confidence) parts.push(`${Math.round(Number(locator.confidence) * 100)}% conf.`)
  return parts.join(' | ')
}

// Components
const FilterTabs: React.FC<{
  filter: 'all' | 'supporting' | 'counter'
  onFilterChange: (f: 'all' | 'supporting' | 'counter') => void
  counts: { all: number; supporting: number; counter: number }
}> = ({ filter, onFilterChange, counts }) => {
  const tabs = [
    { key: 'all' as const, label: 'All', count: counts.all },
    { key: 'supporting' as const, label: 'Supporting', count: counts.supporting },
    { key: 'counter' as const, label: 'Counter', count: counts.counter },
  ]

  return (
    <div className="flex gap-1 p-1 bg-gray-800/60 rounded-lg">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onFilterChange(tab.key)}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
            filter === tab.key
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
          }`}
        >
          {tab.label}
          <span
            className={`px-1.5 py-0.5 text-xs rounded-full ${
              filter === tab.key ? 'bg-white/20' : 'bg-gray-700 text-gray-500'
            }`}
          >
            {tab.count}
          </span>
        </button>
      ))}
    </div>
  )
}

const SupportScoreBar: React.FC<{ score: number | null }> = ({ score }) => {
  if (score === null) return null
  const pct = Math.round(score * 100)
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  )
}

const EvidenceCard: React.FC<{
  item: EvidenceItem
  expanded: boolean
  onToggle: () => void
  onClick?: () => void
}> = ({ item, expanded, onToggle, onClick }) => {
  const colors = getTypeColor(item.evidence_type)
  const locatorText = formatLocator(item.locator)
  const [copied, setCopied] = useState(false)

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(item.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div
      className={`group border rounded-xl transition-all duration-200 ${
        expanded
          ? `${colors.border} bg-gray-800/80 shadow-lg`
          : 'border-gray-700/50 bg-gray-800/40 hover:border-gray-600 hover:bg-gray-800/60'
      }`}
    >
      <div
        className="p-4 cursor-pointer"
        onClick={() => {
          onToggle()
          onClick?.()
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-md border ${colors.bg} ${colors.text} ${colors.border}`}
              >
                {formatTypeLabel(item.evidence_type)}
              </span>
              {locatorText && <span className="text-xs text-gray-500 truncate">{locatorText}</span>}
            </div>
            <p
              className={`text-sm text-gray-300 leading-relaxed ${expanded ? '' : 'line-clamp-2'}`}
            >
              {item.content}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-md text-gray-500 hover:text-gray-300 hover:bg-gray-700/50 opacity-0 group-hover:opacity-100 transition-all"
              title="Copy content"
            >
              {copied ? (
                <svg
                  className="w-4 h-4 text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
            <svg
              className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${
                expanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>

        {item.support_score !== null && (
          <div className="mt-3">
            <SupportScoreBar score={item.support_score} />
          </div>
        )}
      </div>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-700/50">
          {item.provenance && Object.keys(item.provenance).length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Provenance
              </h4>
              <div className="bg-gray-900/50 rounded-lg p-3 text-xs text-gray-400 font-mono">
                {Object.entries(item.provenance).map(([key, value]) => (
                  <div key={key} className="flex gap-2 py-0.5">
                    <span className="text-gray-500 shrink-0">{key}:</span>
                    <span className="text-gray-300 break-all">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {item.locator && Object.keys(item.locator).length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Locator
              </h4>
              <div className="bg-gray-900/50 rounded-lg p-3 text-xs text-gray-400 font-mono">
                {Object.entries(item.locator).map(([key, value]) => (
                  <div key={key} className="flex gap-2 py-0.5">
                    <span className="text-gray-500 shrink-0">{key}:</span>
                    <span className="text-gray-300 break-all">
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const ClaimCard: React.FC<{ claim: ClaimItem }> = ({ claim }) => {
  const style = getStatusStyle(claim.status)

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-gray-800/30 border border-gray-700/30 hover:border-gray-600/50 transition-colors">
      <div className="mt-0.5 shrink-0">
        <span
          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md ${style.bg} ${style.text}`}
        >
          {style.label}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-300 leading-relaxed">{claim.text}</p>
        <p className="text-xs text-gray-500 mt-1">
          via {claim.extraction_method.replace(/_/g, ' ')}
        </p>
      </div>
    </div>
  )
}

// Main Component
export const EvidenceExplorer: React.FC<EvidenceExplorerProps> = ({
  evidence,
  claims,
  filter,
  onFilterChange,
  onEvidenceClick,
}) => {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredEvidence = useMemo(() => {
    if (filter === 'all') return evidence
    return evidence.filter((item) => {
      if (filter === 'supporting') return (item.support_score ?? 0) >= 0.5
      return (item.support_score ?? 0) < 0.5
    })
  }, [evidence, filter])

  const counts = useMemo(
    () => ({
      all: evidence.length,
      supporting: evidence.filter((e) => (e.support_score ?? 0) >= 0.5).length,
      counter: evidence.filter((e) => (e.support_score ?? 0) < 0.5).length,
    }),
    [evidence],
  )

  const overallScore = useMemo(() => {
    const scores = evidence
      .filter((e) => e.support_score !== null)
      .map((e) => e.support_score as number)
    if (scores.length === 0) return null
    return scores.reduce((a, b) => a + b, 0) / scores.length
  }, [evidence])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-gray-700/50">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-100 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            Evidence Explorer
          </h2>
          {overallScore !== null && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 rounded-lg">
              <span className="text-xs text-gray-500">Overall</span>
              <span
                className={`text-sm font-semibold ${
                  overallScore >= 0.7
                    ? 'text-emerald-400'
                    : overallScore >= 0.4
                      ? 'text-amber-400'
                      : 'text-red-400'
                }`}
              >
                {Math.round(overallScore * 100)}%
              </span>
            </div>
          )}
        </div>
        <FilterTabs filter={filter} onFilterChange={onFilterChange} counts={counts} />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Evidence Section */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Evidence Items ({filteredEvidence.length})
          </h3>
          <div className="space-y-3">
            {filteredEvidence.map((item) => (
              <EvidenceCard
                key={item.id}
                item={item}
                expanded={expandedIds.has(item.id)}
                onToggle={() => toggleExpand(item.id)}
                onClick={onEvidenceClick ? () => onEvidenceClick(item.id) : undefined}
              />
            ))}
            {filteredEvidence.length === 0 && (
              <div className="text-center py-8 text-gray-500 text-sm">
                No evidence items match this filter.
              </div>
            )}
          </div>
        </div>

        {/* Claims Section */}
        {claims.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Extracted Claims ({claims.length})
            </h3>
            <div className="space-y-2">
              {claims.map((claim) => (
                <ClaimCard key={claim.id} claim={claim} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default EvidenceExplorer
