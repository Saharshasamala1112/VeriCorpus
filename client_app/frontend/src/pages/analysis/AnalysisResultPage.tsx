import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { useMemo, useState, lazy, Suspense } from 'react'
import { ArrowLeft, Share2, Eye, EyeOff } from 'lucide-react'
import HeroResult from '../../components/analysis/HeroResult'
import ExplainabilitySection from '../../components/analysis/ExplainabilitySection'
import LanguageSelector from '../../components/analysis/LanguageSelector'
import ExportMenu from '../../components/analysis/ExportMenu'
import {
  TextHighlightVisual,
  ImageVisualization,
  AudioVisualization,
  VideoVisualization,
  DocumentVisualization,
} from '../../components/analysis/visualizations'
import { useLanguageStore } from '../../store/language'
import { createLocalizedExplanation } from '../../lib/explanation-localization'
import type { AnalysisResultData } from '../../types/analysis'
import type { ExplanationResult } from '../../types/explainability'
import type { AuthenticityResult } from '../../services/authenticity.service'
import { ExplanationEngine } from '../../services/explanation.service'

// ---------------------------------------------------------------------------
// Result mapping (language-independent, machine-readable)
// ---------------------------------------------------------------------------

function mapResult(result: AuthenticityResult): AnalysisResultData {
  const confidenceLevel =
    result.confidence >= 0.9
      ? 'very_high'
      : result.confidence >= 0.75
        ? 'high'
        : result.confidence >= 0.5
          ? 'moderate'
          : 'low'
  const verdictCategory =
    result.status === 'likely_manipulated'
      ? 'likely_manipulated'
      : result.status === 'likely_authentic'
        ? 'likely_authentic'
        : 'inconclusive'

  return {
    id: result.sample_id,
    filename: result.filename,
    mediaType: result.media_type as AnalysisResultData['mediaType'],
    status: 'completed',
    timestamp: new Date().toISOString(),
    sizeBytes: result.size_bytes,
    sha256: result.sha256,
    assessment: result.verdict as AnalysisResultData['assessment'],
    verdictCategory,
    confidence: result.confidence,
    modelProbability: result.model_probability ?? result.manipulation_probability,
    calibratedConfidence: result.calibrated_probability ?? result.confidence,
    evidenceStrength: result.evidence_strength ?? null,
    confidenceLevel,
    manipulationProbability: result.manipulation_probability,
    explanation: result.explanation.primary,
    breakdownCards: result.signals.map((signal, index) => ({
      id: `${result.sample_id}-signal-${index}`,
      title: signal.name,
      status:
        signal.value.includes('AI') || signal.value.includes('likelihood') ? 'warning' : 'info',
      confidence: result.confidence,
      keySignal: signal.value,
      description: signal.detail,
    })),
    evidenceEntries: (result.plagiarism_matches ?? []).map((match, index) => ({
      id: `${result.sample_id}-match-${index}`,
      type: 'passage',
      label: match.source,
      confidence: match.confidence,
      description: `${match.match_type} similarity · ${(match.similarity_score * 100).toFixed(0)}%`,
      content: match.input_span.text,
      matchType: match.match_type,
      sourceUrl: match.source_url,
      page: match.input_span.page,
      paragraph: match.input_span.paragraph,
      sentence: match.input_span.sentence,
      startOffset: match.input_span.start_offset,
      endOffset: match.input_span.end_offset,
    })),
    supportingSignals: result.signals.map((signal) => ({
      ...signal,
      severity: 'supporting' as const,
    })),
    counterSignals: [],
    modelInfo: {
      name: result.learning.model_prediction?.model || result.detector.name,
      version: 'runtime',
      datasetVersion: result.learning.status.last_run?.completed_at || 'unknown',
      analysisTimestamp: new Date().toISOString(),
      methodology: {
        name: 'Evidence-led authenticity analysis',
        description: 'Model output and supporting signals from the live backend analysis.',
        version: 'runtime',
      },
    },
    limitations: result.limitations,
    language: result.explanation.language,
  }
}

// ---------------------------------------------------------------------------
// Collapsible Section wrapper
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  icon?: React.ReactNode
  badge?: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}

function Section({ title, icon, badge, defaultOpen = false, children }: SectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <section
      className="rounded-xl border border-slate-800/80 bg-slate-900/50 overflow-hidden"
      aria-label={title}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-800/30"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5">
          {icon}
          <h2 className="text-sm font-semibold text-white">{title}</h2>
          {badge}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && <div className="border-t border-slate-800/50 px-5 py-5">{children}</div>}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Modality-specific visualization dispatcher
