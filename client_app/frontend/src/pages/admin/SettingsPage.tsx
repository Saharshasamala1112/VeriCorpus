import { useState } from 'react'
import {
  Moon,
  Sun,
  Monitor,
  Globe,
  Bell,
  Shield,
  Database,
  Link,
  Unlink,
  Loader2,
  Phone,
  Mail,
} from 'lucide-react'
import { Card, Input, Button, Select } from '../../components/ui'
import { useThemeStore } from '../../store/theme'
import { useLanguageStore, SUPPORTED_LANGUAGES } from '../../store/language'
import { useAuthStore } from '../../store/auth'
import api from '../../lib/axios'

export default function SettingsPage() {
  const { isDark, mode, setMode } = useThemeStore()
  const { language, setLanguage } = useLanguageStore()
  const { user, token } = useAuthStore()
  const [saved, setSaved] = useState(false)
  const [corpusStatus, setCorpusStatus] = useState<{
    connected: boolean
    corpus_phone: string | null
    token_expires_at: string | null
  } | null>(null)
  const [corpusLoading, setCorpusLoading] = useState(false)
  const [corpusPhone, setCorpusPhone] = useState('')
  const [corpusPassword, setCorpusPassword] = useState('')
  const [corpusOtp, setCorpusOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [otpMode, setOtpMode] = useState<'login' | 'signup'>('login')
  const [corpusName, setCorpusName] = useState('')
  const [corpusEmail, setCorpusEmail] = useState('')
  const [corpusError, setCorpusError] = useState<string | null>(null)
  const [corpusSuccess, setCorpusSuccess] = useState<string | null>(null)

  const fetchCorpusStatus = async () => {
    if (!token) return
    try {
      const res = await api.get('/auth/corpus/status')
      setCorpusStatus(res.data)
    } catch {
      setCorpusStatus({ connected: false, corpus_phone: null, token_expires_at: null })
    }
  }

  const handleCorpusLogin = async () => {
    if (!corpusPhone || !corpusPassword) return
    setCorpusLoading(true)
    setCorpusError(null)
    try {
      const res = await api.post('/auth/corpus/login', {
        phone: corpusPhone,
        password: corpusPassword,
      })
      setCorpusStatus(res.data)
      setCorpusSuccess('Corpus account linked successfully')
      setCorpusPhone('')
      setCorpusPassword('')
      setTimeout(() => setCorpusSuccess(null), 3000)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setCorpusError(err.response?.data?.detail || 'Failed to link Corpus account')
    } finally {
      setCorpusLoading(false)
    }
  }

  const handleSendOtp = async () => {
    if (!corpusPhone) return
    setCorpusLoading(true)
    setCorpusError(null)
    try {
      await api.post(`/auth/corpus/send-${otpMode}-otp`, { phone: corpusPhone })
      setOtpSent(true)
      setCorpusSuccess(`OTP sent to ${corpusPhone}`)
      setTimeout(() => setCorpusSuccess(null), 3000)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setCorpusError(err.response?.data?.detail || 'Failed to send OTP')
    } finally {
      setCorpusLoading(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (!corpusPhone || !corpusOtp) return
    setCorpusLoading(true)
    setCorpusError(null)
    try {
      if (otpMode === 'login') {
        const res = await api.post('/auth/corpus/verify-login-otp', {
          phone: corpusPhone,
          otp_code: corpusOtp,
        })
        setCorpusStatus(res.data)
      } else {
        const res = await api.post('/auth/corpus/verify-signup-otp', {
          phone: corpusPhone,
          otp_code: corpusOtp,
          name: corpusName,
          email: corpusEmail,
        })
        setCorpusStatus(res.data)
      }
      setCorpusSuccess('Corpus account linked successfully')
      setCorpusPhone('')
      setCorpusOtp('')
      setCorpusName('')
      setCorpusEmail('')
      setOtpSent(false)
      setTimeout(() => setCorpusSuccess(null), 3000)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setCorpusError(err.response?.data?.detail || 'Failed to verify OTP')
    } finally {
      setCorpusLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setCorpusLoading(true)
    try {
      await api.post('/auth/corpus/disconnect')
      setCorpusStatus({ connected: false, corpus_phone: null, token_expires_at: null })
      setCorpusSuccess('Corpus account disconnected')
      setTimeout(() => setCorpusSuccess(null), 3000)
    } catch {
      setCorpusError('Failed to disconnect')
    } finally {
      setCorpusLoading(false)
    }
  }

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const themeOptions = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'system', label: 'System' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Configure your VeriCorpus AI experience.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            {isDark ? (
              <Moon className="h-4 w-4 text-cyan-400" />
            ) : (
              <Sun className="h-4 w-4 text-amber-400" />
            )}
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Appearance</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">Theme</span>
              <div className="flex gap-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1">
                {themeOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setMode(opt.value as 'light' | 'dark' | 'system')}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      mode === opt.value
                        ? 'bg-cyan-500/20 text-cyan-400'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                    }`}
                  >
                    {opt.value === 'light' && <Sun className="h-3 w-3" />}
                    {opt.value === 'dark' && <Moon className="h-3 w-3" />}
                    {opt.value === 'system' && <Monitor className="h-3 w-3" />}
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Globe className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Language</h2>
          </div>
          <Select
            value={language}
            onChange={setLanguage}
            options={SUPPORTED_LANGUAGES.map((l: { code: string; label: string }) => ({
              value: l.code,
              label: l.label,
            }))}
          />
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Bell className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Notifications</h2>
          </div>
          <div className="space-y-3">
            {['Analysis complete', 'Model updates', 'Dataset sync'].map((item) => (
              <label key={item} className="flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">{item}</span>
                <input
                  type="checkbox"
                  defaultChecked
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-700 bg-slate-200 dark:bg-slate-800 text-cyan-400 focus:ring-cyan-400/40"
                />
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Database className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">API Configuration</h2>
          </div>
          <div className="space-y-3">
            <Input label="API Base URL" defaultValue="http://localhost:8000/api/v1" />
            <Input label="Timeout (ms)" defaultValue="30000" type="number" />
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Shield className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Security</h2>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-500 dark:text-slate-400">Session</span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                Active
              </span>
            </div>
            <Button variant="danger" size="sm" className="w-full">
              Sign out all sessions
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <div className="mb-4 flex items-center gap-2">
            <Link className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Corpus Integration</h2>
          </div>
          <div className="space-y-4">
            {corpusStatus?.connected ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                      Connected
                    </span>
                    {corpusStatus.corpus_phone && (
                      <span className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                        <Phone className="h-3.5 w-3.5" /> {corpusStatus.corpus_phone}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={corpusLoading}
                  >
                    <Unlink className="h-3.5 w-3.5 mr-1.5" /> Disconnect
                  </Button>
                </div>
                {corpusStatus.token_expires_at && (
                  <p className="text-xs text-slate-500">
                    Token expires: {new Date(corpusStatus.token_expires_at).toLocaleString()}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Connect your Corpus account to access language datasets, sync records, and use
                  Corpus-powered analysis features.
                </p>
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 p-4 space-y-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setOtpMode('login')
                        setOtpSent(false)
                        setCorpusError(null)
                        setCorpusSuccess(null)
                      }}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        otpMode === 'login'
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Phone className="h-3.5 w-3.5" /> Login with OTP
                    </button>
                    <button
                      onClick={() => {
                        setOtpMode('signup')
                        setOtpSent(false)
                        setCorpusError(null)
                        setCorpusSuccess(null)
                      }}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        otpMode === 'signup'
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Mail className="h-3.5 w-3.5" /> Sign up with OTP
                    </button>
                    <button
                      onClick={() => {
                        setOtpMode('login')
                        setOtpSent(false)
                        setCorpusError(null)
                        setCorpusSuccess(null)
                      }}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        !otpSent
                          ? 'bg-cyan-500/20 text-cyan-400'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Shield className="h-3.5 w-3.5" /> Phone + Password
                    </button>
                  </div>

                  {corpusError && (
                    <p className="text-sm text-red-400 flex items-center gap-1">{corpusError}</p>
                  )}
                  {corpusSuccess && (
                    <p className="text-sm text-emerald-400 flex items-center gap-1">
                      {corpusSuccess}
                    </p>
                  )}

                  <div className="space-y-3">
                    <Input
                      label="Phone Number"
                      value={corpusPhone}
                      onChange={(e) => setCorpusPhone(e.target.value)}
                      placeholder="+91XXXXXXXXXX"
                      type="tel"
                    />
                    {!otpSent && !corpusPassword && (
                      <Input
                        label="Password"
                        value={corpusPassword}
                        onChange={(e) => setCorpusPassword(e.target.value)}
                        placeholder="Enter your Corpus password"
                        type="password"
                      />
                    )}
                    {otpSent && (
                      <Input
                        label="OTP Code"
                        value={corpusOtp}
                        onChange={(e) => setCorpusOtp(e.target.value)}
                        placeholder="Enter 6-digit OTP"
                        type="text"
                        maxLength={6}
                      />
                    )}
                    {otpMode === 'signup' && !otpSent && (
                      <>
                        <Input
                          label="Name"
                          value={corpusName}
                          onChange={(e) => setCorpusName(e.target.value)}
                          placeholder="Your name"
                          type="text"
                        />
                        <Input
                          label="Email (optional)"
                          value={corpusEmail}
                          onChange={(e) => setCorpusEmail(e.target.value)}
                          placeholder="email@example.com"
                          type="email"
                        />
                      </>
                    )}
                    {!otpSent && !corpusPassword && (
                      <Button
                        onClick={handleCorpusLogin}
                        disabled={corpusLoading || !corpusPhone || !corpusPassword}
                        className="w-full"
                      >
                        {corpusLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Link with Password'
                        )}
                      </Button>
                    )}
                    {!otpSent && (
                      <Button
                        variant="secondary"
                        onClick={handleSendOtp}
                        disabled={corpusLoading || !corpusPhone}
                        className="w-full"
                      >
                        {corpusLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          `Send ${otpMode === 'login' ? 'Login' : 'Signup'} OTP`
                        )}
                      </Button>
                    )}
                    {otpSent && (
                      <Button
                        onClick={handleVerifyOtp}
                        disabled={corpusLoading || !corpusOtp}
                        className="w-full"
                      >
                        {corpusLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Verify OTP & Link'
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">About</h2>
          </div>
          <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
            <p>VeriCorpus AI v1.0.0</p>
            <p>Multimodal content authenticity platform</p>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleSave}>{saved ? 'Saved' : 'Save settings'}</Button>
      </div>
    </div>
  )
}
