import { apiGet, apiPost, apiPut } from '../../../api/client'
import type { ManagedUser, ManagedUserRole, UsersListResponse } from '../types/users'

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function fetchUsers(params: Record<string, string | number | undefined | null> = {}) {
  return apiGet<UsersListResponse>(`/users${toQuery(params)}`)
}

export function createUser(body: {
  name: string
  email: string
  password: string
  password_confirmation: string
  role: ManagedUserRole
  active?: boolean
}) {
  return apiPost<{ data: ManagedUser }>('/users', body)
}

export function updateUser(
  id: number,
  body: { name?: string; email?: string; role?: ManagedUserRole },
) {
  return apiPut<{ data: ManagedUser }>(`/users/${id}`, body)
}

export function deactivateUser(id: number) {
  return apiPost<{ data: ManagedUser }>(`/users/${id}/deactivate`)
}

export function reactivateUser(id: number) {
  return apiPost<{ data: ManagedUser }>(`/users/${id}/reactivate`)
}

export function resetUserPassword(
  id: number,
  body: { password: string; password_confirmation: string },
) {
  return apiPost<{ message: string; data: ManagedUser }>(`/users/${id}/reset-password`, body)
}
