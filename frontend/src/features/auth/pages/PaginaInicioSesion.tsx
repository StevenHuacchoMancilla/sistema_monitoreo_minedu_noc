import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../../../api/clienteHttp'
import { Boton } from '../../../components/ui/Boton'
import { useAuth } from '../context/ContextoAuth'
import { homePathForPermissions } from '../permisos'

export function PaginaInicioSesion() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const fromState = (location.state as { from?: string } | null)?.from

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    const dest =
      fromState && fromState !== '/login' ? fromState : homePathForPermissions(user.permissions)
    return <Navigate to={dest} replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const logged = await login(email.trim(), password)
      const dest =
        fromState && fromState !== '/login' ? fromState : homePathForPermissions(logged.permissions)
      navigate(dest, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 502 || err.status === 503 || err.status === 504) {
          setError('El API no responde (502). Verifica que Laravel esté en el puerto 8000.')
        } else {
          const body = err.body as { errors?: { email?: string[] }; message?: string } | null
          setError(body?.errors?.email?.[0] ?? body?.message ?? err.message)
        }
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-noc-bg px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <svg viewBox="0 0 20 20" className="mx-auto mb-4 h-8 w-8" aria-hidden>
            <rect x="1" y="1" width="8" height="8" rx="1.2" fill="#2997FF" />
            <rect x="11" y="1" width="8" height="8" rx="1.2" fill="none" stroke="#7E8DA3" strokeWidth="1.15" />
            <rect x="1" y="11" width="8" height="8" rx="1.2" fill="none" stroke="#7E8DA3" strokeWidth="1.15" />
            <rect x="11" y="11" width="8" height="8" rx="1.2" fill="#22334F" />
          </svg>
          <h1 className="text-[13px] font-semibold tracking-[0.2em] text-noc-text uppercase">NOC Loreto</h1>
          <p className="mt-1 text-sm text-noc-faint">Operaciones · Loreto</p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="rounded-md border border-noc-border bg-noc-surface p-6"
        >
          <h2 className="text-lg font-semibold text-noc-text">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-noc-muted">Acceso exclusivo para personal autorizado.</p>

          <label className="mt-6 block">
            <span className="mb-1.5 block text-[11px] font-medium tracking-[0.08em] text-noc-faint uppercase">
              Correo
            </span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 w-full rounded-md border border-noc-border bg-noc-nav px-3 text-sm text-noc-text outline-none placeholder:text-noc-disabled focus:border-noc-copper focus:ring-2 focus:ring-noc-copper/20"
              placeholder="usuario@noc.loreto.local"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[11px] font-medium tracking-[0.08em] text-noc-faint uppercase">
              Contraseña
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-10 w-full rounded-md border border-noc-border bg-noc-nav px-3 text-sm text-noc-text outline-none placeholder:text-noc-disabled focus:border-noc-copper focus:ring-2 focus:ring-noc-copper/20"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <p className="mt-4 rounded-md border border-noc-border px-3 py-2 text-sm text-noc-danger">
              {error}
            </p>
          ) : null}

          <Boton
            type="submit"
            variant="primary"
            className="mt-6 w-full"
            loading={submitting}
            disabled={loading}
          >
            Iniciar sesión
          </Boton>
        </form>
      </div>
    </div>
  )
}
