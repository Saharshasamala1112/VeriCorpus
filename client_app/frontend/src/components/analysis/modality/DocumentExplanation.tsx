import { Badge } from '../../ui'
import type { ExplanationResult } from '../../../types/explainability'
import { getExplanationTemplate } from '../../../i18n'

interface DocumentExplanationProps {
  explanation: ExplanationResult
  language: string
}

export default function DocumentExplanation({ explanation, language }: DocumentExplanationProps) {
  const template = getExplanationTemplate(language)
  const docEvidence = explanation.evidence.filter((e) =>
    ['suspicious_section', 'similarity_match', 'extracted_text'].includes(e.type),
  )

  if (docEvidence.length === 0) {
    return <p className="text-xs text-slate-500 italic">{template.noExplanationAvailable}</p>
  }

  return (
    <div className="space-y-4">
      {/* Extracted Text */}
      {docEvidence
        .filter((e) => e.type === 'extracted_text')
        .map((ev, i) => (
          <div key={`text-${i}`} className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
            <div className="flex items-center justify-between">
              <Badge variant="info" size="sm">
                {template.document.extractedTextLabel}
              </Badge>
              <span className="text-[11px] text-slate-500">
                {(ev.relevance * 100).toFixed(0)}% relevance
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{ev.content}</p>
            <p className="mt-1 text-[11px] text-slate-500">{ev.description}</p>
          </div>
        ))}

      {/* Similarity Evidence */}
      {docEvidence
        .filter((e) => e.type === 'similarity_match')
        .map((ev, i) => {
          const similarity = (ev.relevance * 100).toFixed(0)
          const scoreNum = Number(similarity)

          return (
            <div
              key={`sim-${i}`}
              className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="warning" size="sm">
                    {template.document.similarityEvidenceLabel}
                  </Badge>
                  <Badge
                    variant={scoreNum >= 80 ? 'danger' : scoreNum >= 50 ? 'warning' : 'info'}
                    size="sm"
                  >
                    {similarity}%
                  </Badge>
                </div>
                {!!ev.metadata?.page && (
                  <span className="text-[11px] text-slate-500">
                    Page {ev.metadata.page as number}
                  </span>
                )}
              </div>
              <p className="mt-2 text-xs text-slate-300">{ev.content}</p>
              <p className="mt-1 text-[11px] text-slate-500">{ev.description}</p>
              {!!ev.metadata?.sourceDocument && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Source: {ev.metadata.sourceDocument as string}
                </p>
              )}
            </div>
          )
        })}

      {/* Suspicious Sections */}
      {docEvidence
        .filter((e) => e.type === 'suspicious_section')
        .map((ev, i) => (
          <div key={`sec-${i}`} className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
            <div className="flex items-center justify-between">
              <Badge variant="danger" size="sm">
                {template.document.suspiciousSectionsLabel}
              </Badge>
              <span className="text-[11px] text-slate-500">{(ev.relevance * 100).toFixed(0)}%</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">{ev.description}</p>
            <p className="mt-1 break-all text-[11px] text-slate-500">{ev.content}</p>
          </div>
        ))}
    </div>
  )
}
