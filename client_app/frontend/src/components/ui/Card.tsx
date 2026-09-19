import { forwardRef, type HTMLAttributes } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'interactive' | 'highlighted'
  padding?: 'none' | 'sm' | 'md' | 'lg'
}

const variantStyles = {
  default: 'border-slate-200 bg-white/50 dark:border-slate-800/80 dark:bg-slate-900/50',
  interactive:
    'border-slate-200 bg-white/50 hover:border-cyan-400/20 hover:bg-slate-50 cursor-pointer transition-all duration-200 dark:border-slate-800/80 dark:bg-slate-900/50 dark:hover:border-cyan-400/20 dark:hover:bg-slate-800/50',
  highlighted: 'border-cyan-400/30 bg-cyan-50 dark:border-cyan-400/20 dark:bg-cyan-400/5',
}

const paddingStyles = {
  none: '',
  sm: 'p-4',
  md: 'p-5 sm:p-6',
  lg: 'p-6 sm:p-8',
}

const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', className = '', children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`rounded-2xl border ${variantStyles[variant]} ${paddingStyles[padding]} ${className}`}
        {...props}
      >
        {children}
      </div>
    )
  },
)
Card.displayName = 'Card'

export default Card
