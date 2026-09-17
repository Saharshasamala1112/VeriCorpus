import { useState, type FormEvent } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Eye, EyeOff, Shield } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { authService } from '../../services/auth.service'
import { Button, Input } from '../../components/ui'
import { ROUTES } from '../../config/routes'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login } = useAuthStore()

  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<{ phone?: string; password?: string; general?: string }>({})
  const [loading, setLoading] = useState(false)

  const from = (location.state as { from?: string })?.from || ROUTES.DASHBOARD

  const validate = () => {
    const errs: typeof errors = {}
    if (!phone.trim()) errs.phone = 'Phone number is required'
    if (!password) errs.password = 'Password is required'
    else if (password.length < 6) errs.password = 'Password must be at least 6 characters'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setErrors({})
    try {
      const response = await authService.login({ phone: phone.trim(), password })
      login(response.access_token, {
        user_id: response.user_id,
        username: response.username,
        phone: response.phone,
        roles: response.roles,
      })
      navigate(from, { replace: true })
    } catch (err) {
      setErrors({
        general: err instanceof Error ? err.message : 'Invalid credentials. Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-[#070b12]" />
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/5 blur-[120px]" />
        <div className="absolute right-1/4 bottom-1/3 h-[400px] w-[400px] rounded-full bg-purple-400/5 blur-[100px]" />
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/50">
            <Shield className="h-7 w-7 text-cyan-400" />
          </div>
          <h1 className="text-xl font-bold text-white">VeriCorpus AI</h1>
          <p className="mt-1.5 text-sm text-slate-500">Multimodal content authenticity platform</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4" aria-label="Sign in form">
          {errors.general && (
            <div
              className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400"
              role="alert"
            >
              {errors.general}
            </div>
          )}

          <Input
            label="Phone number"
            placeholder="Enter your phone number"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value)
              setErrors((p) => ({ ...p, phone: undefined, general: undefined }))
            }}
            error={errors.phone}
            autoComplete="tel"
            autoFocus
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                setErrors((p) => ({ ...p, password: undefined, general: undefined }))
              }}
              error={errors.password}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-[38px] text-slate-500 transition hover:text-slate-300"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <Button type="submit" loading={loading} className="w-full">
            Sign in
          </Button>
        </form>

        <p className="mt-8 text-center text-[11px] text-slate-600">
          Secure access to VeriCorpus AI platform
        </p>
      </div>
    </div>
  )
}
