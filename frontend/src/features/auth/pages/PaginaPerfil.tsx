import { useEffect, useState } from 'react'
import { KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { DisenoApp } from '../../../layouts/DisenoApp'
import { EncabezadoPagina } from '../../../components/ui/EncabezadoPagina'
import { SectionCard } from '../../../components/ui/Tarjeta'
import { Boton } from '../../../components/ui/Boton'
import { FormField } from '../../../components/ui/ControlesFormulario'
import { useAuth } from '../context/ContextoAuth'
import { ApiError, apiGet, apiPatch, apiPut } from '../../../api/clienteHttp'
import { formatDateTime } from '../../../lib/fechaHora'
import { SelectorTemas } from '../../theme/SelectorTemas'

type ProfileData = {
  id: number
  name: string
  email: string
  role: string
  role_label: string
  active: boolean
  last_login_at: string | null
}

export function PaginaPerfil() {
  const { user, refresh } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [email, setEmail] = useState(user?.email ?? '')
  const [saving, setSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [profileErr, setProfileErr] = useState<string | null>(null)

  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdMsg, setPwdMsg] = useState<string | null>(null)
  const [pwdErr, setPwdErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiGet<{ data: ProfileData }>('/profile')
        if (cancelled) return
        setName(res.data.name)
        setEmail(res.data.email)
      } catch {
        /* keep auth user values */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const onSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setProfileMsg(null)
    setProfileErr(null)
    try {
      await apiPatch<{ data: ProfileData; message?: string }>('/profile', { name, email })
      await refresh()
      setProfileMsg('Perfil actualizado.')
    } catch (err) {
      setProfileErr(
        err instanceof ApiError
          ? err.status === 403
            ? 'No tienes permisos para realizar esta acción.'
            : err.message
          : 'No se pudo actualizar el perfil.',
      )
    } finally {
      setSaving(false)
    }
  }

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwdSaving(true)
    setPwdMsg(null)
    setPwdErr(null)
    try {
      await apiPut<{ message?: string }>('/profile/password', {
        current_password: currentPassword,
        password,
        password_confirmation: passwordConfirmation,
      })
      setCurrentPassword('')
      setPassword('')
      setPasswordConfirmation('')
      setPwdMsg('Contraseña actualizada.')
    } catch (err) {
      setPwdErr(
        err instanceof ApiError
          ? err.status === 403
            ? 'No tienes permisos para realizar esta acción.'
            : err.message
          : 'No se pudo cambiar la contraseña.',
      )
    } finally {
      setPwdSaving(false)
    }
  }

  const initials = (user?.name ?? '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?'

  return (
    <DisenoApp bare>
      <EncabezadoPagina
        title="Mi perfil"
        description="Administra tu información personal. El rol solo puede cambiarlo un administrador."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Cuenta">
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-sm font-bold text-white dark:bg-slate-100 dark:text-slate-900">
              {initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{user?.name}</p>
              <p className="truncate text-xs text-slate-500">{user?.role_label}</p>
            </div>
          </div>

          <form className="space-y-3" onSubmit={(e) => void onSaveProfile(e)}>
            <FormField label="Nombre">
              <div className="relative">
                <UserRound className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            </FormField>
            <FormField label="Correo">
              <div className="relative">
                <Mail className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-slate-400" />
                <input
                  type="email"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </FormField>
            <FormField label="Rol">
              <div className="relative">
                <ShieldCheck className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-slate-400" />
                <input
                  className="w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 py-2 pr-3 pl-9 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  value={user?.role_label ?? ''}
                  readOnly
                  disabled
                />
              </div>
            </FormField>
            <p className="text-xs text-slate-500">
              Último acceso: {user?.last_login_at ? formatDateTime(user.last_login_at) : '—'}
            </p>
            {profileMsg ? <p className="text-sm text-emerald-600">{profileMsg}</p> : null}
            {profileErr ? <p className="text-sm text-red-600">{profileErr}</p> : null}
            <Boton type="submit" disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Boton>
          </form>
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Cambiar contraseña">
            <form className="space-y-3" onSubmit={(e) => void onChangePassword(e)}>
              <FormField label="Contraseña actual">
                <div className="relative">
                  <KeyRound className="pointer-events-none absolute top-2.5 left-2.5 h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    autoComplete="current-password"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pr-3 pl-9 text-sm dark:border-slate-700 dark:bg-slate-900"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
              </FormField>
              <FormField label="Nueva contraseña">
                <input
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </FormField>
              <FormField label="Confirmar nueva contraseña">
                <input
                  type="password"
                  autoComplete="new-password"
                  className="w-full rounded-lg border border-slate-200 bg-white py-2 px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  required
                  minLength={8}
                />
              </FormField>
              {pwdMsg ? <p className="text-sm text-emerald-600">{pwdMsg}</p> : null}
              {pwdErr ? <p className="text-sm text-red-600">{pwdErr}</p> : null}
              <Boton type="submit" disabled={pwdSaving}>
                {pwdSaving ? 'Actualizando…' : 'Actualizar contraseña'}
              </Boton>
            </form>
          </SectionCard>

          <SectionCard title="Temas">
            <p className="mb-2 text-xs text-noc-faint">Se guarda en este dispositivo y cambia toda la interfaz.</p>
            <SelectorTemas />
          </SectionCard>
        </div>
      </div>
    </DisenoApp>
  )
}
