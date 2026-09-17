import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
  icon?: React.ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, icon, className = '', id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-slate-300">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full rounded-xl border bg-slate-900/70 px-4 py-2.5 text-sm text-white placeholder-slate-500 transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-offset-0 ${
              icon ? 'pl-10' : ''
            } ${
              error
                ? 'border-red-500/50 focus:border-red-400/60 focus:ring-red-400/20'
                : 'border-slate-800 focus:border-cyan-400/60 focus:ring-cyan-400/20'
            } ${className}`}
            aria-invalid={error ? 'true' : undefined}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-400" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-xs text-slate-500">
            {hint}
          </p>
        )}
      </div>
    )
  },
)
Input.displayName = 'Input'

export default Input
