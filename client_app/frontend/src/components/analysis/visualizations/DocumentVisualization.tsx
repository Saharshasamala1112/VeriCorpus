import type { EvidenceItem } from '../../../types/explainability'

interface DocumentVisualizationProps {
  evidence: EvidenceItem[]
  language: string
}

export default function DocumentVisualization({
  evidence,
  language: _language,
}: DocumentVisualizationProps) {
  const extractedText = evidence.filter((e) => e.type === 'extracted_text')
  const similarityMatches = evidence.filter((e) => e.type === 'similarity_match')
  const suspiciousSections = evidence.filter((e) => e.type === 'suspicious_section')

  if (
    extractedText.length === 0 &&
    similarityMatches.length === 0 &&
    suspiciousSections.length === 0
  )
    return null

  return (
    <div className="space-y-4" role="region" aria-label="Document analysis visualization">
      {/* Extracted text */}
      {extractedText.length > 0 && (
        <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-cyan-400 mb-3">
            Extracted Text
          </h4>
          <div className="space-y-2">
            {extractedText.map((item, i) => (
              <div key={`text-${i}`} className="rounded bg-slate-950/30 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400 opacity-70">
                    Text Region
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {(item.relevance * 100).toFixed(0)}% relevance
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-slate-200">{item.content}</p>
                <p className="text-[11px] text-slate-500 mt-1">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Similarity matches */}
      {similarityMatches.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">
            Similarity Matches ({similarityMatches.length})
          </h4>
          <div className="space-y-2">
            {similarityMatches.map((match, i) => {
              const score = (match.relevance * 100).toFixed(0)
              const scoreNum = Number(score)
              return (
                <div key={`sim-${i}`} className="rounded bg-slate-950/30 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          scoreNum >= 80
                            ? 'bg-red-500/20 text-red-300'
                            : scoreNum >= 50
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-cyan-500/20 text-cyan-300'
                        }`}
                      >
                        {score}% match
                      </span>
                    </div>
                    {typeof match.metadata?.page === 'number' && (
                      <span className="text-[10px] text-slate-500">Page {match.metadata.page}</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 mt-1">{match.content}</p>
                  <p className="text-[11px] text-slate-500 mt-1">{match.description}</p>
                  {typeof match.metadata?.sourceDocument === 'string' && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      Source: {match.metadata.sourceDocument}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Suspicious sections */}
      {suspiciousSections.length > 0 && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-400 mb-3">
            Suspicious Sections ({suspiciousSections.length})
          </h4>
          <div className="space-y-2">
            {suspiciousSections.map((section, i) => (
              <div key={`sec-${i}`} className="rounded bg-slate-950/30 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-rose-400 opacity-70">
                    Section {i + 1}
                  </span>
                  <span className="text-[10px] text-slate-500">
                    {(section.relevance * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="text-xs text-slate-300">{section.description}</p>
                <p className="text-[11px] text-slate-500 mt-1 break-all">{section.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
