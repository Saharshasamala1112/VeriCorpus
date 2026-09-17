import { afterEach, describe, expect, it, vi } from 'vitest'

async function loadApiUrl(origin: string) {
  vi.resetModules()
  vi.stubEnv('VITE_API_BASE_URL', origin)
  return (await import('../config/env')).apiUrl
}

afterEach(() => vi.unstubAllEnvs())

describe('API routing', () => {
  it('routes legacy and versioned requests through the development proxy', async () => {
    const apiUrl = await loadApiUrl('')
    expect(apiUrl('/auth/login')).toBe('/api/auth/login')
    expect(apiUrl('/v1/auth/refresh')).toBe('/api/v1/auth/refresh')
    expect(apiUrl('/api/v1/analysis-v2/job')).toBe('/api/v1/analysis-v2/job')
    expect(apiUrl('/mlops/jobs')).toBe('/api/v1/mlops/jobs')
    expect(apiUrl('/datasets/1')).toBe('/api/v1/datasets/1')
    expect(apiUrl('/models/')).toBe('/api/v1/models/')
  })

  it('routes production requests to the configured backend origin', async () => {
    const apiUrl = await loadApiUrl('https://backend.example.test/')
    expect(apiUrl('/auth/login')).toBe('https://backend.example.test/auth/login')
    expect(apiUrl('/health')).toBe('https://backend.example.test/health')
    expect(apiUrl('/v1/auth/refresh')).toBe('https://backend.example.test/api/v1/auth/refresh')
    expect(apiUrl('/api/v1/media/1')).toBe('https://backend.example.test/api/v1/media/1')
    expect(apiUrl('/mlops/jobs')).toBe('https://backend.example.test/api/v1/mlops/jobs')
  })

  it('does not duplicate prefixes when retrying a request', async () => {
    for (const origin of ['', 'https://backend.example.test']) {
      const apiUrl = await loadApiUrl(origin)
      for (const path of ['/auth/login', '/v1/auth/refresh', '/api/v1/media/1', '/mlops/jobs']) {
        expect(apiUrl(apiUrl(path))).toBe(apiUrl(path))
      }
    }
  })
})
