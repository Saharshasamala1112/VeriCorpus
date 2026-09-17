import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type { DatasetVersionRecord } from '../../types/lifelong-learning'

interface DatasetVersionManagerProps {
  versions: DatasetVersionRecord[]
  currentVersion?: string
  onSelectVersion?: (versionId: string) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DatasetVersionManager({
  versions,
  currentVersion,
  onSelectVersion,
}: DatasetVersionManagerProps) {
  return (
    <Card padding="md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Dataset Versions</h3>
        <Badge variant="info" size="sm">
          {versions.length} versions
        </Badge>
      </div>

      <div className="space-y-2">
        {versions.length === 0 && (
          <p className="text-center text-xs text-slate-500">No dataset versions found</p>
        )}

        {versions.map((v) => {
          const isCurrent = v.version === currentVersion
          return (
            <div
              key={v.id}
              onClick={() => onSelectVersion?.(v.id)}
              className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-colors ${
                isCurrent
                  ? 'border-cyan-500/30 bg-cyan-500/5'
                  : 'border-slate-800/60 bg-slate-900/30 hover:border-slate-700'
              } ${onSelectVersion ? 'cursor-pointer' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-slate-300">
                  {v.version}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-200">
                      {v.sampleCount.toLocaleString()} samples
                    </span>
                    {isCurrent && (
                      <Badge variant="info" size="sm">
                        Current
                      </Badge>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500">{formatDate(v.createdAt)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    v.validationStatus === 'passed'
                      ? 'success'
                      : v.validationStatus === 'failed'
                        ? 'danger'
                        : 'warning'
                  }
                  size="sm"
                >
                  {v.validationStatus}
                </Badge>
                <Badge
                  variant={
                    v.annotationStatus === 'complete'
                      ? 'success'
                      : v.annotationStatus === 'in_progress'
                        ? 'warning'
                        : 'default'
                  }
                  size="sm"
                >
                  {v.annotationStatus}
                </Badge>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
