import {
  BrainCircuit,
  Link2,
  ShieldCheck,
  Languages,
  FileText,
  Settings,
  ChevronRight,
} from 'lucide-react'
import { Card, Badge } from '../ui'
import type { AnalysisBreakdownCard } from '../../types/analysis'
import type { ExplanationTemplate } from '../../types/explainability'

interface BreakdownCardsProps {
  cards: AnalysisBreakdownCard[]
  template: ExplanationTemplate
}

const CARD_ICONS: Record<string, React.ElementType> = {
  'ai-detection': BrainCircuit,
  similarity: Link2,
  authenticity: ShieldCheck,
  language: Languages,
  metadata: FileText,
  'model-info': Settings,
}

function getStatusConfig(
  template: ExplanationTemplate,
): Record<string, { variant: 'success' | 'warning' | 'danger' | 'info'; label: string }> {
  return {
    pass: { variant: 'success', label: template.breakdown.pass },
    warning: { variant: 'warning', label: template.breakdown.warning },
    fail: { variant: 'danger', label: template.breakdown.fail },
    info: { variant: 'info', label: template.breakdown.info },
  }
}

export default function BreakdownCards({ cards, template }: BreakdownCardsProps) {
  const statusConfig = getStatusConfig(template)
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => {
        const Icon = CARD_ICONS[card.id] || BrainCircuit
        const cardStatus = statusConfig[card.status]

        return (
          <Card key={card.id} variant="interactive" padding="sm" className="group relative">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/50 text-slate-400 group-hover:bg-cyan-400/10 group-hover:text-cyan-400 transition-colors">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-white">{card.title}</h3>
              </div>
              <Badge variant={cardStatus.variant} size="sm">
                {cardStatus.label}
              </Badge>
            </div>

            {/* Confidence bar */}
            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">{template.breakdown.confidence}</span>
                <span className="text-xs font-medium text-white">
                  {(card.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    card.status === 'pass'
                      ? 'bg-emerald-500'
                      : card.status === 'warning'
                        ? 'bg-amber-500'
                        : card.status === 'fail'
                          ? 'bg-red-500'
                          : 'bg-cyan-500'
                  }`}
                  style={{ width: `${card.confidence * 100}%` }}
                />
              </div>
            </div>

            {/* Key signal */}
            <p className="text-xs font-medium text-slate-300 mb-1">{card.keySignal}</p>

            {/* Description */}
            <p className="text-[11px] text-slate-500 line-clamp-2">{card.description}</p>

            {/* Hover arrow */}
            <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </div>
          </Card>
        )
      })}
    </div>
  )
}
