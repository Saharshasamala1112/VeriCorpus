import { useState, useEffect, type FormEvent } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Shield, CheckCircle, AlertCircle, Loader2, Lock } from 'lucide-react'
import { authService } from '../../services/auth.service'
import { Button, Input } from '../../components/ui'
import { ROUTES } from '../../config/routes'
import { resetPasswordSchema, type ResetPasswordFormData } from '../../utils/validators'
import { useAuthTranslation } from '../../locales'

type ResetPasswordState =
  | 'validating_token'
  | 'ready'
  | 'submitting'
  | 'success'
  | 'expired'
  | 'invalid'
  | 'error'

export default function ResetPasswordPage() {
  const t = useAuthTranslation()
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()

  const [state, setState] = useState<ResetPasswordState>('validating_token')
  const [formData, setFormData] = useState<ResetPasswordFormData>({
    token: token || '',
    password: '',
    confirm_password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [message, setMessage] = useState<string>('')

  const passwordRequirements = [
    { label: t.resetPassword.reqLength, test: (p: string) => p.length >= 8 },
    { label: t.resetPassword.reqUppercase, test: (p: string) => /[A-Z]/.test(p) },
    { label: t.resetPassword.reqLowercase, test: (p: string) => /[a-z]/.test(p) },
    { label: t.resetPassword.reqNumber, test: (p: string) => /[0-9]/.test(p) },
    { label: t.resetPassword.reqSpecial, test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  ]

  useEffect(() => {
    if (!token) {
      setState('invalid')
      return
    }
    setFormData((prev) => ({ ...prev, token }))
    setState('ready')
  }, [token])

  const validate = (field?: keyof ResetPasswordFormData) => {
    if (field) {
      const fieldSchema = resetPasswordSchema.shape[field]
      if (!fieldSchema) return true
      const result = fieldSchema.safeParse(formData[field])
      const newErrors: typeof errors = {}
      if (!result.success) {
        for (const issue of result.error.issues) {
          newErrors[field] = issue.message
        }
      }
      setErrors((prev) => ({ ...prev, ...newErrors }))
      return result.success
    }
    const result = resetPasswordSchema.safeParse(formData)
    const newErrors: typeof errors = {}
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path[0] as string
        newErrors[path] = issue.message
      }
    }
    setErrors((prev) => ({ ...prev, ...newErrors }))
    return result.success
  }

  const handleChange = (field: keyof ResetPasswordFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }))
    }
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setState('submitting')
    setErrors({})
    setMessage('')

    try {
      await authService.resetPassword({
        token: formData.token,
        password: formData.password,
        confirm_password: formData.confirm_password,
      })
      setState('success')
      setMessage(t.resetPassword.successMessage)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t.errors.generic
      if (message.includes('expired') || message.includes('Invalid') || message.includes('expired')) {
        setState('expired')
      } else {
        setState('error')
        setErrors({ general: message })
      }
    }
  }

  const renderState = () => {
    switch (state) {
      case 'validating_token':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500 dark:text-cyan-400" />
            <p className="mt-4 text-sm text-slate-500">{t.resetPassword.validatingToken}</p>
          </div>
        )
      case 'ready':
        return (
          <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Reset password form">
            {errors.general && (
              <div
                className="rounded-xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/5 dark:text-red-400"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 inline mr-1" />
                {errors.general}
              </div>
            )}

            <div className="relative">
              <Input
                label={t.resetPassword.newPassword}
                type={showPassword ? 'text' : 'password'}
                placeholder={t.resetPassword.newPasswordPlaceholder}
                value={formData.password}
                onChange={(e) => handleChange('password', e.target.value)}
                error={errors.password}
                autoComplete="new-password"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                aria-label={showPassword ? t.resetPassword.hidePassword : t.resetPassword.showPassword}
              >
                <Lock className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs text-slate-500">{t.resetPassword.passwordRequirements}</p>
              <div className="grid grid-cols-2 gap-1.5">
                {passwordRequirements.map((req) => (
                  <div
                    key={req.label}
                    className={`flex items-center gap-1.5 text-xs ${
                      req.test(formData.password) ? 'text-emerald-500 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <span className={`h-3.5 w-3.5 rounded-full border ${
                      req.test(formData.password)
                        ? 'border-emerald-500 bg-emerald-500 dark:border-emerald-400 dark:bg-emerald-400'
                        : 'border-slate-300 dark:border-slate-600'
                    }`} />
                    {req.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <Input
                label={t.resetPassword.confirmPassword}
                type={showPassword ? 'text' : 'password'}
                placeholder={t.resetPassword.confirmPasswordPlaceholder}
                value={formData.confirm_password}
                onChange={(e) => handleChange('confirm_password', e.target.value)}
                error={errors.confirm_password}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-[38px] text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                aria-label={showPassword ? t.resetPassword.hidePassword : t.resetPassword.showPassword}
              >
                <Lock className="h-4 w-4" />
              </button>
            </div>

            <Button type="submit" loading={state === 'submitting'} className="w-full">
              {t.resetPassword.resetPassword}
            </Button>
          </form>
        )
      case 'submitting':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-500 dark:text-cyan-400" />
            <p className="mt-4 text-sm text-slate-500">{t.resetPassword.resetting}</p>
          </div>
        )
      case 'success':
        return (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
              <CheckCircle className="h-8 w-8 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t.resetPassword.successTitle}</h2>
            <p className="text-sm text-slate-500">{message}</p>
            <Button onClick={() => navigate(ROUTES.LOGIN)} className="w-full">
              {t.resetPassword.signIn}
            </Button>
          </div>
        )
      case 'expired':
        return (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
              <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t.resetPassword.expiredTitle}</h2>
            <p className="text-sm text-slate-500">{t.resetPassword.expiredMessage}</p>
            <Button variant="secondary" onClick={() => navigate(ROUTES.FORGOT_PASSWORD)} className="w-full">
              {t.resetPassword.requestNew}
            </Button>
          </div>
        )
      case 'invalid':
        return (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
              <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t.resetPassword.invalidTitle}</h2>
            <p className="text-sm text-slate-500">{t.resetPassword.invalidMessage}</p>
            <Button variant="secondary" onClick={() => navigate(ROUTES.FORGOT_PASSWORD)} className="w-full">
              {t.resetPassword.requestNew}
            </Button>
          </div>
        )
      case 'error':
        return (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-red-500/10">
              <AlertCircle className="h-8 w-8 text-red-500 dark:text-red-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t.resetPassword.errorTitle}</h2>
            <p className="text-sm text-slate-500">{errors.general || t.resetPassword.errorMessage}</p>
            <Button variant="secondary" onClick={() => setState('ready')} className="w-full">
              {t.resetPassword.tryAgain}
            </Button>
          </div>
        )
      default:
        return null
    }
  }

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
          <p className="mt-1.5 text-sm text-slate-500">{t.resetPassword.subtitle}</p>
        </div>

        {renderState()}

        <p className="mt-8 text-center text-sm text-slate-500">
          <a
            href={ROUTES.LOGIN}
            className="text-cyan-500 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300 font-medium transition"
          >
            {t.resetPassword.backToSignIn}
          </a>
        </p>
      </div>
    </div>
  )
}