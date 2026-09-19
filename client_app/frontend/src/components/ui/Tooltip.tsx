import { useState, useRef, type ReactNode } from 'react'

interface TooltipProps {
  content: string
  children: ReactNode
  side?: 'top' | 'bottom'
  className?: string
}

export default function Tooltip({ content, children, side = 'top', className = '' }: TooltipProps) {
  const [show, setShow] = useState(false)
  const timeoutRef = useRef<number | null>(null)

  const handleEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    setShow(true)
  }
  const handleLeave = () => {
    timeoutRef.current = window.setTimeout(() => setShow(false), 150)
  }

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
    >
      {children}
      {show && (
        <div
          role="tooltip"
          className={`absolute z-50 whitespace-nowrap rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs text-white shadow-lg dark:bg-slate-800 ${
            side === 'top'
              ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
              : 'top-full mt-2 left-1/2 -translate-x-1/2'
          }`}
        >
          {content}
        </div>
      )}
    </div>
  )
}
