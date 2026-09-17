import { useState } from 'react'
import { Clock, MapPin, FileText, Film, Mic, ChevronDown, ChevronRight } from 'lucide-react'
import { Card, Badge } from '../ui'
import type { EvidenceEntry } from '../../types/analysis'
import type { ExplanationTemplate } from '../../types/explainability'

interface EvidenceTimelineProps {
  entries: EvidenceEntry[]
  template: ExplanationTemplate
}

function getTypeConfig(
  template: ExplanationTemplate,
): Record<EvidenceEntry['type'], { icon: React.ElementType; label: string; color: string }> {
  return {
    region: { icon: MapPin, label: template.evidenceTimeline.region, color: 'text-purple-400' },
    temporal: { icon: Clock, label: template.evidenceTimeline.temporal, color: 'text-cyan-400' },
    passage: { icon: FileText, label: template.evidenceTimeline.passage, color: 'text-amber-400' },
    frame: { icon: Film, label: template.evidenceTimeline.frame, color: 'text-rose-400' },
    segment: { icon: Mic, label: template.evidenceTimeline.segment, color: 'text-emerald-400' },
    indicator: { icon: Clock, label: template.evidenceTimeline.indicator, color: 'text-slate-400' },
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function EvidenceTimeline({ entries, template }: EvidenceTimelineProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const typeConfig = getTypeConfig(template)

  if (entries.length === 0) {
    return (
      <Card className="text-center py-8">
        <p className="text-sm text-slate-500">{template.evidenceTimeline.noEvidence}</p>
      </Card>
    )
  }

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-800" />

      <div className="space-y-4">
        {entries.map((entry) => {
          const config = typeConfig[entry.type]
          const Icon = config.icon
          const isExpanded = expandedId === entry.id

          return (
            <div key={entry.id} className="relative pl-12">
              {/* Timeline dot */}
              <div className="absolute left-3 top-4 z-10">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 border-slate-900 bg-slate-800`}
                >
                  <Icon className={`h-2.5 w-2.5 ${config.color}`} />
                </div>
              </div>

              {/* Card */}
              <div
                className={`rounded-xl border transition-all ${
                  isExpanded
                    ? 'border-cyan-500/30 bg-cyan-500/5'
                    : 'border-slate-800/80 bg-slate-900/50 hover:border-slate-700'
                }`}
              >
                {/* Header */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className="flex w-full items-center gap-3 p-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="info" size="sm">
                        {config.label}
                      </Badge>
                      {entry.startTime != null && entry.endTime != null && (
                        <span className="text-[11px] text-slate-500 font-mono">
                          {formatTime(entry.startTime)} - {formatTime(entry.endTime)}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-white truncate">{entry.label}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{entry.description}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right">
                      <span className="text-xs font-medium text-white">
                        {(entry.confidence * 100).toFixed(0)}%
                      </span>
                      <p className="text-[10px] text-slate-600">
                        {template.evidenceTimeline.confidence}
                      </p>
                    </div>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-600" />
                    )}
                  </div>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-slate-800/50 px-4 py-3">
                    {/* Region info for images */}
                    {entry.region && (
                      <div className="mb-3 rounded-lg bg-slate-800/30 p-3">
                        <p className="text-[11px] text-slate-500 mb-1">
                          {template.evidenceTimeline.regionCoordinates}
                        </p>
                        <p className="text-xs font-mono text-slate-300">
                          x: {entry.region.x}, y: {entry.region.y}, {entry.region.width}x
                          {entry.region.height}
                        </p>
                      </div>
                    )}

                    {/* Content passage */}
                    {entry.content && (
                      <div className="rounded-lg bg-slate-800/30 p-3">
                        <p className="text-[11px] text-slate-500 mb-1">
                          {template.evidenceTimeline.evidenceContent}
                        </p>
                        <p className="text-xs text-slate-300 leading-relaxed italic">
                          "{entry.content}"
                        </p>
                      </div>
                    )}

                    {/* Confidence bar */}
                    <div className="mt-3">
                      <div className="h-1 overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-cyan-500"
                          style={{ width: `${entry.confidence * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
