import { create } from 'zustand'
import type { User } from '../types'
import { getItem, setItem, removeItem } from '../utils/storage'

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  login: (token: string, user: User) => void
  logout: () => void
  setUser: (user: User) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getItem<string | null>('token', null),
  user: getItem<User | null>('user', null),
  isAuthenticated: !!getItem<string | null>('token', null),

  login: (token: string, user: User) => {
    setItem('token', token)
    setItem('user', user)
    set({ token, user, isAuthenticated: true })
  },

  logout: () => {
    removeItem('token')
    removeItem('user')
    set({ token: null, user: null, isAuthenticated: false })
  },

  setUser: (user: User) => {
    setItem('user', user)
    set({ user })
  },
}))
