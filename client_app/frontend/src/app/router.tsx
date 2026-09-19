import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, Navigate, RouterProvider, useNavigate } from 'react-router-dom'
import Layout from '../components/layout/Layout'
import ProtectedRoute from '../components/ProtectedRoute'
import { ROUTES } from '../config/routes'
import { Skeleton } from '../components/ui'
import { useAuthStore } from '../store/auth'

const LoginPage = lazy(() => import('../pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('../pages/auth/ResetPasswordPage'))
const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const AnalyzePage = lazy(() => import('../pages/analysis/AnalyzePage'))
const AnalyzeMediaPage = lazy(() => import('../pages/analysis/AnalyzeMediaPage'))
const AnalysisResultPage = lazy(() => import('../pages/analysis/AnalysisResultPage'))
const VideoResultPage = lazy(() => import('../pages/analysis/VideoResultPage'))
const HistoryPage = lazy(() => import('../pages/HistoryPage'))
const DatasetsPage = lazy(() => import('../pages/training/DatasetsPage'))
const ModelsPage = lazy(() => import('../pages/training/ModelsPage'))
const SettingsPage = lazy(() => import('../pages/admin/SettingsPage'))

// MLOps
const DatasetDashboard = lazy(() => import('../pages/ml/DatasetDashboard'))
const DatasetVersionDetail = lazy(() => import('../pages/ml/DatasetVersionDetail'))
const ModelDashboard = lazy(() => import('../pages/ml/ModelDashboard'))
const ModelDetail = lazy(() => import('../pages/ml/ModelDetail'))
const TrainingDashboard = lazy(() => import('../pages/ml/TrainingDashboard'))
const ModelComparison = lazy(() => import('../pages/ml/ModelComparison'))
const AuditLogPage = lazy(() => import('../pages/ml/AuditLogPage'))

function PageLoader() {
  return (
    <div className="space-y-6 py-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  )
}

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

// Auth wrapper that redirects authenticated users away from auth pages
function AuthOnlyWrapper({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) {
      navigate(ROUTES.DASHBOARD, { replace: true })
    }
  }, [isAuthenticated, navigate])

  if (isAuthenticated) {
    return null
  }

  return <>{children}</>
}

const router = createBrowserRouter([
  // Public auth routes - redirect authenticated users to dashboard
  {
    path: ROUTES.LOGIN,
    element: (
      <AuthOnlyWrapper>
        <SuspenseWrapper>
          <LoginPage />
        </SuspenseWrapper>
      </AuthOnlyWrapper>
    ),
  },
  {
    path: ROUTES.REGISTER,
    element: (
      <AuthOnlyWrapper>
        <SuspenseWrapper>
          <RegisterPage />
        </SuspenseWrapper>
      </AuthOnlyWrapper>
    ),
  },
  {
    path: ROUTES.FORGOT_PASSWORD,
    element: (
      <AuthOnlyWrapper>
        <SuspenseWrapper>
          <ForgotPasswordPage />
        </SuspenseWrapper>
      </AuthOnlyWrapper>
    ),
  },
  {
    path: ROUTES.RESET_PASSWORD,
    element: (
      <AuthOnlyWrapper>
        <SuspenseWrapper>
          <ResetPasswordPage />
        </SuspenseWrapper>
      </AuthOnlyWrapper>
    ),
  },
  // Protected routes
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <Layout />,
        children: [
          {
            path: ROUTES.DASHBOARD,
            element: (
              <SuspenseWrapper>
                <DashboardPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ANALYZE,
            element: (
              <SuspenseWrapper>
                <AnalyzePage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ANALYZE_TEXT,
            element: (
              <SuspenseWrapper>
                <AnalyzeMediaPage mediaType="text" />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ANALYZE_IMAGE,
            element: (
              <SuspenseWrapper>
                <AnalyzeMediaPage mediaType="image" />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ANALYZE_AUDIO,
            element: (
              <SuspenseWrapper>
                <AnalyzeMediaPage mediaType="audio" />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ANALYZE_VIDEO,
            element: (
              <SuspenseWrapper>
                <AnalyzeMediaPage mediaType="video" />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ANALYZE_DOCUMENT,
            element: (
              <SuspenseWrapper>
                <AnalyzeMediaPage mediaType="document" />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.RESULT,
            element: (
              <SuspenseWrapper>
                <AnalysisResultPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.RESULT_LATEST,
            element: (
              <SuspenseWrapper>
                <AnalysisResultPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.VIDEO_RESULT,
            element: (
              <SuspenseWrapper>
                <VideoResultPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.HISTORY,
            element: (
              <SuspenseWrapper>
                <HistoryPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.DATASETS,
            element: (
              <SuspenseWrapper>
                <DatasetsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.MODELS,
            element: (
              <SuspenseWrapper>
                <ModelsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.SETTINGS,
            element: (
              <SuspenseWrapper>
                <SettingsPage />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ML_DATASETS,
            element: (
              <SuspenseWrapper>
                <DatasetDashboard />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ML_DATASET_DETAIL,
            element: (
              <SuspenseWrapper>
                <DatasetVersionDetail />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ML_MODELS,
            element: (
              <SuspenseWrapper>
                <ModelDashboard />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ML_MODEL_DETAIL,
            element: (
              <SuspenseWrapper>
                <ModelDetail />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ML_TRAINING,
            element: (
              <SuspenseWrapper>
                <TrainingDashboard />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ML_COMPARE,
            element: (
              <SuspenseWrapper>
                <ModelComparison />
              </SuspenseWrapper>
            ),
          },
          {
            path: ROUTES.ML_AUDIT_LOG,
            element: (
              <SuspenseWrapper>
                <AuditLogPage />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to={ROUTES.DASHBOARD} replace /> },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}