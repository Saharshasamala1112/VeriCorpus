export const ROUTES = {
  // Auth routes
  LOGIN: '/login',
  REGISTER: '/register',
  FORGOT_PASSWORD: '/forgot-password',
  RESET_PASSWORD: '/reset-password/:token',

  // Protected app routes
  DASHBOARD: '/dashboard',
  ANALYZE: '/analyze',
  ANALYZE_TEXT: '/analyze/text',
  ANALYZE_IMAGE: '/analyze/image',
  ANALYZE_AUDIO: '/analyze/audio',
  ANALYZE_VIDEO: '/analyze/video',
  ANALYZE_DOCUMENT: '/analyze/document',
  RESULT: '/result/:id',
  RESULT_LATEST: '/result/latest',
  VIDEO_RESULT: '/result/video/:id',
  HISTORY: '/history',
  DATASETS: '/datasets',
  MODELS: '/models',
  SETTINGS: '/settings',

  // MLOps
  ML_DATASETS: '/ml/datasets',
  ML_DATASET_DETAIL: '/ml/datasets/:id',
  ML_MODELS: '/ml/models',
  ML_MODEL_DETAIL: '/ml/models/:id',
  ML_TRAINING: '/ml/training',
  ML_COMPARE: '/ml/compare',
  ML_AUDIT_LOG: '/ml/audit-log',
} as const

export type RouteKey = keyof typeof ROUTES
export type RoutePath = (typeof ROUTES)[RouteKey]

// Helper to get all protected routes
export const PROTECTED_ROUTES = [
  ROUTES.DASHBOARD,
  ROUTES.ANALYZE,
  ROUTES.ANALYZE_TEXT,
  ROUTES.ANALYZE_IMAGE,
  ROUTES.ANALYZE_AUDIO,
  ROUTES.ANALYZE_VIDEO,
  ROUTES.ANALYZE_DOCUMENT,
  ROUTES.RESULT,
  ROUTES.RESULT_LATEST,
  ROUTES.VIDEO_RESULT,
  ROUTES.HISTORY,
  ROUTES.DATASETS,
  ROUTES.MODELS,
  ROUTES.SETTINGS,
  ROUTES.ML_DATASETS,
  ROUTES.ML_DATASET_DETAIL,
  ROUTES.ML_MODELS,
  ROUTES.ML_MODEL_DETAIL,
  ROUTES.ML_TRAINING,
  ROUTES.ML_COMPARE,
  ROUTES.ML_AUDIT_LOG,
] as const

// Helper to get all public auth routes
export const PUBLIC_AUTH_ROUTES = [
  ROUTES.LOGIN,
  ROUTES.REGISTER,
  ROUTES.FORGOT_PASSWORD,
  ROUTES.RESET_PASSWORD,
] as const