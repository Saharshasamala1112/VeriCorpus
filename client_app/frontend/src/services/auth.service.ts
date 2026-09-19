import api from '../lib/axios'
import type {
  LoginRequest,
  LoginResponse,
  CorpusLoginRequest,
  OTPRequest,
  OTPVerifyRequest,
  SignupOTPVerifyRequest,
  OTPSendResponse,
  TokenRefreshResponse,
} from '../types'
import type { RegisterFormData, ForgotPasswordFormData, ResetPasswordFormData } from '../utils/validators'

export interface RegisterResponse {
  access_token: string
  token_type: string
  user_id: string
  username: string
  email: string
  phone: string
  roles: string[]
  auth_provider: string
}

export interface ForgotPasswordResponse {
  message: string
}

export interface ResetPasswordResponse {
  message: string
}

export interface CurrentUser {
  id: string
  full_name: string
  email: string
  phone: string
  country_code: string
  role: string
  is_active: boolean
  auth_provider: string
  created_at: string
  last_login_at: string | null
  corpus_connected: boolean
}

export const authService = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post('/v1/auth/login', data)
    return response.data
  },

  register: async (data: RegisterFormData): Promise<RegisterResponse> => {
    const response = await api.post('/v1/auth/register', data)
    return response.data
  },

  forgotPassword: async (data: ForgotPasswordFormData): Promise<ForgotPasswordResponse> => {
    const response = await api.post('/v1/auth/forgot-password', data)
    return response.data
  },

  resetPassword: async (data: ResetPasswordFormData): Promise<ResetPasswordResponse> => {
    const response = await api.post('/v1/auth/reset-password', data)
    return response.data
  },

  refreshToken: async (): Promise<TokenRefreshResponse> => {
    const response = await api.post('/v1/auth/refresh')
    return response.data
  },

  getMe: async (): Promise<CurrentUser> => {
    const response = await api.get('/v1/auth/me')
    return response.data
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Corpus Standalone Login (No Existing Session Required)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Authenticate a Corpus user and create/map to VeriCorpus user.
   * This is the main entry point for Corpus users signing in to VeriCorpus.
   */
  corpusStandaloneLogin: async (data: CorpusLoginRequest): Promise<LoginResponse> => {
    const response = await api.post('/v1/auth/corpus/standalone-login', data)
    return response.data
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Corpus Account Linking (Existing User Only)
  // ──────────────────────────────────────────────────────────────────────────

  corpusLogin: async (data: { phone: string; password: string }): Promise<LoginResponse> => {
    const response = await api.post('/v1/auth/corpus/login', data)
    return response.data
  },

  sendLoginOTP: async (data: OTPRequest): Promise<OTPSendResponse> => {
    const response = await api.post('/v1/auth/corpus/send-login-otp', data)
    return response.data
  },

  verifyLoginOTP: async (data: OTPVerifyRequest): Promise<LoginResponse> => {
    const response = await api.post('/v1/auth/corpus/verify-login-otp', data)
    return response.data
  },

  resendLoginOTP: async (data: OTPRequest): Promise<OTPSendResponse> => {
    const response = await api.post('/v1/auth/corpus/resend-login-otp', data)
    return response.data
  },

  sendSignupOTP: async (data: OTPRequest): Promise<OTPSendResponse> => {
    const response = await api.post('/v1/auth/corpus/send-signup-otp', data)
    return response.data
  },

  verifySignupOTP: async (data: SignupOTPVerifyRequest): Promise<LoginResponse> => {
    const response = await api.post('/v1/auth/corpus/verify-signup-otp', data)
    return response.data
  },

  resendSignupOTP: async (data: OTPRequest): Promise<OTPSendResponse> => {
    const response = await api.post('/v1/auth/corpus/resend-signup-otp', data)
    return response.data
  },

  corpusStatus: async (): Promise<{ connected: boolean; corpus_phone: string | null; token_expires_at: string | null }> => {
    const response = await api.get('/v1/auth/corpus/status')
    return response.data
  },

  corpusDisconnect: async (): Promise<{ message: string }> => {
    const response = await api.post('/v1/auth/corpus/disconnect')
    return response.data
  },
}
