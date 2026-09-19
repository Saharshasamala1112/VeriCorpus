import { useState, useCallback, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Shield, Phone } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { authService } from '../../services/auth.service'
import { Button, Input } from '../../components/ui'
import { ROUTES } from '../../config/routes'
import { useAuthTranslation } from '../../locales'

const PHONE_REGEX = /^\d{10}$/

export default function LoginPage() {
  const t = useAuthTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuthStore()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const from = (location.state as { from?: string })?.from || ROUTES.DASHBOARD

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {}
    const digits = phone.replace(/\s/g, '')
    if (!digits) {
      newErrors.phone = 'Phone number is required'
    } else if (!PHONE_REGEX.test(digits)) {
      newErrors.phone = 'Enter a valid 10-digit mobile number'
    }
    if (!password) {
      newErrors.password = 'Password is required'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [phone, password])

  const handleSubmit = useCallback(async (e: FormEvent) => {
    e.preventDefault()
    if (!validate() || isSubmitting) return

    setIsSubmitting(true)
    setErrors({})
    try {
      const digits = phone.replace(/\s/g, '')
      const response = await authService.corpusStandaloneLogin({
        phone: `+91${digits}`,
        password,
      })

      login(response.access_token, {
        user_id: response.user_id,
        username: response.username,
        email: response.email,
        phone: response.phone,
        roles: response.roles,
        auth_provider: response.auth_provider,
      })
      navigate(from, { replace: true })
    } catch (err: unknown) {
      let message = 'Authentication failed. Please check your credentials.'

      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { status?: number; data?: { detail?: string } } }
        if (axiosError.response?.status === 503) {
          message = t.login.corpusUnavailable
        } else if (axiosError.response?.status === 409) {
          message = t.login.emailCollision
        } else if (axiosError.response?.data?.detail) {
          message = axiosError.response.data.detail
        }
      } else if (err instanceof Error) {
        message = err.message
      }

      setErrors({ general: message })
    } finally {
      setIsSubmitting(false)
    }
  }, [validate, isSubmitting, phone, password, login, navigate, from, t.login.corpusUnavailable, t.login.emailCollision])

  const handlePhoneChange = useCallback((value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10)
    setPhone(digits)
    if (errors.phone || errors.general) {
      setErrors((prev) => ({ ...prev, phone: undefined, general: undefined }))
    }
  }, [errors.phone, errors.general])

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-slate-50 dark:bg-[#070b12]" />
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-[120px] dark:bg-cyan-400/5" />
        <div className="absolute right-1/4 bottom-1/3 h-[400px] w-[400px] rounded-full bg-purple-400/10 blur-[100px] dark:bg-purple-400/5" />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-slate-900/50">
            <Shield className="h-7 w-7 text-cyan-500 dark:text-cyan-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t.appName}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t.login.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Sign in form">
          {errors.general && (
            <div
              className="rounded-xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/5 dark:text-red-400"
              role="alert"
            >
              {errors.general}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="phone-input" className="block text-sm font-medium text-slate-600 dark:text-slate-300">
              {t.login.phone}
            </label>
            <div className="flex gap-2">
              <div className="pointer-events-none flex h-10 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-100/70 text-sm font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                <Phone className="mr-1.5 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                +91
              </div>
              <input
                id="phone-input"
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={10}
                placeholder="Enter your 10-digit mobile number"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                autoComplete="tel-national"
                autoFocus
                disabled={isSubmitting}
                aria-invalid={errors.phone ? 'true' : undefined}
                aria-describedby={errors.phone ? 'phone-error' : undefined}
                className={`w-full rounded-xl border bg-white/70 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-offset-0 dark:bg-slate-900/70 dark:text-white dark:placeholder-slate-500 ${
                  errors.phone
                    ? 'border-red-500/50 focus:border-red-400/60 focus:ring-red-400/20'
                    : 'border-slate-200 focus:border-cyan-400/60 focus:ring-cyan-400/20 dark:border-slate-800 dark:focus:border-cyan-400/60 dark:focus:ring-cyan-400/20'
                }`}
              />
            </div>
            {errors.phone && (
              <p id="phone-error" className="text-xs text-red-500 dark:text-red-400" role="alert">
                {errors.phone}
              </p>
            )}
          </div>

          <div className="relative">
            <Input
              label={t.login.password}
              type={showPassword ? 'text' : 'password'}
              placeholder={t.login.passwordPlaceholder}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                if (errors.password) setErrors((prev) => ({ ...prev, password: undefined, general: undefined }))
              }}
              error={errors.password}
              autoComplete="current-password"
              disabled={isSubmitting}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              disabled={isSubmitting}
              className="absolute right-3 top-[38px] text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 disabled:opacity-50"
              aria-label={showPassword ? t.login.hidePassword : t.login.showPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <Button
            type="submit"
            loading={isSubmitting}
            disabled={isSubmitting}
            className="w-full"
          >
            {isSubmitting ? t.login.signingIn : t.login.signIn}
          </Button>
        </form>
      </div>
    </div>
  )
}
