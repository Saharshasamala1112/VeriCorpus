import { useState } from 'react'
import { Download, FileJson, FileText, Table, ChevronDown } from 'lucide-react'
import type { AnalysisResultData } from '../../types/analysis'
import type { ExplanationTemplate } from '../../types/explainability'

interface ExportMenuProps {
  result: AnalysisResultData
  template: ExplanationTemplate
}

type ExportFormat = 'json' | 'pdf' | 'csv'

interface ExportOption {
  format: ExportFormat
  label: string
  description: string
  icon: React.ElementType
  available: boolean
}

function getExportOptions(template: ExplanationTemplate): ExportOption[] {
  return [
    {
      format: 'json',
      label: 'JSON',
      description: template.exportMenu.jsonDescription,
      icon: FileJson,
      available: true,
    },
    {
      format: 'pdf',
      label: 'PDF Report',
      description: template.exportMenu.pdfDescription,
      icon: FileText,
      available: false,
    },
    {
      format: 'csv',
      label: 'CSV',
      description: template.exportMenu.csvDescription,
      icon: Table,
      available: false,
    },
  ]
}

function exportToJson(result: AnalysisResultData): void {
  const data = {
    id: result.id,
    filename: result.filename,
    mediaType: result.mediaType,
    status: result.status,
    timestamp: result.timestamp,
    assessment: result.assessment,
    confidence: result.confidence,
    manipulationProbability: result.manipulationProbability,
    explanation: result.explanation,
    breakdownCards: result.breakdownCards,
    evidenceEntries: result.evidenceEntries,
    supportingSignals: result.supportingSignals,
    counterSignals: result.counterSignals,
    modelInfo: result.modelInfo,
    limitations: result.limitations,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `vericorpus-analysis-${result.id}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function ExportMenu({ result, template }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const exportOptions = getExportOptions(template)

  const handleExport = (format: ExportFormat) => {
    switch (format) {
      case 'json':
        exportToJson(result)
        break
      case 'pdf':
      case 'csv':
        // Architecture ready, implementation pending
        break
    }
    setIsOpen(false)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm text-slate-300 transition-all hover:border-cyan-400/30 hover:text-white focus:outline-none focus:ring-1 focus:ring-cyan-400/40"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">{template.exportMenu.export}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Menu */}
          <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-slate-800 bg-slate-900 py-1 shadow-xl">
            <div className="px-3 py-2 border-b border-slate-800/50">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                {template.exportMenu.exportFormat}
              </p>
            </div>
            {exportOptions.map((option) => {
              const Icon = option.icon
              return (
                <button
                  key={option.format}
                  onClick={() => option.available && handleExport(option.format)}
                  disabled={!option.available}
                  className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                    option.available
                      ? 'hover:bg-slate-800 text-slate-300'
                      : 'cursor-not-allowed text-slate-600'
                  }`}
                >
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/50">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{option.label}</p>
                    <p className="text-[11px] text-slate-500 truncate">{option.description}</p>
                  </div>
                  {!option.available && (
                    <span className="text-[10px] text-slate-600">{template.exportMenu.soon}</span>
                  )}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
