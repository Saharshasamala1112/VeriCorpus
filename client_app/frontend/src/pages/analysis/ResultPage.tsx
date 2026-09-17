import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ROUTES } from '../../config/routes'

export default function ResultPage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition hover:bg-slate-800 hover:text-white"
          aria-label="Go back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-white">Analysis Result</h1>
          <p className="text-sm text-slate-500">No result data available</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-8 text-center">
        <p className="text-sm text-slate-400 mb-4">
          No analysis result to display. Results are shown immediately after running an analysis.
        </p>
        <button
          onClick={() => navigate(ROUTES.ANALYZE)}
          className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
        >
          Start Analysis
        </button>
      </div>
    </div>
  )
}
