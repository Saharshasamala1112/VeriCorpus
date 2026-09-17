import { z } from 'zod'

export const loginSchema = z.object({
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})

export const otpLoginSchema = z.object({
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
})

export const otpVerifySchema = z.object({
  otp_code: z.string().length(6, 'OTP must be exactly 6 digits'),
})

export const signupOTPSchema = z.object({
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  name: z.string().min(2, 'Name must be at least 2 characters').optional(),
  email: z.string().email('Invalid email').optional(),
})

export const signupOTPVerifySchema = z
  .object({
    otp_code: z.string().length(6, 'OTP must be exactly 6 digits'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })

export const uploadSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
})

export type LoginFormData = z.infer<typeof loginSchema>
export type OTPLoginFormData = z.infer<typeof otpLoginSchema>
export type OTPVerifyFormData = z.infer<typeof otpVerifySchema>
export type SignupOTPFormData = z.infer<typeof signupOTPSchema>
export type SignupOTPVerifyFormData = z.infer<typeof signupOTPVerifySchema>
export type UploadFormData = z.infer<typeof uploadSchema>
