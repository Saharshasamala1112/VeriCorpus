import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, FileText, Clipboard } from 'lucide-react'
import { Card, Button } from '../../components/ui'
import MediaUploader from '../../components/analysis/MediaUploader'
import PipelineVisual from '../../components/analysis/PipelineVisual'
import { getMediaConfig, type MediaType } from '../../config/media-registry'
import { ROUTES } from '../../config/routes'
import { authenticityService } from '../../services/authenticity.service'
import { useLanguageStore } from '../../store/language'

interface AnalyzeMediaPageProps {
  mediaType: MediaType
}

const PIPELINE_STEPS = [
  { label: 'Input', description: 'File received' },
  { label: 'Preprocessing', description: 'Cleaning & normalization' },
  { label: 'Features', description: 'Feature extraction' },
  { label: 'Analysis', description: 'Model inference' },
  { label: 'Verification', description: 'Cross-validation' },
  { label: 'Explanation', description: 'Generating report' },
  { label: 'Result', description: 'Final assessment' },
]

export default function AnalyzeMediaPage({ mediaType }: AnalyzeMediaPageProps) {
  const config = getMediaConfig(mediaType)
  const navigate = useNavigate()
  const { language } = useLanguageStore()
  const [pipelineStep, setPipelineStep] = useState(-1)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [textInput, setTextInput] = useState('')
  const [inputMode, setInputMode] = useState<'upload' | 'paste'>(
    mediaType === 'text' ? 'paste' : 'upload',
  )
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  const runAnalysis = (promise: Promise<unknown>) => {
    setError(null)
    setAnalyzing(true)
    setPipelineStep(0)
    let step = 0
    const advance = () => {
      step++
      setPipelineStep(step)
      if (step < PIPELINE_STEPS.length - 1) {
        timerRef.current = window.setTimeout(advance, 900 + Math.random() * 600)
      } else {
        void promise
          .then((result) => {
            setAnalyzing(false)
            navigate('/result/latest', { state: { result } })
          })
          .catch((analysisError: unknown) => {
            setAnalyzing(false)
            setError(
              analysisError instanceof Error
                ? analysisError.message
                : 'Analysis failed. Please try again.',
            )
          })
      }
    }
    timerRef.current = window.setTimeout(advance, 1200)
  }

  const handleFilesReady = async (files: File[]) => {
    const file = files[0]
    if (!file) return
    runAnalysis(authenticityService.analyze({ file, language }))
  }

  const handleTextSubmit = () => {
    if (!textInput.trim()) return
    runAnalysis(authenticityService.analyze({ text: textInput, language }))
  }

  const steps = PIPELINE_STEPS.map((s, i) => ({
    ...s,
    status:
      i < pipelineStep
        ? ('complete' as const)
        : i === pipelineStep
          ? ('active' as const)
          : ('pending' as const),
  }))

  const canPaste = mediaType === 'text' || mediaType === 'document'

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(ROUTES.ANALYZE)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 dark:text-slate-400 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
          aria-label="Back to analyze"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{config.label}</h1>
          <p className="text-sm text-slate-500">{config.description}</p>
        </div>
      </div>

      {analyzing && (
        <Card>
          <PipelineVisual steps={steps} />
        </Card>
      )}

      {error && (
        <Card>
          <p className="text-sm text-red-400">{error}</p>
        </Card>
      )}

      {!analyzing && (
        <>
          {canPaste && (
            <div className="flex gap-2">
              <button
                onClick={() => setInputMode('paste')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  inputMode === 'paste'
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Clipboard className="h-3.5 w-3.5" /> Paste text
              </button>
              <button
                onClick={() => setInputMode('upload')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  inputMode === 'upload'
                    ? 'bg-cyan-400 text-slate-950'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <FileText className="h-3.5 w-3.5" /> Upload file
              </button>
            </div>
          )}

          {inputMode === 'paste' && canPaste ? (
            <Card>
              <div className="space-y-4">
                <textarea
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  placeholder="Paste or type text to analyze..."
                  rows={12}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 p-4 text-sm text-slate-900 dark:text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-400/40 resize-y"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {textInput.length > 0
                      ? `${textInput.split(/\s+/).filter(Boolean).length} words`
                      : 'Enter text to analyze'}
                  </span>
                  <Button onClick={handleTextSubmit} disabled={!textInput.trim()}>
                    Analyze text
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <MediaUploader config={config} onFilesReady={handleFilesReady} />
            </Card>
          )}
        </>
      )}
    </div>
  )
}
