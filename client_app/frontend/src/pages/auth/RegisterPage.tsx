import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { authService } from '../../services/auth.service'
import { Button, Input } from '../../components/ui'
import CountrySelect from '../../components/auth/CountrySelect'
import { ROUTES } from '../../config/routes'
import { registerSchema, type RegisterFormData } from '../../utils/validators'
import { useAuthTranslation } from '../../locales'

export default function RegisterPage() {
  const t = useAuthTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuthStore()

  const [formData, setFormData] = useState<RegisterFormData>({
    full_name: '',
    email: '',
    phone: '',
    country_code: 'IN',
    password: '',
    confirm_password: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string | undefined>>({})
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: string })?.from || ROUTES.DASHBOARD

  const validate = (field?: keyof RegisterFormData) => {
    if (field) {
      const fieldSchema = registerSchema.shape[field]
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
    const result = registerSchema.safeParse(formData)
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

  const handleChange = (field: keyof RegisterFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined, general: undefined }))
    }
  }

  const handleCountryChange = (country: { code: string; name: string; dialCode: string }) => {
    handleChange('country_code', country.code)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setErrors({})
    try {
      const response = await authService.register({
        full_name: formData.full_name.trim(),
        email: formData.email.trim().toLowerCase(),
        phone: formData.phone.trim(),
        country_code: formData.country_code,
        password: formData.password,
        confirm_password: formData.confirm_password,
      })
      login(response.access_token, {
        user_id: response.user_id,
        username: response.username,
        email: response.email,
        phone: response.phone,
        roles: response.roles,
      })
      navigate(from, { replace: true })
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : t.errors.generic
      setErrors({ general: message })
    } finally {
      setLoading(false)
    }
  }

  const passwordRequirements = [
    { label: t.register.reqLength, test: (p: string) => p.length >= 8 },
    { label: t.register.reqUppercase, test: (p: string) => /[A-Z]/.test(p) },
    { label: t.register.reqLowercase, test: (p: string) => /[a-z]/.test(p) },
    { label: t.register.reqNumber, test: (p: string) => /[0-9]/.test(p) },
    { label: t.register.reqSpecial, test: (p: string) => /[^A-Za-z0-9]/.test(p) },
  ]

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-slate-50 dark:bg-[#070b12]" />
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-[120px] dark:bg-cyan-400/5" />
        <div className="absolute right-1/4 bottom-1/3 h-[400px] w-[400px] rounded-full bg-purple-400/10 blur-[100px] dark:bg-purple-400/5" />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white/50 dark:border-slate-800 dark:bg-slate-900/50">
            <Shield className="h-7 w-7 text-cyan-500 dark:text-cyan-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">{t.appName}</h1>
          <p className="mt-1.5 text-sm text-slate-500">{t.register.subtitle}</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Registration form">
          {errors.general && (
            <div
              className="rounded-xl border border-red-500/20 bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/5 dark:text-red-400"
              role="alert"
            >
              {errors.general}
            </div>
          )}

          <Input
            label={t.register.fullName}
            placeholder={t.register.fullNamePlaceholder}
            value={formData.full_name}
            onChange={(e) => handleChange('full_name', e.target.value)}
            error={errors.full_name}
            autoComplete="name"
            autoFocus
          />

          <Input
            label={t.register.email}
            type="email"
            placeholder={t.register.emailPlaceholder}
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            error={errors.email}
            autoComplete="email"
          />

          <div className="grid grid-cols-2 gap-4">
            <CountrySelect
              value={formData.country_code}
              onChange={handleCountryChange}
              error={errors.country_code}
              label={t.register.country}
            />
            <Input
              label={t.register.phone}
              placeholder={t.register.phonePlaceholder}
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              error={errors.phone}
              autoComplete="tel"
            />
          </div>

          <div className="relative">
            <Input
              label={t.register.password}
              type={showPassword ? 'text' : 'password'}
              placeholder={t.register.passwordPlaceholder}
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              error={errors.password}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[38px] text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              aria-label={showPassword ? t.register.hidePassword : t.register.showPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="relative">
            <Input
              label={t.register.confirmPassword}
              type={showPassword ? 'text' : 'password'}
              placeholder={t.register.confirmPasswordPlaceholder}
              value={formData.confirm_password}
              onChange={(e) => handleChange('confirm_password', e.target.value)}
              error={errors.confirm_password}
              autoComplete="new-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[38px] text-slate-400 transition hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
              aria-label={showPassword ? t.register.hidePassword : t.register.showPassword}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-slate-500">{t.register.passwordRequirements}</p>
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

          <Button type="submit" loading={loading} className="w-full">
            {loading ? t.register.creatingAccount : t.register.createAccount}
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-slate-500">
          {t.register.hasAccount}{' '}
          <a
            href={ROUTES.LOGIN}
            className="text-cyan-500 hover:text-cyan-600 dark:text-cyan-400 dark:hover:text-cyan-300 font-medium transition"
          >
            {t.register.signIn}
          </a>
        </p>
      </div>
    </div>
  )
}