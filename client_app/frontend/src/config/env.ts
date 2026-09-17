const backendOrigin = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')

export function apiUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  const normalizedPath = `/${path.replace(/^\/+/, '')}`.replace(/^\/api(?=\/)/, '')
  const versionedPath = normalizedPath.startsWith('/api/v1/')
    ? normalizedPath
    : normalizedPath.startsWith('/v1/')
      ? `/api${normalizedPath}`
      : /^\/(mlops|datasets|models)(\/|$)/.test(normalizedPath)
        ? `/api/v1${normalizedPath}`
        : normalizedPath

  if (backendOrigin) return `${backendOrigin}${versionedPath}`
  return versionedPath.startsWith('/api/v1/') ? versionedPath : `/api${versionedPath}`
}

export const API_BASE_URL = backendOrigin || '/api'

export const env = {
  API_BASE_URL: backendOrigin || '/api',
  APP_NAME: 'VeriCorpus AI',
  APP_VERSION: '1.0.0',
}
