import { useNavigate } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { MEDIA_REGISTRY, type MediaType, formatFileSize } from '../../config/media-registry'
import { ROUTES } from '../../config/routes'

const routeMap: Record<MediaType, string> = {
  text: ROUTES.ANALYZE_TEXT,
  image: ROUTES.ANALYZE_IMAGE,
  audio: ROUTES.ANALYZE_AUDIO,
  video: ROUTES.ANALYZE_VIDEO,
  document: ROUTES.ANALYZE_DOCUMENT,
}

const colorAccent: Record<string, string> = {
  cyan: 'text-cyan-400',
  purple: 'text-purple-400',
  emerald: 'text-emerald-400',
  amber: 'text-amber-400',
  rose: 'text-rose-400',
}

export default function AnalyzePage() {
  const navigate = useNavigate()

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Analyze Content</h1>
        <p className="mt-1 text-sm text-slate-500">
          Select a media type to begin authenticity analysis.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(MEDIA_REGISTRY) as MediaType[]).map((type) => {
          const config = MEDIA_REGISTRY[type]
          return (
            <button
              key={type}
              onClick={() => navigate(routeMap[type])}
              className="group flex flex-col rounded-2xl border border-slate-800/80 bg-slate-900/50 p-6 text-left transition-all duration-200 hover:border-slate-700 hover:bg-slate-800/30"
            >
              <div className="mb-4 flex items-center gap-3">
                <config.icon className={`h-6 w-6 ${colorAccent[config.color]}`} />
                <h3 className="text-base font-semibold text-white">{config.label}</h3>
              </div>
              <p className="text-sm text-slate-400">{config.description}</p>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {config.acceptedFormats.map((fmt) => (
                  <span
                    key={fmt}
                    className="rounded-lg bg-slate-800/60 px-2 py-0.5 text-[11px] text-slate-500"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-600">
                <span>Max {formatFileSize(config.maxFileSize)}</span>
                <span className="flex items-center gap-1 text-slate-500 transition group-hover:text-cyan-400">
                  Start <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
