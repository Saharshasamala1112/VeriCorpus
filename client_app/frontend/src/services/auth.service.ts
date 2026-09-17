import api from '../lib/axios'
import type {
  LoginRequest,
  LoginResponse,
  OTPRequest,
  OTPVerifyRequest,
  SignupOTPVerifyRequest,
  OTPSendResponse,
  TokenRefreshResponse,
  UserProfile,
} from '../types'

export const authService = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const response = await api.post('/auth/login', data)
    return response.data
  },

  register: async (data: {
    phone: string
    username: string
    password: string
  }): Promise<LoginResponse> => {
    const response = await api.post('/auth/register', data)
    return response.data
  },

  sendLoginOTP: async (data: OTPRequest): Promise<OTPSendResponse> => {
    const response = await api.post('/corpus/login/send-otp', data)
    return response.data
  },

  verifyLoginOTP: async (data: OTPVerifyRequest): Promise<LoginResponse> => {
    const response = await api.post('/corpus/login/verify-otp', data)
    return response.data
  },

  resendLoginOTP: async (data: OTPRequest): Promise<OTPSendResponse> => {
    const response = await api.post('/corpus/login/resend-otp', data)
    return response.data
  },

  sendSignupOTP: async (data: OTPRequest): Promise<OTPSendResponse> => {
    const response = await api.post('/corpus/signup/send-otp', data)
    return response.data
  },

  verifySignupOTP: async (data: SignupOTPVerifyRequest): Promise<LoginResponse> => {
    const response = await api.post('/corpus/signup/verify-otp', data)
    return response.data
  },

  resendSignupOTP: async (data: OTPRequest): Promise<OTPSendResponse> => {
    const response = await api.post('/corpus/signup/resend-otp', data)
    return response.data
  },

  refreshToken: async (): Promise<TokenRefreshResponse> => {
    const response = await api.post('/v1/auth/refresh')
    return response.data
  },

  getMe: async (): Promise<UserProfile> => {
    const response = await api.get('/corpus/me')
    return response.data
  },
}
