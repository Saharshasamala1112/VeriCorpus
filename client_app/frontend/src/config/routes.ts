export const ROUTES = {
  LOGIN: '/login',
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