// ---------------------------------------------------------------------------

function ModalityVisualization({
  explanation,
  result,
  language,
}: {
  explanation: ExplanationResult
  result: AnalysisResultData
  language: string
}) {
  switch (result.mediaType) {
    case 'text':
      return <TextHighlightVisual evidence={explanation.evidence} language={language} />
    case 'image':
      return <ImageVisualization evidence={explanation.evidence} language={language} />
    case 'audio':
      return <AudioVisualization evidence={explanation.evidence} language={language} />
    case 'video':
      return <VideoVisualization evidence={explanation.evidence} language={language} />
    case 'document':
      return <DocumentVisualization evidence={explanation.evidence} language={language} />
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

const VideoResultPage = lazy(() => import('./VideoResultPage'))

export default function AnalysisResultPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const { language, setLanguage } = useLanguageStore()
  const { template } = useMemo(() => createLocalizedExplanation(language), [language])
  const liveResult = (location.state as { result?: AuthenticityResult } | null)?.result
  const [showAccessible, setShowAccessible] = useState(false)

  // Detect video modality from URL path - only use VideoResultPage for the dedicated video route
  const isVideoRoute = location.pathname.includes('/result/video/')

  // For video results on the dedicated video route, render the dedicated VideoResultPage
  if (isVideoRoute) {
    return (
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="h-8 w-48 bg-slate-800 rounded animate-pulse" />
            <div className="h-64 bg-slate-800 rounded-xl animate-pulse" />
          </div>
        }
      >
        <VideoResultPage />
      </Suspense>
    )
  }

  if (!liveResult) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-white">{template.page.noResult}</h1>
        <p className="text-sm text-slate-400">{template.page.noResultDescription}</p>
        <button className="text-sm text-cyan-400" onClick={() => navigate('/analyze')}>
          {template.page.startAnalysis}
        </button>
      </div>
    )
  }

  const result = mapResult(liveResult)
  const explanation = ExplanationEngine.explain(liveResult)

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `VeriCorpus Analysis: ${result.filename}`,
        text: `${result.assessment} (${(result.confidence * 100).toFixed(0)}% confidence)`,
        url: window.location.href,
      })
    }
  }

  return (
    <div className="space-y-5" role="main" aria-label="Analysis result">
      {/* ─── Top Bar ─── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Go back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">{template.page.analysisResult}</h1>
            <p className="text-sm text-slate-500">{result.filename}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAccessible(!showAccessible)}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 text-slate-400 transition hover:border-cyan-400/30 hover:text-white"
            aria-label={showAccessible ? 'Hide accessible view' : 'Show accessible view'}
            title={showAccessible ? 'Hide accessible view' : 'Show accessible view'}
          >
            {showAccessible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
          <LanguageSelector value={language} onChange={setLanguage} />
          <ExportMenu result={result} template={template} />
          <button
            onClick={handleShare}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/70 text-slate-400 transition hover:border-cyan-400/30 hover:text-white"
            aria-label="Share"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ─── 1. Hero Result (confidence metrics) ─── */}
      <HeroResult
        assessment={result.assessment}
        verdictCategory={result.verdictCategory}
        confidence={result.confidence}
        modelProbability={result.modelProbability}
        calibratedConfidence={result.calibratedConfidence}
        evidenceStrength={result.evidenceStrength}
        confidenceLevel={result.confidenceLevel}
        manipulationProbability={result.manipulationProbability}
        explanation={result.explanation}
        status={result.status}
        filename={result.filename}
        mediaType={result.mediaType}
        timestamp={result.timestamp}
        template={template}
      />

      {/* ─── 2. Affected Areas — Modality-specific visualization ─── */}
      {explanation.evidence.length > 0 && (
        <section aria-label="Affected areas visualization" className="space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-semibold text-white">Affected Areas</h2>
            <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-300">
              {result.mediaType}
            </span>
          </div>
          <ModalityVisualization explanation={explanation} result={result} language={language} />
        </section>
      )}

      {/* ─── 3. Explanation — Why this assessment ─── */}
      <ExplainabilitySection
        explanation={result.explanation}
        supportingSignals={result.supportingSignals}
        counterSignals={result.counterSignals}
        limitations={result.limitations}
        template={template}
      />
    </div>
  )
}
