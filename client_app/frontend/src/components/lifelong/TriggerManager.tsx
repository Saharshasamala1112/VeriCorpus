import { useState } from 'react'
import Card from '../ui/Card'
import Badge from '../ui/Badge'
import type { TrainingTrigger, TriggerType } from '../../types/lifelong-learning'
import { TRIGGER_TYPE_LABELS } from '../../types/lifelong-learning'

interface TriggerManagerProps {
  triggers: TrainingTrigger[]
  onCreateTrigger?: (params: {
    type: TriggerType
    name: string
    description: string
    config: Record<string, unknown>
    cooldownMinutes: number
  }) => void
  onToggleTrigger?: (triggerId: string, active: boolean) => void
  onEvaluateTrigger?: (triggerId: string) => void
  loading?: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return 'Never'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const TRIGGER_ICONS: Record<TriggerType, string> = {
  scheduled: '⏰',
  new_data_threshold: '📥',
  dataset_version: '📦',
  significant_growth: '📈',
  drift_detection: '📊',
  feedback_threshold: '💬',
  manual: '🖐️',
}

export default function TriggerManager({
  triggers,
  onCreateTrigger,
  onToggleTrigger,
  onEvaluateTrigger,
  loading,
}: TriggerManagerProps) {
  const [showCreate, setShowCreate] = useState(false)
  const [newType, setNewType] = useState<TriggerType>('scheduled')
  const [newName, setNewName] = useState('')
  const [newCooldown, setNewCooldown] = useState(60)

  const handleCreate = () => {
    if (!newName.trim()) return
    onCreateTrigger?.({
      type: newType,
      name: newName,
      description: '',
      config: {},
      cooldownMinutes: newCooldown,
    })
    setNewName('')
    setShowCreate(false)
  }

  return (
    <Card padding="md">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Training Triggers</h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-400 border border-cyan-500/20 transition-colors hover:bg-cyan-500/20"
        >
          {showCreate ? 'Cancel' : '+ New Trigger'}
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 space-y-2 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value as TriggerType)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200"
          >
            {Object.entries(TRIGGER_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Trigger name"
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500"
          />
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-slate-400">Cooldown (min):</label>
            <input
              type="number"
              value={newCooldown}
              onChange={(e) => setNewCooldown(Number(e.target.value))}
              className="w-20 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-200"
              min={0}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || loading}
            className="w-full rounded-lg bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-400 border border-emerald-500/20 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
          >
            Create Trigger
          </button>
        </div>
      )}

      <div className="space-y-2">
        {triggers.length === 0 && (
          <p className="text-center text-xs text-slate-500">No triggers configured</p>
        )}

        {triggers.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between rounded-xl border border-slate-800/60 bg-slate-900/30 px-3 py-2.5"
          >
            <div className="flex items-center gap-3">
              <span className="text-base">{TRIGGER_ICONS[t.type]}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-200">{t.name}</span>
                  <Badge
                    variant={
                      t.status === 'active'
                        ? 'success'
                        : t.status === 'fired'
                          ? 'info'
                          : t.status === 'cooldown'
                            ? 'warning'
                            : 'default'
                    }
                    size="sm"
                  >
                    {t.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <span>{TRIGGER_TYPE_LABELS[t.type]}</span>
                  <span>·</span>
                  <span>Fired {t.firedCount}×</span>
                  <span>·</span>
                  <span>Last: {formatDate(t.lastFiredAt)}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {onEvaluateTrigger && (
                <button
                  onClick={() => onEvaluateTrigger(t.id)}
                  disabled={loading}
                  className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-300 disabled:opacity-50"
                >
                  Evaluate
                </button>
              )}
              {onToggleTrigger && (
                <button
                  onClick={() => onToggleTrigger(t.id, t.status !== 'active')}
                  disabled={loading}
                  className={`rounded-lg px-2 py-1 text-[10px] transition-colors disabled:opacity-50 ${
                    t.status === 'active'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                  }`}
                >
                  {t.status === 'active' ? 'Pause' : 'Enable'}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}
