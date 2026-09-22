import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { ApiError } from '../../../api/client'
import { Button } from '../../../components/ui/Button'
import { useAuth } from '../context/AuthContext'

export function LoginPage() {
  const { user, loading, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard/prtg'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!loading && user) {
    return <Navigate to={from} replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      navigate(from, { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.body as { errors?: { email?: string[] }; message?: string } | null
        setError(body?.errors?.email?.[0] ?? body?.message ?? err.message)
      } else {
        setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -20%, rgba(37,99,235,0.45), transparent), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(14,165,233,0.15), transparent)',
        }}
      />
      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-900/40">
            <Activity className="h-6 w-6" aria-hidden />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">NOC Loreto</h1>
          <p className="mt-1 text-sm font-medium text-slate-400">Monitoreo LLEE · MINEDU</p>
        </div>

        <form
          onSubmit={(e) => void onSubmit(e)}
          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl backdrop-blur"
        >
          <h2 className="text-lg font-semibold text-white">Iniciar sesión</h2>
          <p className="mt-1 text-sm text-slate-400">Acceso exclusivo para personal autorizado.</p>

          <label className="mt-6 block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Correo
            </span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none ring-blue-500/40 placeholder:text-slate-600 focus:border-blue-500 focus:ring-2"
              placeholder="usuario@noc.loreto.local"
            />
          </label>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-xs font-semibold tracking-wide text-slate-400 uppercase">
              Contraseña
            </span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-sm text-white outline-none ring-blue-500/40 placeholder:text-slate-600 focus:border-blue-500 focus:ring-2"
              placeholder="••••••••"
            />
          </label>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            variant="primary"
            className="mt-6 w-full"
            loading={submitting}
            disabled={loading}
          >
            Iniciar sesión
          </Button>
        </form>
      </div>
    </div>
  )
}
