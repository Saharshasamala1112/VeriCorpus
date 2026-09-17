import { useState } from 'react'
import {
  Info,
  ThumbsUp,
  ThumbsDown,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  BrainCircuit,
} from 'lucide-react'
import { Card, Badge } from '../ui'
import type { ExplanationSignal, ExplanationTemplate } from '../../types/explainability'

interface ExplainabilitySectionProps {
  explanation: string
  supportingSignals: ExplanationSignal[]
  counterSignals: ExplanationSignal[]
  limitations: string[]
  template: ExplanationTemplate
}

export default function ExplainabilitySection({
  explanation,
  supportingSignals,
  counterSignals,
  limitations,
  template,
}: ExplainabilitySectionProps) {
  const [showWhy, setShowWhy] = useState(false)
  const [showLimitations, setShowLimitations] = useState(false)

  return (
    <div className="space-y-4">
      {/* Why did we reach this assessment? */}
      <Card className="border-cyan-500/20 bg-cyan-500/5">
        <button
          onClick={() => setShowWhy(!showWhy)}
          className="flex w-full items-center gap-3 text-left"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400">
            <Info className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">
              {template.explainability.whyAssessment}
            </h3>
            <p className="text-xs text-slate-400">
              {template.explainability.interactiveExplanation}
            </p>
          </div>
          {showWhy ? (
            <ChevronDown className="h-5 w-5 text-slate-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-500" />
          )}
        </button>

        {showWhy && (
          <div className="mt-4 space-y-4 border-t border-cyan-500/20 pt-4">
            {/* Main explanation */}
            <p className="text-sm leading-relaxed text-slate-300">{explanation}</p>

            {/* Supporting signals */}
            {supportingSignals.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ThumbsUp className="h-4 w-4 text-emerald-400" />
                  <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                    {template.panel.supportingEvidence}
                  </h4>
                </div>
                <div className="space-y-2">
                  {supportingSignals.map((sig) => (
                    <div
                      key={sig.name}
                      className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-white">{sig.name}</span>
                        {sig.weight != null && (
                          <Badge variant="success" size="sm">
                            weight: {sig.weight.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{sig.detail}</p>
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${(sig.weight ?? 0.5) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Counter-signals */}
            {counterSignals.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ThumbsDown className="h-4 w-4 text-rose-400" />
                  <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider">
                    {template.panel.counterEvidence}
                  </h4>
                </div>
                <div className="space-y-2">
                  {counterSignals.map((sig) => (
                    <div
                      key={sig.name}
                      className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-white">{sig.name}</span>
                        {sig.weight != null && (
                          <Badge variant="danger" size="sm">
                            weight: {sig.weight.toFixed(2)}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">{sig.detail}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Methodology note */}
            <div className="rounded-lg bg-slate-800/30 p-3">
              <div className="flex items-center gap-2 mb-1">
                <BrainCircuit className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  {template.modelInfo.methodology}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {template.explainability.methodologyDisclaimer}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Limitations */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <button
          onClick={() => setShowLimitations(!showLimitations)}
          className="flex w-full items-center gap-3 text-left"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-white">
              {template.explainability.limitationsAndCaveats}
            </h3>
            <p className="text-xs text-slate-400">{template.explainability.importantContext}</p>
          </div>
          {showLimitations ? (
            <ChevronDown className="h-5 w-5 text-slate-500" />
          ) : (
            <ChevronRight className="h-5 w-5 text-slate-500" />
          )}
        </button>

        {showLimitations && (
          <div className="mt-4 border-t border-amber-500/20 pt-4">
            <ul className="space-y-2">
              {limitations.map((lim, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  <span className="text-xs text-slate-300 leading-relaxed">{lim}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  )
}
