import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

interface AuthGuardProps {
  requiredRoles?: string[]
}

export default function AuthGuard({ requiredRoles }: AuthGuardProps) {
  const location = useLocation()
  const { isAuthenticated, isLoading, restoreSession, user } = useAuthStore()

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      restoreSession()
    }
  }, [isAuthenticated, isLoading, restoreSession])

  // Still loading - show nothing (or a loader)
  if (isLoading) {
    return null
  }

  // Not authenticated - redirect to login
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  // Check role authorization if required
  if (requiredRoles && requiredRoles.length > 0) {
    const userRoles = user?.roles || []
    const hasRole = requiredRoles.some((role) => userRoles.includes(role))
    if (!hasRole) {
      return <Navigate to="/dashboard" replace />
    }
  }

  return <Outlet />
}