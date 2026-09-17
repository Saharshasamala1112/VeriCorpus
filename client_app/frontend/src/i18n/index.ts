import type { ExplanationTemplate } from '../types/explainability'
import en from './explanations/en'
import te from './explanations/te'
import hi from './explanations/hi'
import ta from './explanations/ta'
import kn from './explanations/kn'
import ml from './explanations/ml'

export const explanationLocales: Record<string, ExplanationTemplate> = {
  en,
  te,
  hi,
  ta,
  kn,
  ml,
}

export const SUPPORTED_EXPLANATION_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'te', label: 'Telugu' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
] as const

export function getExplanationTemplate(langCode: string): ExplanationTemplate {
  return explanationLocales[langCode] ?? explanationLocales.en
}

// ---------------------------------------------------------------------------
// UI Strings (non-explanation)
// ---------------------------------------------------------------------------

import enUI from './locales/en'
import teUI from './locales/te'
import hiUI from './locales/hi'
import taUI from './locales/ta'
import knUI from './locales/kn'
import mlUI from './locales/ml'

export type UIStringKeys = typeof enUI

export const uiLocales: Record<string, UIStringKeys> = {
  en: enUI,
  te: teUI,
  hi: hiUI,
  ta: taUI,
  kn: knUI,
  ml: mlUI,
}

export function getUIStrings(langCode: string): UIStringKeys {
  return uiLocales[langCode] ?? uiLocales.en
}
