import { createContext, useContext, useState, useEffect } from 'react'
import { authAPI } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    if (token) {
      authAPI.me()
        .then(r => setUser(r.data.data))
        .catch(() => localStorage.clear())
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const { data } = await authAPI.login({ email, password })
    localStorage.setItem('accessToken',  data.data.accessToken)
    localStorage.setItem('refreshToken', data.data.refreshToken)
    setUser(data.data.user)
    return data.data.user
  }

  const signupAdmin = async ({ name, email, password, phone }) => {
    const { data } = await authAPI.register({ name, email, password, phone, role: 'admin' })
    return data.data?.user
  }

  const logout = async () => {
    try { await authAPI.logout({ refreshToken: localStorage.getItem('refreshToken') }) } catch {}
    localStorage.clear()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, signupAdmin }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
