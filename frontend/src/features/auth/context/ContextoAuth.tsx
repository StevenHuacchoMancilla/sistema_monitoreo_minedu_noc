import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { ApiError, apiGet, apiPost, type AuthUser } from '../../../api/clienteHttp'

type AuthContextValue = {
  user: AuthUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<AuthUser>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const ContextoAuth = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await apiGet<{ data: AuthUser }>('/me')
      setUser(res.data)
    } catch (error) {
      // Solo cerrar sesión si el backend niega auth. Un 502/500 no debe botarte.
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setUser(null)
      }
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await apiGet<{ data: AuthUser }>('/me')
        if (!cancelled) setUser(res.data)
      } catch (error) {
        if (!cancelled) {
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            setUser(null)
          } else if (!(error instanceof ApiError) || error.status >= 500 || error.status === 0) {
            // API caída / 502: quedamos sin user para mostrar login, pero el mensaje
            // de login mostrará el error real al intentar entrar.
            setUser(null)
          } else {
            setUser(null)
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiPost<{ data: AuthUser }>('/login', { email, password })
    setUser(res.data)
    return res.data
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiPost('/logout')
    } finally {
      setUser(null)
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, login, logout, refresh }),
    [user, loading, login, logout, refresh],
  )

  return <ContextoAuth.Provider value={value}>{children}</ContextoAuth.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(ContextoAuth)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
