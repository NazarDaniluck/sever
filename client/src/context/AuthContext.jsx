import { createContext, useContext, useEffect, useState } from 'react'
import { authApi } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('sever_token')
    if (!token) { setLoading(false); return }
    authApi.me()
      .then(setUser)
      .catch(() => { localStorage.removeItem('sever_token') })
      .finally(() => setLoading(false))
  }, [])

  const applyLogin = (data) => {
    if (data && data.token) localStorage.setItem('sever_token', data.token)
    if (data && data.user) setUser(data.user)
    return data
  }

  // Возвращает данные ответа: { token, user } или { twoFactorRequired, loginToken }
  const login = async (email, password) => {
    const data = await authApi.login({ email, password })
    if (data && data.twoFactorRequired) return data
    return applyLogin(data)
  }

  const verifyTwoFactor = async (loginToken, code) => {
    return applyLogin(await authApi.verifyTwoFactor(loginToken, code))
  }

  const register = async (payload) => {
    return applyLogin(await authApi.register(payload))
  }

  const logout = () => {
    localStorage.removeItem('sever_token')
    setUser(null)
  }

  const logoutAll = async () => {
    try { await authApi.logoutAll() } catch { /* токен мог уже стать недействительным */ }
    logout()
  }

  const updateUser = (u) => setUser(u)

  return (
    <AuthContext.Provider value={{ user, setUser: updateUser, login, verifyTwoFactor, register, logout, logoutAll, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
