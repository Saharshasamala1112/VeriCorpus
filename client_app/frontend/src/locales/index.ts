import { authStrings as en } from './auth.en'
import { authStrings as hi } from './auth.hi'
import { useLanguageStore } from '../store/language'

export type AuthStrings = typeof en

export const authLocales: Record<string, AuthStrings> = {
  en,
  hi,
  te: en, // Telugu - fallback to English
  ta: en, // Tamil - fallback to English
  kn: en, // Kannada - fallback to English
  ml: en, // Malayalam - fallback to English
}

export function useAuthTranslation(): AuthStrings {
  const { explanationLanguage } = useLanguageStore()
  return authLocales[explanationLanguage] || en
}