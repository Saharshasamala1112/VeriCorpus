export { API_BASE_URL } from '../config/env'

export const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
}

export const RISK_LABELS: Record<string, string> = {
  low: 'Low Risk',
  medium: 'Medium Risk',
  high: 'High Risk',
  critical: 'Critical Risk',
}

export const ALLOWED_FILE_TYPES = ['.txt', '.pdf', '.docx', '.doc', '.odt', '.rtf']
export const MAX_FILE_SIZE_MB = 50
