import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus, Shield, UserCheck, UserX } from 'lucide-react'
import { ApiError } from '../../../api/client'
import { useAuth } from '../../auth/context/AuthContext'
import { Button } from '../../../components/ui/Button'
import { Badge } from '../../../components/ui/SoftBadge'
import { FilterCard } from '../../../components/ui/FilterCard'
import { FormField, SearchField, Select } from '../../../components/ui/FormControls'
import {
  DataTableContainer,
  tableClassName,
  tdClassName,
  thClassName,
  theadClassName,
  trClassName,
} from '../../../components/ui/DataTableFrame'
import { inputClassName } from '../../../lib/uiTokens'
import { PaginationBar } from '../../../components/ui/PaginationBar'
import { EmptyState, ErrorState, LoadingState } from '../../../components/ui/States'
import {
  createUser,
  deactivateUser,
  fetchUsers,
  reactivateUser,
  resetUserPassword,
  updateUser,
} from '../api/usersApi'
import type { ManagedUser, ManagedUserRole } from '../types/users'
import { formatDateTime } from '../../../lib/datetime'

const ROLE_OPTIONS: Array<{ value: ManagedUserRole; label: string }> = [
  { value: 'ADMIN', label: 'Administrador' },
  { value: 'NOC_OPERATOR', label: 'Operador NOC' },
  { value: 'VIEWER', label: 'Solo lectura' },
]

function roleTone(role: string | null | undefined) {
  if (role === 'ADMIN') return 'danger' as const
  if (role === 'NOC_OPERATOR') return 'info' as const
  return 'neutral' as const
}

function apiMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const body = e.body
    if (typeof body === 'object' && body && 'errors' in body) {
      const errors = (body as { errors?: Record<string, string[]> }).errors
      const first = errors ? Object.values(errors).flat()[0] : null
      if (first) return first
    }
    return e.message
  }
  return e instanceof Error ? e.message : 'Error'
}

