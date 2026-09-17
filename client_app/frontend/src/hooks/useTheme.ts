import { useEffect } from 'react'
import { useThemeStore } from '../store/theme'

export function useTheme() {
  const { isDark, mode, toggle, setMode, initSystemListener } = useThemeStore()

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDark])

  useEffect(() => {
    initSystemListener()
  }, [initSystemListener])

  return { isDark, mode, toggle, setMode }
}
