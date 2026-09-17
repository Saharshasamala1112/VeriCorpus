type Status = 'online' | 'offline' | 'loading' | 'warning'

interface StatusIndicatorProps {
  status: Status
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

const statusConfig: Record<Status, { color: string; pulse: string; label: string }> = {
  online: { color: 'bg-emerald-400', pulse: 'bg-emerald-400', label: 'Operational' },
  offline: { color: 'bg-red-400', pulse: 'bg-red-400', label: 'Unavailable' },
  loading: { color: 'bg-amber-400', pulse: 'bg-amber-400', label: 'Checking' },
  warning: { color: 'bg-amber-400', pulse: 'bg-amber-400', label: 'Degraded' },
}

const sizeStyles = {
  sm: 'h-1.5 w-1.5',
  md: 'h-2 w-2',
}

export default function StatusIndicator({
  status,
  label,
  size = 'md',
  className = '',
}: StatusIndicatorProps) {
  const config = statusConfig[status]
  const displayLabel = label || config.label

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-slate-400 ${className}`}>
      <span className="relative flex">
        <span className={`rounded-full ${config.color} ${sizeStyles[size]}`} />
        {status === 'loading' && (
          <span
            className={`absolute inset-0 rounded-full ${config.pulse} ${sizeStyles[size]} animate-ping opacity-75`}
          />
        )}
      </span>
      {displayLabel}
    </span>
  )
}
