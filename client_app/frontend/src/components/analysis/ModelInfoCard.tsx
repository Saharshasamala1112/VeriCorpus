import { BrainCircuit, Database, Clock, Beaker } from 'lucide-react'
import { Card } from '../ui'
import type { ModelInformation } from '../../types/analysis'
import type { ExplanationTemplate } from '../../types/explainability'

interface ModelInfoCardProps {
  modelInfo: ModelInformation
  template: ExplanationTemplate
}

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function ModelInfoCard({ modelInfo, template }: ModelInfoCardProps) {
  return (
    <Card>
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
        <BrainCircuit className="h-4 w-4 text-purple-400" />
        {template.modelInfoLabel}
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800/50 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Beaker className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">
              {template.modelInfo.model}
            </span>
          </div>
          <p className="text-sm font-semibold text-white">{modelInfo.name}</p>
          <p className="text-xs text-slate-400 mt-0.5">{modelInfo.methodology.name}</p>
        </div>

        <div className="rounded-xl border border-slate-800/50 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <BrainCircuit className="h-3.5 w-3.5 text-purple-400" />
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">
              {template.modelInfo.version}
            </span>
          </div>
          <p className="text-sm font-semibold text-white">{modelInfo.version}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {template.modelInfo.analysisEngineVersion}
          </p>
        </div>

        <div className="rounded-xl border border-slate-800/50 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Database className="h-3.5 w-3.5 text-emerald-400" />
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">
              {template.modelInfo.datasetVersion}
            </span>
          </div>
          <p className="text-sm font-semibold text-white">{modelInfo.datasetVersion}</p>
        </div>

        <div className="rounded-xl border border-slate-800/50 bg-slate-950/50 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-3.5 w-3.5 text-amber-400" />
            <span className="text-[11px] text-slate-500 uppercase tracking-wider">
              {template.modelInfo.analysisTimestamp}
            </span>
          </div>
          <p className="text-sm font-semibold text-white">
            {formatTimestamp(modelInfo.analysisTimestamp)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {template.modelInfo.whenAnalysisPerformed}
          </p>
        </div>
      </div>

      {/* Methodology */}
      <div className="mt-4 rounded-xl border border-slate-800/50 bg-slate-950/50 p-4">
        <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">
          {template.modelInfo.methodology}
        </p>
        <p className="text-sm text-white">{modelInfo.methodology.description}</p>
      </div>
    </Card>
  )
}
