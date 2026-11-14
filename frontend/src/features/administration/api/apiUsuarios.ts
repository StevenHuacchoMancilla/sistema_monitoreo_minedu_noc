import { apiGet, apiPost, apiPut } from '../../../api/clienteHttp'
import type { ManagedUser, ManagedUserRole, UsersListResponse } from '../types/usuarios'

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function fetchUsers(params: Record<string, string | number | undefined | null> = {}) {
  return apiGet<UsersListResponse>(`/usuarios${toQuery(params)}`)
}

export function createUser(body: {
  name: string
  email: string
  password: string
  password_confirmation: string
  role: ManagedUserRole
  active?: boolean
}) {
  return apiPost<{ data: ManagedUser }>('/usuarios', body)
}

export function updateUser(
  id: number,
  body: { name?: string; email?: string; role?: ManagedUserRole },
) {
  return apiPut<{ data: ManagedUser }>(`/usuarios/${id}`, body)
}

export function deactivateUser(id: number) {
  return apiPost<{ data: ManagedUser }>(`/usuarios/${id}/deactivate`)
}

export function reactivateUser(id: number) {
  return apiPost<{ data: ManagedUser }>(`/usuarios/${id}/reactivate`)
}

export function resetUserPassword(
  id: number,
  body: { password: string; password_confirmation: string },
) {
  return apiPost<{ message: string; data: ManagedUser }>(`/usuarios/${id}/reset-password`, body)
}