export function UsersAdminPanel() {
  const { user: me } = useAuth()
  const client = useQueryClient()
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [active, setActive] = useState('all')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ManagedUser | null>(null)
  const [resetFor, setResetFor] = useState<ManagedUser | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const list = useQuery({
    queryKey: ['users', 'admin', q, role, active, page],
    queryFn: () =>
      fetchUsers({
        q: q || undefined,
        role: role || undefined,
        active,
        page,
        per_page: 25,
      }),
  })

  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ['users', 'admin'] })
  }

  const createMut = useMutation({
    mutationFn: createUser,
    onSuccess: async () => {
      setBanner('Usuario creado')
      setFormOpen(false)
      await invalidate()
    },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Parameters<typeof updateUser>[1] }) =>
      updateUser(id, body),
    onSuccess: async () => {
      setBanner('Usuario actualizado')
      setEditing(null)
      await invalidate()
    },
  })

  const toggleMut = useMutation({
    mutationFn: async (row: ManagedUser) =>
      row.active ? deactivateUser(row.id) : reactivateUser(row.id),
    onSuccess: async (res) => {
      setBanner(res.data.active ? 'Usuario reactivado' : 'Usuario desactivado')
      await invalidate()
    },
  })

  const resetMut = useMutation({
    mutationFn: ({
      id,
      password,
      password_confirmation,
    }: {
      id: number
      password: string
      password_confirmation: string
    }) => resetUserPassword(id, { password, password_confirmation }),
    onSuccess: async () => {
      setBanner('Contraseña restablecida')
      setResetFor(null)
      await invalidate()
    },
  })

  const rows = list.data?.data ?? []
  const meta = list.data?.meta
  const roles = list.data?.filters.roles ?? ROLE_OPTIONS

  const busy = createMut.isPending || updateMut.isPending || toggleMut.isPending || resetMut.isPending

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-50">
            <Shield className="h-5 w-5 text-violet-700 dark:text-violet-400" aria-hidden />
            Usuarios
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Alta, roles, activación y reset de contraseña · solo administradores.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="primary"
          className="bg-violet-600 hover:bg-violet-700"
          onClick={() => {
            setEditing(null)
            setFormOpen(true)
          }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Nuevo usuario
        </Button>
      </div>

      {banner ? <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{banner}</p> : null}

      <FilterCard>
        <SearchField
          label="Buscar"
          value={q}
          placeholder="Nombre o email"
          onChange={(e) => {
            setQ(e.target.value)
            setPage(1)
          }}
        />
        <FormField label="Rol">
          <Select
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              setPage(1)
            }}
          >
            <option value="">Todos</option>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Estado">
          <Select
            value={active}
            onChange={(e) => {
              setActive(e.target.value)
              setPage(1)
            }}
          >
            <option value="all">Todos</option>
            <option value="1">Activos</option>
            <option value="0">Inactivos</option>
          </Select>
        </FormField>
      </FilterCard>

      {list.isLoading ? <LoadingState /> : null}
      {list.isError ? (
        <ErrorState message={list.error instanceof Error ? list.error.message : 'Error al cargar usuarios'} />
      ) : null}

      {!list.isLoading && !list.isError ? (
        rows.length === 0 ? (
          <EmptyState title="Sin usuarios" description="Ajusta filtros o crea el primero." />
        ) : (
          <>
            <DataTableContainer>
              <table className={`${tableClassName} table-fixed`} style={{ minWidth: 720 }}>
                <thead className={theadClassName}>
                  <tr>
                    <th className={thClassName}>Nombre</th>
                    <th className={thClassName}>Email</th>
                    <th className={`${thClassName} hidden md:table-cell w-[8rem]`}>Rol</th>
                    <th className={`${thClassName} w-[6rem]`}>Estado</th>
                    <th className={`${thClassName} hidden lg:table-cell w-[9rem]`}>Último acceso</th>
                    <th className={`${thClassName} w-[14rem]`}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const isSelf = me?.id === row.id
                    return (
                      <tr key={row.id} className={trClassName}>
                        <td className={`${tdClassName} font-semibold text-slate-900 dark:text-slate-100`}>{row.name}</td>
                        <td className={tdClassName}>{row.email}</td>
                        <td className={`${tdClassName} hidden md:table-cell`}>
                          <Badge tone={roleTone(row.role)}>{row.role_label || row.role || '—'}</Badge>
                        </td>
                        <td className={tdClassName}>
                          <Badge tone={row.active ? 'success' : 'neutral'}>
                            {row.active ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </td>
                        <td className={`${tdClassName} hidden lg:table-cell whitespace-nowrap text-slate-500`}>
                          {row.last_login_at
                            ? formatDateTime(row.last_login_at)
                            : '—'}
                        </td>
                        <td className={tdClassName}>
                          <div className="flex flex-wrap gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => {
                                setFormOpen(false)
                                setEditing(row)
                              }}
                            >
                              Editar
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={busy}
                              onClick={() => setResetFor(row)}
                            >
                              <KeyRound className="h-3.5 w-3.5" aria-hidden />
                              Clave
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={row.active ? 'danger' : 'secondary'}
                              disabled={busy || isSelf}
                              title={isSelf ? 'No puedes desactivarte a ti mismo' : undefined}
                              onClick={() => toggleMut.mutate(row)}
                            >
                              {row.active ? (
                                <>
                                  <UserX className="h-3.5 w-3.5" aria-hidden />
                                  Desactivar
                                </>
                              ) : (
                                <>
                                  <UserCheck className="h-3.5 w-3.5" aria-hidden />
                                  Reactivar
                                </>
                              )}
                            </Button>
                          </div>
                          {toggleMut.isError && toggleMut.variables?.id === row.id ? (
                            <p className="mt-1 text-xs text-red-600">{apiMessage(toggleMut.error)}</p>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </DataTableContainer>
            {meta ? (
              <PaginationBar
                page={meta.current_page}
                lastPage={meta.last_page}
                total={meta.total}
                perPage={meta.per_page}
                onPageChange={setPage}
              />
            ) : null}
          </>
        )
      ) : null}

      {formOpen ? (
        <UserFormModal
          title="Nuevo usuario"
          roles={roles}
          submitting={createMut.isPending}
          error={createMut.isError ? apiMessage(createMut.error) : null}
          onClose={() => setFormOpen(false)}
          onSubmit={async (values) => {
            await createMut.mutateAsync({
              name: values.name,
              email: values.email,
              role: values.role,
              password: values.password,
              password_confirmation: values.password_confirmation,
              active: true,
            })
          }}
          requirePassword
        />
      ) : null}

      {editing ? (
        <UserFormModal
          title={`Editar · ${editing.name}`}
          roles={roles}
          initial={editing}
          submitting={updateMut.isPending}
          error={updateMut.isError ? apiMessage(updateMut.error) : null}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await updateMut.mutateAsync({
              id: editing.id,
              body: {
                name: values.name,
                email: values.email,
                role: values.role,
              },
            })
          }}
        />
      ) : null}

      {resetFor ? (
        <ResetPasswordModal
          user={resetFor}
          submitting={resetMut.isPending}
          error={resetMut.isError ? apiMessage(resetMut.error) : null}
          onClose={() => setResetFor(null)}
          onSubmit={async (password, password_confirmation) => {
            await resetMut.mutateAsync({
              id: resetFor.id,
              password,
              password_confirmation,
            })
          }}
        />
      ) : null}
    </div>
  )
}

