import { useMemo } from 'react'
import {
  AlertTriangle,
  BrainCircuit,
  Database,
  Info,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { Card, Badge, Progress } from '../ui'
import ExplanationSection from './ExplanationSection'
import TextExplanation from './modality/TextExplanation'
import ImageExplanation from './modality/ImageExplanation'
import AudioExplanation from './modality/AudioExplanation'
import VideoExplanation from './modality/VideoExplanation'
import DocumentExplanation from './modality/DocumentExplanation'
import type { AuthenticityResult } from '../../services/authenticity.service'
import { ExplanationEngine } from '../../services/explanation.service'
import {
  createLocalizedExplanation,
  getVerdictLabel,
  getConfidenceLevelLabel,
  confidenceBadgeVariant,
} from '../../lib/explanation-localization'
import type { ExplanationResult, VerdictCategory } from '../../types/explainability'
import type { MediaType } from '../../config/media-registry'

interface ExplanationPanelProps {
  result: AuthenticityResult
  language?: string
}

const MODALITY_COMPONENTS: Record<
  MediaType,
  React.ComponentType<{ explanation: ExplanationResult; language: string }>
> = {
  text: TextExplanation,
  image: ImageExplanation,
  audio: AudioExplanation,
  video: VideoExplanation,
  document: DocumentExplanation,
}

const VERDICT_COLORS: Record<VerdictCategory, { border: string; bg: string; text: string }> = {
  likely_manipulated: {
    border: 'border-amber-500/20',
    bg: 'bg-amber-500/5',
    text: 'text-amber-300',
  },
  likely_authentic: {
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/5',
    text: 'text-emerald-300',
  },
  inconclusive: {
    border: 'border-slate-500/20',
    bg: 'bg-slate-500/5',
    text: 'text-slate-300',
  },
}

export default function ExplanationPanel({ result, language = 'en' }: ExplanationPanelProps) {
  const explanation: ExplanationResult = useMemo(() => ExplanationEngine.explain(result), [result])
  const { template } = useMemo(() => createLocalizedExplanation(language), [language])

  const ModalityComponent = MODALITY_COMPONENTS[explanation.modality]
  const hasModalityEvidence = explanation.evidence.length > 0
  const verdictColors = VERDICT_COLORS[explanation.verdictCategory]
  const verdictLabel = getVerdictLabel(explanation.verdictCategory, template)
  const confidenceLabel = getConfidenceLevelLabel(explanation.confidenceLevel, template)

  return (
    <div className="space-y-4">
      {/* Overall Assessment */}
      <Card className={`${verdictColors.border} ${verdictColors.bg}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <p className="text-xs text-slate-500">{template.assessment}</p>
            <p className={`mt-1 text-xl font-bold ${verdictColors.text}`}>{verdictLabel}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={confidenceBadgeVariant(explanation.confidence)} size="sm">
                {confidenceLabel}
              </Badge>
              <span className="text-xs text-slate-500">
                {template.confidenceLabel}: {(explanation.confidence * 100).toFixed(0)}%
              </span>
            </div>
            {explanation.manipulationProbability != null && (
              <p className="mt-1 text-xs text-slate-500">
                {template.manipulationProbabilityLabel}:{' '}
                {(explanation.manipulationProbability * 100).toFixed(0)}%
              </p>
            )}
          </div>
          <div className="w-40">
            <Progress
              value={explanation.confidence * 100}
              variant={
                explanation.confidence > 0.7
                  ? 'warning'
                  : explanation.confidence > 0.4
                    ? 'default'
                    : 'success'
              }
              showLabel
              label={template.confidenceLabel}
            />
          </div>
        </div>
      </Card>

      {/* Human-Readable Summary */}
      <Card>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
          <Info className="h-4 w-4 text-cyan-400" />
          {template.humanExplanation.summaryPrefix}
        </h3>
        <p className="text-sm leading-relaxed text-slate-300">
          {explanation.humanExplanation.summary}
        </p>
      </Card>

      {/* Why This Assessment? */}
      <Card>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
          <Info className="h-4 w-4 text-cyan-400" />
          {template.whyThisAssessment}
        </h3>
        <div className="space-y-2">
          {explanation.humanExplanation.why.split('\n').map((line, i) => (
            <p key={i} className="text-sm leading-relaxed text-slate-400">
              {line}
            </p>
          ))}
        </div>
        {explanation.supportingSignals.length > 0 && (
          <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <p className="mb-1 text-xs font-medium text-emerald-400">
              {template.panel.supportingEvidence}
            </p>
            <ul className="space-y-1">
              {explanation.supportingSignals.slice(0, 3).map((sig) => (
                <li key={sig.name} className="text-xs text-slate-400">
                  • {sig.name}: {sig.value}
                </li>
              ))}
            </ul>
          </div>
        )}
        {explanation.counterSignals.length > 0 && (
          <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
            <p className="mb-1 text-xs font-medium text-rose-400">
              {template.panel.counterEvidence}
            </p>
            <ul className="space-y-1">
              {explanation.counterSignals.slice(0, 2).map((sig) => (
                <li key={sig.name} className="text-xs text-slate-400">
                  • {sig.name}: {sig.value}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      {/* Key Factors */}
      {explanation.humanExplanation.keyFactors.length > 0 && (
        <Card>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
            <BrainCircuit className="h-4 w-4 text-purple-400" />
            {template.keyFactorsLabel}
          </h3>
          <p className="mb-3 text-xs text-slate-500">{template.humanExplanation.keyFactorsIntro}</p>
          <div className="space-y-2">
            {explanation.humanExplanation.keyFactors.map((factor, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg border border-slate-800/50 bg-slate-950/50 px-3 py-2"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400" />
                <span className="text-xs text-slate-300">{factor}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Supporting Signals */}
      {explanation.supportingSignals.length > 0 && (
        <Card>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <ThumbsUp className="h-4 w-4 text-emerald-400" />
            {template.supportingSignalsLabel}
          </h3>
          <div className="space-y-3">
            {explanation.supportingSignals.map((sig) => (
              <div key={sig.name} className="flex items-center gap-4">
                <span className="w-44 shrink-0 text-xs text-slate-400">{sig.name}</span>
                <span className="flex-1 truncate text-xs font-medium text-slate-300">
                  {sig.value}
                </span>
                {sig.weight != null && (
                  <span className="shrink-0 text-[10px] text-slate-600">
                    w: {sig.weight.toFixed(1)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Counter-Signals */}
      {explanation.counterSignals.length > 0 && (
        <Card className="border-rose-500/20 bg-rose-500/5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <ThumbsDown className="h-4 w-4 text-rose-400" />
            {template.counterSignalsLabel}
          </h3>
          <div className="space-y-3">
            {explanation.counterSignals.map((sig) => (
              <div key={sig.name} className="flex items-center gap-4">
                <span className="w-44 shrink-0 text-xs text-slate-400">{sig.name}</span>
                <span className="flex-1 truncate text-xs font-medium text-slate-300">
                  {sig.value}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Evidence Section */}
      {hasModalityEvidence && (
        <Card>
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck className="h-4 w-4 text-cyan-400" />
            {template.evidenceLabel}
          </h3>
          <p className="mb-4 text-xs text-slate-500">{template.evidenceDescription}</p>

          {/* Modality-specific evidence */}
          {ModalityComponent && <ModalityComponent explanation={explanation} language={language} />}

          {/* Generic evidence fallback */}
          {!ModalityComponent && (
            <div className="space-y-3">
              {explanation.evidence.map((ev, i) => (
                <div
                  key={`${ev.type}-${i}`}
                  className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-3"
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="info" size="sm">
                      {ev.type.replace(/_/g, ' ')}
                    </Badge>
                    <span className="text-[11px] text-slate-500">
                      {(ev.relevance * 100).toFixed(0)}% relevance
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-400">{ev.description}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Confidence Breakdown */}
      <Card>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
          <BrainCircuit className="h-4 w-4 text-purple-400" />
          {template.confidenceBreakdownLabel}
        </h3>
        <div className="space-y-3">
          {/* Confidence visualization */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-slate-500">{template.panel.overallConfidence}</span>
                <span className="text-sm font-medium text-white">
                  {(explanation.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-600"
                  style={{ width: `${explanation.confidence * 100}%` }}
                />
              </div>
            </div>
            <Badge variant={confidenceBadgeVariant(explanation.confidence)} size="sm">
              {confidenceLabel}
            </Badge>
          </div>

          {/* Weighted signals visualization */}
          {explanation.supportingSignals.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-slate-500">
                {template.panel.weightedSupportingSignals}
              </p>
              <div className="space-y-1">
                {explanation.supportingSignals
                  .filter((s) => s.weight != null)
                  .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
                  .slice(0, 4)
                  .map((sig) => (
                    <div key={sig.name} className="flex items-center gap-2">
                      <span className="w-32 truncate text-[11px] text-slate-500">{sig.name}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${(sig.weight ?? 0.5) * 100}%` }}
                        />
                      </div>
                      <span className="w-8 text-right text-[10px] text-slate-400">
                        {((sig.weight ?? 0.5) * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Counter-signals visualization */}
          {explanation.counterSignals.length > 0 && (
            <div>
              <p className="mb-2 text-xs text-slate-500">{template.panel.counterSignalImpact}</p>
              <div className="space-y-1">
                {explanation.counterSignals.slice(0, 2).map((sig) => (
                  <div key={sig.name} className="flex items-center gap-2">
                    <span className="w-32 truncate text-[11px] text-slate-500">{sig.name}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-rose-500"
                        style={{ width: `${((sig.weight ?? 0.5) * 100) / 2}%` }}
                      />
                    </div>
                    <span className="w-8 text-right text-[10px] text-slate-400">
                      {((sig.weight ?? 0.5) * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Breakdown text */}
          <div className="space-y-1">
            {explanation.humanExplanation.confidenceBreakdown.split('\n').map((line, i) => (
              <p key={i} className="text-xs leading-relaxed text-slate-400">
                {line}
              </p>
            ))}
          </div>
        </div>
      </Card>

      {/* Limitations */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <div>
            <h3 className="text-sm font-semibold text-white">{template.limitationsLabel}</h3>
            <p className="mt-1 text-xs text-slate-500">{template.limitationsDescription}</p>
            <ul className="mt-2 space-y-1">
              {explanation.limitations.map((lim, i) => (
                <li key={i} className="text-xs text-slate-400">
                  {'- '}
                  {lim}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>

      {/* Technical Details - Progressive Disclosure */}
      <ExplanationSection
        title={template.technicalDetailsLabel}
        badge={
          <Badge variant="default" size="sm">
            {template.viewTechnicalDetails}
          </Badge>
        }
      >
        <div className="space-y-4">
          {/* Model Information */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <BrainCircuit className="h-3.5 w-3.5" />
              {template.modelInfoLabel}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-3">
                <p className="text-[11px] text-slate-500">{template.methodologyLabel}</p>
                <p className="mt-1 text-sm font-medium text-white">
                  {explanation.methodology.name}
                </p>
                <p className="mt-1 text-xs text-slate-400">{explanation.methodology.description}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-3">
                  <p className="text-[11px] text-slate-500">{template.modelVersionLabel}</p>
                  <p className="mt-1 text-sm font-medium text-white">{explanation.modelVersion}</p>
                </div>
                <div className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-3">
                  <p className="text-[11px] text-slate-500">{template.datasetVersionLabel}</p>
                  <p className="mt-1 text-sm font-medium text-white">
                    {explanation.datasetVersion}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Raw Evidence */}
          {explanation.evidence.length > 0 && (
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {template.panel.rawEvidence} ({explanation.evidence.length} items)
              </h4>
              <div className="space-y-2">
                {explanation.evidence.map((ev, i) => (
                  <div
                    key={`${ev.type}-${i}`}
                    className="rounded-lg border border-slate-800/50 bg-slate-950/50 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <Badge variant="info" size="sm">
                        {ev.type.replace(/_/g, ' ')}
                      </Badge>
                      <span className="text-[11px] text-slate-500">
                        {(ev.relevance * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="mt-2 break-all text-xs text-slate-400">{ev.content}</p>
                    {ev.metadata && (
                      <pre className="mt-2 overflow-x-auto rounded bg-slate-950 p-2 text-[10px] text-slate-500">
                        {JSON.stringify(ev.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All Signals */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {template.panel.allSignals}
            </h4>
            <div className="space-y-2">
              {result.signals.map((sig) => (
                <div
                  key={sig.name}
                  className="flex items-center justify-between rounded-lg border border-slate-800/50 bg-slate-950/50 p-3"
                >
                  <div>
                    <p className="text-xs font-medium text-white">{sig.name}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">{sig.detail}</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-slate-300">{sig.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Metadata Grid */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {template.panel.metadata}
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                {
                  icon: BrainCircuit,
                  label: template.modelInfoLabel,
                  value: result.detector?.name ?? 'VeriCorpus',
                },
                {
                  icon: Database,
                  label: template.datasetVersionLabel,
                  value: explanation.datasetVersion,
                },
                { icon: Info, label: template.panel.language, value: explanation.language },
                { icon: Info, label: template.mediaTypeLabel, value: explanation.modality },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center gap-3 rounded-lg border border-slate-800/50 bg-slate-950/50 p-3"
                >
                  <item.icon className="h-4 w-4 text-slate-500" />
                  <div>
                    <p className="text-[11px] text-slate-500">{item.label}</p>
                    <p className="text-sm font-medium text-white">{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ExplanationSection>
    </div>
  )
}
