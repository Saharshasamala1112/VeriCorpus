import { Shield, AlertTriangle } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import type { MLOpsRole } from '../../types/mlops'

interface AuthGateProps {
  allowedRoles: MLOpsRole[]
  children: React.ReactNode
  fallback?: React.ReactNode
}

function hasRequiredRole(userRoles: string[], allowedRoles: MLOpsRole[]): boolean {
  return userRoles.some((role) => allowedRoles.includes(role as MLOpsRole))
}

export default function AuthGate({ allowedRoles, children, fallback }: AuthGateProps) {
  const user = useAuthStore((s) => s.user)

  if (!user || !hasRequiredRole(user.roles, allowedRoles)) {
    if (fallback) return <>{fallback}</>

    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-500/20 bg-amber-500/5 p-12 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">Access Restricted</h3>
        <p className="mt-2 max-w-sm text-sm text-slate-400">
          This area is restricted to authorized users such as reviewers, ML engineers, and
          administrators.
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <Shield className="h-3.5 w-3.5" />
          <span>Required roles: {allowedRoles.join(', ')}</span>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export function useIsAuthorized(allowedRoles: MLOpsRole[]): boolean {
  const user = useAuthStore((s) => s.user)
  if (!user) return false
  return hasRequiredRole(user.roles, allowedRoles)
}