function UserFormModal({
  title,
  roles,
  initial,
  requirePassword,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  title: string
  roles: Array<{ value: ManagedUserRole; label: string }>
  initial?: ManagedUser | null
  requirePassword?: boolean
  submitting?: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (values: {
    name: string
    email: string
    role: ManagedUserRole
    password: string
    password_confirmation: string
  }) => Promise<void>
}) {
  const [name, setName] = useState(initial?.name ?? '')
  const [email, setEmail] = useState(initial?.email ?? '')
  const [role, setRole] = useState<ManagedUserRole>((initial?.role as ManagedUserRole) ?? 'NOC_OPERATOR')
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const canSubmit = useMemo(() => {
    if (!name.trim() || !email.trim() || !role) return false
    if (requirePassword && (password.length < 8 || password !== passwordConfirmation)) return false
    return true
  }, [name, email, role, requirePassword, password, passwordConfirmation])

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <form
        className="relative z-10 mt-8 w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onSubmit={(e) => {
          e.preventDefault()
          setLocalError(null)
          if (requirePassword && password !== passwordConfirmation) {
            setLocalError('Las contraseñas no coinciden')
            return
          }
          void onSubmit({
            name: name.trim(),
            email: email.trim(),
            role,
            password,
            password_confirmation: passwordConfirmation,
          }).catch(() => undefined)
        }}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">{title}</h3>
        <div className="mt-4 grid gap-3">
          <FormField label="Nombre">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`${inputClassName} focus:border-violet-500 focus:ring-violet-500/20 dark:focus:border-violet-400 dark:focus:ring-violet-400/20`}
              required
            />
          </FormField>
          <FormField label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`${inputClassName} focus:border-violet-500 focus:ring-violet-500/20 dark:focus:border-violet-400 dark:focus:ring-violet-400/20`}
              required
            />
          </FormField>
          <FormField label="Rol">
            <Select value={role} onChange={(e) => setRole(e.target.value as ManagedUserRole)}>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </FormField>
          {requirePassword ? (
            <>
              <FormField label="Contraseña">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClassName} focus:border-violet-500 focus:ring-violet-500/20 dark:focus:border-violet-400 dark:focus:ring-violet-400/20`}
                  required
                  minLength={8}
                />
              </FormField>
              <FormField label="Confirmar contraseña">
                <input
                  type="password"
                  value={passwordConfirmation}
                  onChange={(e) => setPasswordConfirmation(e.target.value)}
                  className={`${inputClassName} focus:border-violet-500 focus:ring-violet-500/20 dark:focus:border-violet-400 dark:focus:ring-violet-400/20`}
                  required
                  minLength={8}
                />
              </FormField>
            </>
          ) : null}
        </div>
        {(localError || error) ? (
          <p className="mt-3 text-sm font-semibold text-red-600">{localError || error}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={submitting}
            disabled={!canSubmit}
            className="bg-violet-600 hover:bg-violet-700"
          >
            Guardar
          </Button>
        </div>
      </form>
    </div>
  )
}

function ResetPasswordModal({
  user,
  submitting,
  error,
  onClose,
  onSubmit,
}: {
  user: ManagedUser
  submitting?: boolean
  error?: string | null
  onClose: () => void
  onSubmit: (password: string, passwordConfirmation: string) => Promise<void>
}) {
  const [password, setPassword] = useState('')
  const [passwordConfirmation, setPasswordConfirmation] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px]">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <form
        className="relative z-10 mt-8 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        onSubmit={(e) => {
          e.preventDefault()
          setLocalError(null)
          if (password !== passwordConfirmation) {
            setLocalError('Las contraseñas no coinciden')
            return
          }
          void onSubmit(password, passwordConfirmation).catch(() => undefined)
        }}
      >
        <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Restablecer contraseña</h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{user.name} · {user.email}</p>
        <div className="mt-4 grid gap-3">
          <FormField label="Nueva contraseña">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputClassName} focus:border-violet-500 focus:ring-violet-500/20 dark:focus:border-violet-400 dark:focus:ring-violet-400/20`}
              required
              minLength={8}
            />
          </FormField>
          <FormField label="Confirmar">
            <input
              type="password"
              value={passwordConfirmation}
              onChange={(e) => setPasswordConfirmation(e.target.value)}
              className={`${inputClassName} focus:border-violet-500 focus:ring-violet-500/20 dark:focus:border-violet-400 dark:focus:ring-violet-400/20`}
              required
              minLength={8}
            />
          </FormField>
        </div>
        {(localError || error) ? (
          <p className="mt-3 text-sm font-semibold text-red-600">{localError || error}</p>
        ) : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={submitting} className="bg-violet-600 hover:bg-violet-700">
            Actualizar clave
          </Button>
        </div>
      </form>
    </div>
  )
}
