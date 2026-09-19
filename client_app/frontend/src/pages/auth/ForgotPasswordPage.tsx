import { useState, type FormEvent } from 'react'
import { Shield, CheckCircle, AlertCircle } from 'lucide-react'
import { authService } from '../../services/auth.service'
import { Button, Input } from '../../components/ui'
import { ROUTES } from '../../config/routes'
import { forgotPasswordSchema, type ForgotPasswordFormData } from '../../utils/validators'
import { useAuthTranslation } from '../../locales'

type ForgotPasswordState = 'idle' | 'submitting' | 'email_sent' | 'error'

export default function ForgotPasswordPage() {
  const t = useAuthTranslation()
  const [state, setState] = useState<ForgotPasswordState>('idle')
  const [formData, setFormData] = useState<ForgotPasswordFormData>({ email: '' })
  const [errors, setErrors] = useState<{ email?: string; general?: string }>({})
  const [message, setMessage] = useState<string>('')

  const validate = () => {
    const result = forgotPasswordSchema.safeParse(formData)
    const newErrors: typeof errors = {}
    if (!result.success) {
      for (const issue of result.error.issues) {
        const path = issue.path[0] as keyof ForgotPasswordFormData
        newErrors[path] = issue.message
      }
    }
    setErrors(newErrors)
    return result.success
  }

  const handleChange = (field: keyof ForgotPasswordFormData, value: string) => {
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
      await authService.forgotPassword({ email: formData.email.trim().toLowerCase() })
      setState('email_sent')
      setMessage(t.forgotPassword.checkEmailMessage)
    } catch {
      setState('error')
      setErrors({ general: t.errors.generic })
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
          <p className="mt-1.5 text-sm text-slate-500">{t.forgotPassword.subtitle}</p>
        </div>

        {state === 'idle' || state === 'submitting' || state === 'error' ? (
          <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Forgot password form">
            {errors.general && (
              <div
                className="rounded-xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/5 dark:text-red-400"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 inline mr-1" />
                {errors.general}
              </div>
            )}

            <Input
              label={t.forgotPassword.email}
              type="email"
              placeholder={t.forgotPassword.emailPlaceholder}
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              error={errors.email}
              autoComplete="email"
              autoFocus
              disabled={state === 'submitting'}
            />

            <Button type="submit" loading={state === 'submitting'} className="w-full">
              {state === 'submitting' ? t.forgotPassword.sending : t.forgotPassword.sendResetLink}
            </Button>
          </form>
        ) : (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-500/10">
              <CheckCircle className="h-8 w-8 text-emerald-500 dark:text-emerald-400" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t.forgotPassword.checkEmailTitle}</h2>
            <p className="text-sm text-slate-500">{message}</p>
            <Button variant="secondary" onClick={() => setState('idle')} className="w-full">
              {t.forgotPassword.sendAnother}
            </Button>
          </div>
        )}

        <p className="mt-8 text-center text-sm text-slate-500">
          <a
            href={ROUTES.LOGIN}
            className="text-cyan-500 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300 font-medium transition"
          >
            {t.forgotPassword.backToSignIn}
          </a>
        </p>
      </div>
    </div>
  )
}