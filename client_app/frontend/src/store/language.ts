import { create } from 'zustand'
import { getItem, setItem } from '../utils/storage'

export interface LanguageOption {
  code: string
  label: string
}

/** Languages supported for explanation UI (all have locale files). */
export const EXPLANATION_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
  { code: 'ta', label: 'Tamil' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
]

/** Languages supported for text analysis (affects detection accuracy). */
export const ANALYSIS_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
  { code: 'ta', label: 'Tamil' },
  { code: 'kn', label: 'Kannada' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'gu', label: 'Gujarati' },
]

/** Languages with full AI detection models (others use stylometric only). */
export const LANGUAGES_WITH_TRAINED_MODELS = ['en', 'hi', 'te']

/** Languages using stylometric features only (reduced accuracy). */
export const LANGUAGES_WITH_STYLOMETRIC_ONLY = ['ta', 'kn', 'ml']

/** Combined supported languages (union of analysis and explanation). */
export const SUPPORTED_LANGUAGES = [
  ...new Map([...ANALYSIS_LANGUAGES, ...EXPLANATION_LANGUAGES].map((l) => [l.code, l])).values(),
]

interface LanguageState {
  /** Language used for text analysis (affects detection accuracy). */
  analysisLanguage: string
  /** Language used for UI labels and result explanations. */
  explanationLanguage: string
  /** Legacy: set both analysis and explanation language at once. */
  language: string

  setAnalysisLanguage: (code: string) => void
  setExplanationLanguage: (code: string) => void
  /** Legacy setter: updates both analysis and explanation language. */
  setLanguage: (code: string) => void
}

export const useLanguageStore = create<LanguageState>((set) => ({
  analysisLanguage: getItem<string>('analysisLanguage', 'en'),
  explanationLanguage: getItem<string>('explanationLanguage', 'en'),
  language: getItem<string>('language', 'en'),

  setAnalysisLanguage: (code: string) => {
    setItem('analysisLanguage', code)
    set({ analysisLanguage: code })
  },

  setExplanationLanguage: (code: string) => {
    setItem('explanationLanguage', code)
    set({ explanationLanguage: code })
  },

  setLanguage: (code: string) => {
    setItem('language', code)
    setItem('analysisLanguage', code)
    setItem('explanationLanguage', code)
    set({
      language: code,
      analysisLanguage: code,
      explanationLanguage: code,
    })
  },
}))
