import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type { DriftSnapshot, DriftMetric, DriftSeverity } from '../../types/lifelong-learning'

interface DriftMonitorProps {
  snapshots: DriftSnapshot[]
  alerts: DriftSnapshot[]
}

const SEVERITY_CONFIG: Record<
  DriftSeverity,
  { variant: 'success' | 'warning' | 'danger' | 'info' | 'default'; label: string }
> = {
  none: { variant: 'success', label: 'None' },
  low: { variant: 'success', label: 'Low' },
  medium: { variant: 'warning', label: 'Medium' },
  high: { variant: 'danger', label: 'High' },
  critical: { variant: 'danger', label: 'Critical' },
}

function DriftBar({ metric }: { metric: DriftMetric }) {
  const percentage = Math.min(metric.driftScore * 100, 100)
  const severity = metric.severity

  const barColor =
    severity === 'none' || severity === 'low'
      ? 'bg-emerald-400'
      : severity === 'medium'
        ? 'bg-amber-400'
        : 'bg-red-400'

  return (
    <div className="flex items-center gap-2">
      <span className="w-24 truncate text-[11px] text-slate-400">{metric.metric}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-12 text-right text-[10px] text-slate-500">
        {(metric.driftScore * 100).toFixed(1)}%
      </span>
    </div>
  )
}

export default function DriftMonitor({ snapshots, alerts }: DriftMonitorProps) {
  const latestSnapshot = snapshots.length > 0 ? snapshots[0] : null

  return (
    <Card padding="md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Drift Monitoring</h3>
        {alerts.length > 0 && (
          <Badge variant="danger" size="sm">
            {alerts.length} alert{alerts.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {latestSnapshot && (
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Latest snapshot ({new Date(latestSnapshot.createdAt).toLocaleDateString()})
            </span>
            <Badge variant={SEVERITY_CONFIG[latestSnapshot.overallSeverity].variant}>
              {SEVERITY_CONFIG[latestSnapshot.overallSeverity].label}
            </Badge>
          </div>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[11px] text-slate-500">Overall drift:</span>
            <span className="text-xs font-medium text-slate-300">
              {(latestSnapshot.overallDriftScore * 100).toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-500">
              ({latestSnapshot.sampleCount.toLocaleString()} samples)
            </span>
          </div>
          <div className="space-y-1.5">
            {latestSnapshot.metrics.slice(0, 6).map((m) => (
              <DriftBar key={m.metric} metric={m} />
            ))}
          </div>
        </div>
      )}

      {!latestSnapshot && (
        <p className="mb-4 text-center text-xs text-slate-500">No drift data available</p>
      )}

      {alerts.length > 0 && (
        <>
          <h4 className="mb-2 text-xs font-semibold text-slate-400">Active Alerts</h4>
          <div className="space-y-1.5">
            {alerts.slice(0, 5).map((alert) => (
              <div
                key={alert.id}
                className="rounded-lg border border-red-500/20 bg-red-500/5 px-2.5 py-2"
              >
                <div className="flex items-center justify-between">
                  <Badge variant="danger" size="sm">
                    {alert.overallSeverity}
                  </Badge>
                  <span className="text-[10px] text-slate-500">
                    {new Date(alert.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1.5 space-y-1">
                  {alert.metrics
                    .filter((m) => m.severity === 'high' || m.severity === 'critical')
                    .slice(0, 3)
                    .map((m) => (
                      <p key={m.metric} className="text-[11px] text-red-300/70">
                        {m.metric}: {(m.driftScore * 100).toFixed(1)}% drift
                      </p>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {snapshots.length > 1 && (
        <>
          <h4 className="mt-3 mb-2 text-xs font-semibold text-slate-400">History</h4>
          <div className="space-y-1">
            {snapshots.slice(1, 6).map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-lg border border-slate-800/40 bg-slate-900/20 px-2.5 py-1.5"
              >
                <span className="text-[11px] text-slate-400">
                  {new Date(s.createdAt).toLocaleDateString()}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">
                    {(s.overallDriftScore * 100).toFixed(1)}%
                  </span>
                  <Badge variant={SEVERITY_CONFIG[s.overallSeverity].variant} size="sm">
                    {SEVERITY_CONFIG[s.overallSeverity].label}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}
