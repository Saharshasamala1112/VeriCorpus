import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Database,
  Brain,
  FileText,
  User,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
  ShieldQuestion,
  Clock,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react'
import type {
  ClaimGroup,
  SourceItem,
  SourceOrigin,
  VerificationStatus,
  ExplanationTemplate,
} from '../../types/explainability'

// ─── Constants ─────────────────────────────────────────────────────────────

const ORIGIN_CONFIG: Record<
  SourceOrigin,
  { label: (t: ExplanationTemplate) => string; icon: typeof Globe; color: string; bgColor: string }
> = {
  user_input: {
    label: (t) => t.sourceExplorer.userInput,
    icon: User,
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20',
  },
  local_corpus: {
    label: (t) => t.sourceExplorer.localCorpus,
    icon: Database,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
  },
  global_source: {
    label: (t) => t.sourceExplorer.globalSource,
    icon: Globe,
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10 border-cyan-500/20',
  },
  model: {
    label: (t) => t.sourceExplorer.model,
    icon: Brain,
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
  },
  llm_inference: {
    label: (t) => t.sourceExplorer.llmInference,
    icon: FileText,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
  },
}

const VERIFICATION_CONFIG: Record<
  VerificationStatus,
  { label: (t: ExplanationTemplate) => string; icon: typeof Shield; color: string; bgColor: string }
> = {
  verified: {
    label: (t) => t.sourceExplorer.verified,
    icon: ShieldCheck,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
  },
  unverified: {
    label: (t) => t.sourceExplorer.unverified,
    icon: ShieldQuestion,
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
  },
  contradicted: {
    label: (t) => t.sourceExplorer.contradicted,
    icon: ShieldX,
    color: 'text-red-400',
    bgColor: 'bg-red-500/10 border-red-500/20',
  },
  expired: {
    label: (t) => t.sourceExplorer.expired,
    icon: ShieldAlert,
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10 border-amber-500/20',
  },
  pending: {
    label: (t) => t.sourceExplorer.pending,
    icon: ShieldQuestion,
    color: 'text-slate-400',
    bgColor: 'bg-slate-500/10 border-slate-500/20',
  },
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function computeFreshness(retrievedAt: string | null): 'fresh' | 'stale' | null {
  if (!retrievedAt) return null
  const d = new Date(retrievedAt)
  if (isNaN(d.getTime())) return null
  const ageDays = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24)
  if (ageDays <= 30) return 'fresh'
  return 'stale'
}

// ─── Origin Badge ──────────────────────────────────────────────────────────

function OriginBadge({
  origin,
  template,
}: {
  origin: SourceOrigin
  template: ExplanationTemplate
}) {
  const config = ORIGIN_CONFIG[origin]
  const Icon = config.icon
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${config.bgColor} ${config.color}`}
    >
      <Icon className="h-3 w-3" />
      {config.label(template)}
    </span>
  )
}

// ─── Verification Badge ────────────────────────────────────────────────────

function VerificationBadge({
  status,
  template,
}: {
  status: VerificationStatus
  template: ExplanationTemplate
}) {
  const config = VERIFICATION_CONFIG[status]
  const Icon = config.icon
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium ${config.bgColor} ${config.color}`}
    >
      <Icon className="h-3 w-3" />
      {config.label(template)}
    </span>
  )
}

// ─── Freshness Indicator ───────────────────────────────────────────────────

