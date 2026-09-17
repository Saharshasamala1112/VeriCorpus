import { Badge } from '../../ui'
import type { ExplanationResult } from '../../../types/explainability'
import { getExplanationTemplate } from '../../../i18n'

interface TextExplanationProps {
  explanation: ExplanationResult
  language: string
}

export default function TextExplanation({ explanation, language }: TextExplanationProps) {
  const template = getExplanationTemplate(language)
  const textEvidence = explanation.evidence.filter((e) =>
    [
      'text_span',
      'sentence_indicator',
      'similarity_match',
      'classifier_output',
      'linguistic_signal',
    ].includes(e.type),
  )

  if (textEvidence.length === 0) {
    return <p className="text-xs text-slate-500 italic">{template.noExplanationAvailable}</p>
  }

  return (
    <div className="space-y-4">
      {/* Highlighted Influential Spans */}
      {textEvidence
        .filter((e) => e.type === 'text_span')
        .map((ev, i) => (
          <div key={`span-${i}`} className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
            <div className="flex items-center justify-between">
              <Badge variant="info" size="sm">
                {template.text.highlightedSpansLabel}
              </Badge>
              <span className="text-[11px] text-slate-500">
                {(ev.relevance * 100).toFixed(0)}% relevance
              </span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{ev.content}</p>
            <p className="mt-1 text-[11px] text-slate-500">{ev.description}</p>
          </div>
        ))}

      {/* Sentence-Level Indicators */}
      {textEvidence
        .filter((e) => e.type === 'sentence_indicator')
        .map((ev, i) => (
          <div
            key={`sent-${i}`}
            className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3"
          >
            <div className="flex items-center justify-between">
              <Badge variant="info" size="sm">
                {template.text.sentenceIndicatorsLabel}
              </Badge>
              <span className="text-[11px] text-slate-500">{(ev.relevance * 100).toFixed(0)}%</span>
            </div>
            <p className="mt-2 text-xs text-slate-300">{ev.content}</p>
            <p className="mt-1 text-[11px] text-slate-500">{ev.description}</p>
            {ev.metadata?.sentenceIndex != null && (
              <p className="mt-1 text-[10px] text-slate-600">
                Sentence #{ev.metadata.sentenceIndex as number}
              </p>
            )}
          </div>
        ))}

      {/* Classifier Output */}
      {textEvidence
        .filter((e) => e.type === 'classifier_output')
        .map((ev, i) => (
          <div
            key={`clf-${i}`}
            className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-3"
          >
            <div className="flex items-center justify-between">
              <Badge variant="info" size="sm">
                {template.text.classifierOutputLabel}
              </Badge>
              <span className="text-[11px] text-slate-500">{(ev.relevance * 100).toFixed(0)}%</span>
            </div>
            <p className="mt-2 text-xs text-slate-400">{ev.description}</p>
            {!!ev.metadata?.classifierProbabilities && (
              <div className="mt-2 space-y-1">
                {Object.entries(ev.metadata.classifierProbabilities as Record<string, number>).map(
                  ([label, prob]) => (
                    <div key={label} className="flex items-center gap-2">
                      <span className="w-16 text-[11px] text-slate-500">{label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-600"
                          style={{ width: `${(prob as number) * 100}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-[11px] text-slate-400">
                        {((prob as number) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        ))}

      {/* Linguistic Signals */}
      {textEvidence
        .filter((e) => e.type === 'linguistic_signal')
        .map((ev, i) => (
          <div
            key={`ling-${i}`}
            className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-3"
          >
            <div className="flex items-center justify-between">
              <Badge variant="info" size="sm">
                {template.text.linguisticSignalsLabel}
              </Badge>
              <span className="text-[11px] text-slate-500">{(ev.relevance * 100).toFixed(0)}%</span>
            </div>
            <p className="mt-2 text-xs text-slate-300">{ev.content}</p>
            <p className="mt-1 text-[11px] text-slate-500">{ev.description}</p>
            {!!ev.metadata?.linguisticFeatures && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {Object.entries(ev.metadata.linguisticFeatures as Record<string, number>).map(
                  ([feature, value]) => (
                    <div
                      key={feature}
                      className="flex items-center justify-between rounded bg-slate-900/50 px-2 py-1"
                    >
                      <span className="text-[10px] text-slate-500">{feature}</span>
                      <span className="text-[10px] font-medium text-slate-300">
                        {(value as number).toFixed(2)}
                      </span>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
        ))}

      {/* Similarity Evidence */}
      {textEvidence
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
                    {template.text.similarityEvidenceLabel}
                  </Badge>
                  <Badge
                    variant={scoreNum >= 80 ? 'danger' : scoreNum >= 50 ? 'warning' : 'info'}
                    size="sm"
                  >
                    {similarity}%
                  </Badge>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-300">{ev.content}</p>
              <p className="mt-1 text-[11px] text-slate-500">{ev.description}</p>
            </div>
          )
        })}
    </div>
  )
}
