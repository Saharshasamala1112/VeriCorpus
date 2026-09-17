import { create } from 'zustand'
import { getItem, setItem } from '../utils/storage'

type ThemeMode = 'light' | 'dark' | 'system'

interface ThemeState {
  isDark: boolean
  mode: ThemeMode
  toggle: () => void
  setMode: (mode: ThemeMode) => void
  initSystemListener: () => void
}

function resolveIsDark(mode: ThemeMode): boolean {
  if (mode === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }
  return mode === 'dark'
}

function applyTheme(isDark: boolean) {
  if (isDark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  isDark: resolveIsDark(getItem<ThemeMode>('themeMode', 'dark')),
  mode: getItem<ThemeMode>('themeMode', 'dark'),

  toggle: () =>
    set((state) => {
      const newMode: ThemeMode = state.mode === 'dark' ? 'light' : 'dark'
      const newDark = resolveIsDark(newMode)
      setItem('themeMode', newMode)
      applyTheme(newDark)
      return { mode: newMode, isDark: newDark }
    }),

  setMode: (mode: ThemeMode) => {
    const newDark = resolveIsDark(mode)
    setItem('themeMode', mode)
    applyTheme(newDark)
    set({ mode, isDark: newDark })
  },

  initSystemListener: () => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', () => {
      const { mode } = get()
      if (mode === 'system') {
        applyTheme(mql.matches)
        set({ isDark: mql.matches })
      }
    })
  },
}))
