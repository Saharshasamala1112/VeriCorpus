import { ExternalLink } from 'lucide-react'
import { Card, Badge } from '../ui'
import type { EvidenceEntry } from '../../types/analysis'
import type { ExplanationTemplate } from '../../types/explainability'

interface PlagiarismMatchesProps {
  matches: EvidenceEntry[]
  template: ExplanationTemplate
}

function getMatchConfig(
  template: ExplanationTemplate,
): Record<NonNullable<EvidenceEntry['matchType']>, { label: string; color: string }> {
  return {
    exact: { label: template.plagiarism.exactMatch, color: 'danger' },
    near_duplicate: { label: template.plagiarism.nearDuplicate, color: 'warning' },
    ngram: { label: template.plagiarism.ngramMatch, color: 'warning' },
    lexical: { label: template.plagiarism.lexicalMatch, color: 'info' },
    paraphrase: { label: template.plagiarism.paraphrase, color: 'info' },
    semantic: { label: template.plagiarism.semanticSimilarity, color: 'info' },
  }
}

export default function PlagiarismMatches({ matches, template }: PlagiarismMatchesProps) {
  if (!matches.length) return null
  const matchConfig = getMatchConfig(template)

  return (
    <div className="space-y-3">
      {matches.map((match) => {
        const config = matchConfig[match.matchType ?? 'semantic']
        return (
          <Card key={match.id} className="border-slate-800/80 bg-slate-900/50">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={config.color as 'danger' | 'warning' | 'info'} size="sm">
                    {config.label}
                  </Badge>
                  <span className="text-xs text-slate-400">
                    {(match.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-white">{match.label}</p>
                <p className="mt-1 rounded bg-amber-500/10 p-2 text-xs leading-relaxed text-amber-100">
                  {match.content}
                </p>
                <p className="mt-2 text-xs text-slate-400">{match.description}</p>
              </div>
              {match.sourceUrl && (
                <a
                  href={match.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-cyan-400 hover:text-cyan-300"
                  aria-label="Open source"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
            </div>
            {(match.page != null || match.startOffset != null) && (
              <p className="mt-3 text-[11px] font-mono text-slate-500">
                {match.page != null ? `page ${match.page} · ` : ''}
                {match.startOffset != null
                  ? `characters ${match.startOffset}-${match.endOffset}`
                  : ''}
              </p>
            )}
          </Card>
        )
      })}
    </div>
  )
}
