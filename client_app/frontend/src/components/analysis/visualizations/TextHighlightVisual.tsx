import type { EvidenceItem } from '../../../types/explainability'

interface TextHighlightVisualProps {
  evidence: EvidenceItem[]
  originalText?: string
  language: string
}

function getRelevanceColor(relevance: number): string {
  if (relevance >= 0.8) return 'bg-red-500/20 border-red-500/40 text-red-300'
  if (relevance >= 0.6) return 'bg-amber-500/20 border-amber-500/40 text-amber-300'
  if (relevance >= 0.4) return 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300'
  return 'bg-slate-500/20 border-slate-500/40 text-slate-300'
}

function getRelevanceBarColor(relevance: number): string {
  if (relevance >= 0.8) return 'bg-red-500'
  if (relevance >= 0.6) return 'bg-amber-500'
  if (relevance >= 0.4) return 'bg-cyan-500'
  return 'bg-slate-500'
}

export default function TextHighlightVisual({
  evidence,
  originalText,
  language: _language,
}: TextHighlightVisualProps) {
  const textSpans = evidence.filter((e) => e.type === 'text_span')
  const sentenceIndicators = evidence.filter((e) => e.type === 'sentence_indicator')

  if (textSpans.length === 0 && sentenceIndicators.length === 0) return null

  return (
    <div className="space-y-3" role="region" aria-label="Text highlight visualization">
      {/* Original text with highlighted spans */}
      {originalText && textSpans.length > 0 && (
        <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
            Annotated Text
          </h4>
          <div className="text-sm leading-relaxed text-slate-300 space-y-2">
            {textSpans.map((span, i) => {
              const content = span.content
              const startIdx = originalText.indexOf(content.slice(0, 50))
              const endIdx = startIdx + content.length
              const before = startIdx > 0 ? originalText.slice(0, startIdx) : ''
              const after = endIdx < originalText.length ? originalText.slice(endIdx) : ''

              return (
                <div key={`annotated-${i}`} className="flex flex-wrap items-start gap-1">
                  {before && <span className="text-slate-400">{before}</span>}
                  <mark
                    className={`rounded px-1 py-0.5 border text-slate-200 ${getRelevanceColor(span.relevance)}`}
                    title={`${(span.relevance * 100).toFixed(0)}% relevance — ${span.description}`}
                  >
                    {content}
                  </mark>
                  {after && <span className="text-slate-400">{after}</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Evidence items without original text */}
      {textSpans.map((span, i) => (
        <div
          key={`span-${i}`}
          className={`rounded-lg border p-3 ${getRelevanceColor(span.relevance)}`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
              Influential Span
            </span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-16 overflow-hidden rounded-full bg-black/30">
                <div
                  className={`h-full rounded-full ${getRelevanceBarColor(span.relevance)}`}
                  style={{ width: `${span.relevance * 100}%` }}
                />
              </div>
              <span className="text-[11px] opacity-70">{(span.relevance * 100).toFixed(0)}%</span>
            </div>
          </div>
          <p className="text-xs leading-relaxed text-slate-200 mt-1">{span.content}</p>
          <p className="text-[11px] opacity-60 mt-1">{span.description}</p>
        </div>
      ))}

      {/* Sentence-level indicators */}
      {sentenceIndicators.map((indicator, i) => (
        <div
          key={`sent-${i}`}
          className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3"
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
              Sentence Indicator
            </span>
            <span className="text-[11px] text-slate-500">
              {(indicator.relevance * 100).toFixed(0)}% relevance
            </span>
          </div>
          <p className="text-xs text-slate-300">{indicator.content}</p>
          <p className="text-[11px] text-slate-500 mt-1">{indicator.description}</p>
          {indicator.metadata?.sentenceIndex != null && (
            <p className="text-[10px] text-slate-600 mt-1">
              Sentence #{indicator.metadata.sentenceIndex as number}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
