interface SkeletonProps {
  className?: string
  count?: number
}

export default function Skeleton({ className = '', count = 1 }: SkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className={`animate-pulse rounded-xl bg-slate-200/50 dark:bg-slate-800/50 ${className}`}
          aria-hidden="true"
        />
      ))}
    </>
  )
}
