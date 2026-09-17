import { Check, Loader2 } from 'lucide-react'

interface PipelineStep {
  label: string
  description: string
  status: 'pending' | 'active' | 'complete'
}

interface PipelineVisualProps {
  steps: PipelineStep[]
  className?: string
}

export default function PipelineVisual({ steps, className = '' }: PipelineVisualProps) {
  return (
    <div
      className={`flex items-center gap-2 overflow-x-auto pb-2 ${className}`}
      role="list"
      aria-label="Processing pipeline"
    >
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <div
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
              step.status === 'complete'
                ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                : step.status === 'active'
                  ? 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300'
                  : 'border-slate-800 bg-slate-900/50 text-slate-500'
            }`}
            role="listitem"
            aria-current={step.status === 'active' ? 'step' : undefined}
          >
            {step.status === 'complete' ? (
              <Check className="h-3.5 w-3.5" />
            ) : step.status === 'active' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-slate-700 text-[9px]">
                {i + 1}
              </span>
            )}
            <span className="hidden sm:inline">{step.label}</span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`mx-1 h-px w-4 ${step.status === 'complete' ? 'bg-emerald-500/30' : 'bg-slate-800'}`}
            />
          )}
        </div>
      ))}
    </div>
  )
}
