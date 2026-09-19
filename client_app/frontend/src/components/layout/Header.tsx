import { useEffect, useState } from 'react'
import { LogOut, Menu, Moon, Sun, Globe } from 'lucide-react'
import { useThemeStore } from '../../store/theme'
import { useAuthStore } from '../../store/auth'
import { useLanguageStore, SUPPORTED_LANGUAGES } from '../../store/language'
import { API_BASE_URL } from '../../utils/constants'
import { StatusIndicator } from '../ui'

interface HeaderProps {
  onMenuToggle: () => void
}

export default function Header({ onMenuToggle }: HeaderProps) {
  const { isDark, toggle } = useThemeStore()
  const { user, logout } = useAuthStore()
  const { language: selectedLang, setLanguage: setSelectedLang } = useLanguageStore()
  const [apiStatus, setApiStatus] = useState<'checking' | 'healthy' | 'down'>('checking')
  const [showLang, setShowLang] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function checkHealth() {
      try {
        const res = await fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(5000) })
        if (!cancelled) setApiStatus(res.ok ? 'healthy' : 'down')
      } catch {
        if (!cancelled) setApiStatus('down')
      }
    }
    checkHealth()
    const interval = setInterval(checkHealth, 30000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/80 px-4 backdrop-blur-xl dark:border-slate-800/50 dark:bg-[#070b12]/80 sm:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-white lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <StatusIndicator
          status={
            apiStatus === 'checking' ? 'loading' : apiStatus === 'healthy' ? 'online' : 'offline'
          }
        />
      </div>

      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-slate-500 sm:inline">
          {user?.username || 'Signed in'}
        </span>

        {/* Language */}
        <div className="relative">
          <button
            onClick={() => setShowLang(!showLang)}
            className="flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-white"
            aria-label="Select language"
          >
            <Globe className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">
              {SUPPORTED_LANGUAGES.find((l) => l.code === selectedLang)?.label || 'English'}
            </span>
          </button>
          {showLang && (
            <div className="absolute right-0 top-full z-50 mt-2 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-800 dark:bg-slate-900">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    setSelectedLang(lang.code)
                    setShowLang(false)
                  }}
                  className={`flex w-full items-center px-4 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800 ${
                    selectedLang === lang.code ? 'text-cyan-600 dark:text-cyan-300' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {lang.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={toggle}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-white"
          aria-label="Toggle theme"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        <button
          type="button"
          onClick={logout}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-red-400/40 hover:text-red-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:border-red-400/40 dark:hover:text-red-300"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
