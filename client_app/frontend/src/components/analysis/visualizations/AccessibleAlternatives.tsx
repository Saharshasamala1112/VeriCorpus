import type { ExplanationResult, EvidenceItem } from '../../../types/explainability'
import type { ExplanationTemplate } from '../../../types/explainability'

interface AccessibleAlternativesProps {
  explanation: ExplanationResult
  template: ExplanationTemplate
}

function EvidenceToText({
  evidence,
  template,
}: {
  evidence: EvidenceItem[]
  template: ExplanationTemplate
}) {
  if (evidence.length === 0) {
    return <p className="text-xs text-slate-500 italic">{template.noExplanationAvailable}</p>
  }

  return (
    <div className="space-y-2" role="list" aria-label="Evidence list">
      {evidence.map((item, i) => (
        <div
          key={i}
          role="listitem"
          className="rounded border border-slate-800/50 bg-slate-950/30 p-3"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              {item.type.replace(/_/g, ' ')}
            </span>
            <span className="text-[10px] text-slate-600">
              {(item.relevance * 100).toFixed(0)}% relevance
            </span>
          </div>
          <p className="text-xs text-slate-300">{item.content}</p>
          <p className="text-[11px] text-slate-500 mt-1">{item.description}</p>
        </div>
      ))}
    </div>
  )
}

export default function AccessibleAlternatives({
  explanation,
  template,
}: AccessibleAlternativesProps) {
  return (
    <div className="space-y-6" role="region" aria-label="Accessible text alternatives">
      {/* Verdict summary for screen readers */}
      <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          Text Summary (Screen Reader Friendly)
        </h4>
        <div className="space-y-2 text-sm text-slate-300">
          <p>
            <strong>Assessment:</strong> {explanation.assessment}
          </p>
          <p>
            <strong>Confidence:</strong> {(explanation.confidence * 100).toFixed(0)}% (
            {explanation.confidenceLevel.replace(/_/g, ' ')})
          </p>
          <p>
            <strong>Verdict:</strong> {explanation.verdictCategory.replace(/_/g, ' ')}
          </p>
          {explanation.manipulationProbability != null && (
            <p>
              <strong>Manipulation Probability:</strong>{' '}
              {(explanation.manipulationProbability * 100).toFixed(0)}%
            </p>
          )}
        </div>
      </div>

      {/* Supporting signals as text */}
      <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          {template.supportingSignalsLabel}
        </h4>
        {explanation.supportingSignals.length > 0 ? (
          <ul className="space-y-1 list-disc list-inside text-xs text-slate-300">
            {explanation.supportingSignals.map((signal, i) => (
              <li key={i}>
                <strong>{signal.name}:</strong> {signal.value} — {signal.detail}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500 italic">No supporting signals detected.</p>
        )}
      </div>

      {/* Counter signals as text */}
      <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          {template.counterSignalsLabel}
        </h4>
        {explanation.counterSignals.length > 0 ? (
          <ul className="space-y-1 list-disc list-inside text-xs text-slate-300">
            {explanation.counterSignals.map((signal, i) => (
              <li key={i}>
                <strong>{signal.name}:</strong> {signal.value} — {signal.detail}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-500 italic">No counter-signals detected.</p>
        )}
      </div>

      {/* Evidence as text */}
      <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-4">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
          {template.evidenceLabel}
        </h4>
        <EvidenceToText evidence={explanation.evidence} template={template} />
      </div>

      {/* Limitations */}
      {explanation.limitations.length > 0 && (
        <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-4">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
            {template.limitationsLabel}
          </h4>
          <ul className="space-y-1 list-disc list-inside text-xs text-slate-400">
            {explanation.limitations.map((limitation, i) => (
              <li key={i}>{limitation}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
