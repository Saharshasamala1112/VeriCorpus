interface ProgressProps {
  value: number
  max?: number
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'success' | 'warning' | 'danger'
  showLabel?: boolean
  label?: string
  className?: string
}

const sizeStyles = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
}

const variantStyles = {
  default: 'from-cyan-400 to-cyan-600',
  success: 'from-emerald-400 to-emerald-600',
  warning: 'from-amber-400 to-amber-600',
  danger: 'from-red-400 to-red-600',
}

export default function Progress({
  value,
  max = 100,
  size = 'md',
  variant = 'default',
  showLabel,
  label,
  className = '',
}: ProgressProps) {
  const percent = Math.min(100, Math.max(0, (value / max) * 100))

  return (
    <div className={className}>
      {(showLabel || label) && (
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-xs text-slate-400">{label}</span>
          {showLabel && (
            <span className="text-xs font-medium text-slate-300">{percent.toFixed(0)}%</span>
          )}
        </div>
      )}
      <div
        className={`overflow-hidden rounded-full bg-slate-800 ${sizeStyles[size]}`}
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
      >
        <div
          className={`h-full rounded-full bg-gradient-to-r transition-all duration-500 ease-out ${variantStyles[variant]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