function FreshnessIndicator({
  retrievedAt,
  template,
}: {
  retrievedAt: string | null
  template: ExplanationTemplate
}) {
  const freshness = computeFreshness(retrievedAt)
  if (!freshness) return null

  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] ${
        freshness === 'fresh' ? 'text-emerald-400' : 'text-amber-400'
      }`}
    >
      <Clock className="h-3 w-3" />
      {freshness === 'fresh' ? template.sourceExplorer.fresh : template.sourceExplorer.stale}
    </span>
  )
}

// ─── Source Card ───────────────────────────────────────────────────────────

function SourceCard({ source, template }: { source: SourceItem; template: ExplanationTemplate }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 transition-colors hover:border-slate-700/60">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start justify-between gap-2 p-3 text-left"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-white truncate max-w-[200px]">
              {source.title}
            </span>
            <OriginBadge origin={source.origin} template={template} />
            <VerificationBadge status={source.verificationStatus} template={template} />
            <FreshnessIndicator retrievedAt={source.temporal.retrieved_at} template={template} />
          </div>
          <p className="text-[10px] text-slate-500 truncate">{source.publisher}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-slate-400">
            {template.sourceExplorer.relevance}: {(source.relevance * 100).toFixed(0)}%
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-500 transition-transform duration-150 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-800/50 px-3 pb-3 pt-2 space-y-2">
          {/* Temporal info */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded bg-slate-950/40 px-2 py-1">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                {template.sourceExplorer.published}
              </p>
              <p className="text-[10px] text-slate-300">
                {formatDate(source.temporal.published_at)}
              </p>
            </div>
            <div className="rounded bg-slate-950/40 px-2 py-1">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                {template.sourceExplorer.retrieved}
              </p>
              <p className="text-[10px] text-slate-300">
                {formatDate(source.temporal.retrieved_at)}
              </p>
            </div>
            <div className="rounded bg-slate-950/40 px-2 py-1">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                {template.sourceExplorer.lastVerified}
              </p>
              <p className="text-[10px] text-slate-300">
                {formatDate(source.temporal.last_verified_at)}
              </p>
            </div>
          </div>

          {/* Source type and publisher */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded bg-slate-950/40 px-2 py-1">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                {template.sourceExplorer.sourceType}
              </p>
              <p className="text-[10px] text-slate-300">{source.sourceType}</p>
            </div>
            <div className="rounded bg-slate-950/40 px-2 py-1">
              <p className="text-[9px] text-slate-500 uppercase tracking-wider">
                {template.sourceExplorer.publisher}
              </p>
              <p className="text-[10px] text-slate-300">{source.publisher}</p>
            </div>
          </div>

          {/* Matched claim */}
          <div className="rounded bg-slate-950/40 px-2 py-1">
            <p className="text-[9px] text-slate-500 uppercase tracking-wider">
              {template.sourceExplorer.matchedClaim}
            </p>
            <p className="text-[10px] text-slate-300 leading-relaxed">{source.matchedClaim}</p>
          </div>

          {/* Excerpt */}
          {source.excerpt && (
            <div className="rounded border border-cyan-500/10 bg-cyan-500/5 px-2 py-1">
              <p className="text-[9px] text-cyan-400 uppercase tracking-wider">
                {template.sourceExplorer.supportingExcerpt}
              </p>
              <p className="text-[10px] text-slate-300 leading-relaxed italic">
                &ldquo;{source.excerpt}&rdquo;
              </p>
            </div>
          )}

          {/* URL */}
          {source.url && (
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              {template.sourceExplorer.viewSource}
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Claim Section ─────────────────────────────────────────────────────────

function ClaimSection({
  claimGroup,
  template,
  defaultOpen,
}: {
  claimGroup: ClaimGroup
  template: ExplanationTemplate
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false)
  const totalSources =
    claimGroup.supporting.length + claimGroup.contradicting.length + claimGroup.unverified.length

  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-900/50 overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/30"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <ChevronRight
            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-150 ${
              isOpen ? 'rotate-90' : ''
            }`}
          />
          <h3 className="text-sm font-semibold text-white truncate">{claimGroup.claim}</h3>
          <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
            {totalSources}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {claimGroup.supporting.length > 0 && (
            <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
              +{claimGroup.supporting.length}
            </span>
          )}
          {claimGroup.contradicting.length > 0 && (
            <span className="rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400">
              −{claimGroup.contradicting.length}
            </span>
          )}
          {claimGroup.unverified.length > 0 && (
            <span className="rounded bg-slate-500/10 px-1.5 py-0.5 text-[10px] text-slate-400">
              ?{claimGroup.unverified.length}
            </span>
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-slate-800/50 px-4 pb-4 pt-3 space-y-3">
          {/* Supporting sources */}
          {claimGroup.supporting.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 mb-2">
                <CheckCircle2 className="h-3 w-3" />
                {template.sourceExplorer.supportingSources}
                <span className="text-emerald-500/60">({claimGroup.supporting.length})</span>
              </h4>
              <div className="space-y-2">
                {claimGroup.supporting.map((source) => (
                  <SourceCard key={source.id} source={source} template={template} />
                ))}
              </div>
            </div>
          )}

          {/* Contradicting sources */}
          {claimGroup.contradicting.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[11px] font-semibold text-red-400 mb-2">
                <AlertTriangle className="h-3 w-3" />
                {template.sourceExplorer.contradictingSources}
                <span className="text-red-500/60">({claimGroup.contradicting.length})</span>
              </h4>
              <div className="space-y-2">
                {claimGroup.contradicting.map((source) => (
                  <SourceCard key={source.id} source={source} template={template} />
                ))}
              </div>
            </div>
          )}

          {/* Unverified sources */}
          {claimGroup.unverified.length > 0 && (
            <div>
              <h4 className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 mb-2">
                <ShieldQuestion className="h-3 w-3" />
                {template.sourceExplorer.unverifiedSources}
                <span className="text-slate-500/60">({claimGroup.unverified.length})</span>
              </h4>
              <div className="space-y-2">
                {claimGroup.unverified.map((source) => (
                  <SourceCard key={source.id} source={source} template={template} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

interface SourceExplorerProps {
  sourceGroups: ClaimGroup[]
  template: ExplanationTemplate
}

export default function SourceExplorer({ sourceGroups, template }: SourceExplorerProps) {
  if (sourceGroups.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800/80 bg-slate-900/50 p-5 text-center">
        <Globe className="h-8 w-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">{template.sourceExplorer.noSources}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <Globe className="h-4 w-4 text-cyan-400" />
        <h2 className="text-sm font-semibold text-white">{template.sourceExplorer.title}</h2>
        <span className="rounded bg-cyan-500/10 px-1.5 py-0.5 text-[10px] text-cyan-300">
          {sourceGroups.length} {sourceGroups.length === 1 ? 'claim' : 'claims'}
        </span>
      </div>
      <p className="text-[11px] text-slate-500">{template.sourceExplorer.subtitle}</p>

      {sourceGroups.map((group, i) => (
        <ClaimSection
          key={group.claim}
          claimGroup={group}
          template={template}
          defaultOpen={i === 0}
        />
      ))}
    </div>
  )
}
