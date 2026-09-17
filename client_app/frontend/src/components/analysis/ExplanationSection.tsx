import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface ExplanationSectionProps {
  title: string
  defaultOpen?: boolean
  badge?: ReactNode
  children: ReactNode
  className?: string
}

export default function ExplanationSection({
  title,
  defaultOpen = false,
  badge,
  children,
  className = '',
}: ExplanationSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className={`rounded-xl border border-slate-800/80 bg-slate-900/50 ${className}`}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-800/30"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">{title}</span>
          {badge}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>
      {isOpen && <div className="border-t border-slate-800/50 px-4 py-4">{children}</div>}
    </div>
  )
}
