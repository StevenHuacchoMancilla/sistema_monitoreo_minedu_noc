/** Origen del backend Laravel (sin /api). */
export const BACKEND_URL = (
  import.meta.env.VITE_BACKEND_URL ??
  (import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api').replace(/\/api\/?$/, '')
).replace(/\/$/, '')

export const API_URL = import.meta.env.VITE_API_URL ?? `${BACKEND_URL}/api`

export type AuthUser = {
  id: number
  name: string
  email: string
  role: 'ADMIN' | 'NOC_OPERATOR' | 'VIEWER'
  role_label: string
  active: boolean
  last_login_at: string | null
  can_write: boolean
  is_admin: boolean
}

export class ApiError extends Error {
  status: number
  body: unknown

  constructor(status: number, message: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/([$()*+.?[\\\]^{|}])/g, '\\$1')}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export async function ensureCsrfCookie(): Promise<void> {
  await fetch(`${BACKEND_URL}/sanctum/csrf-cookie`, {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  })
}

type RequestOptions = RequestInit & { timeoutMs?: number; skipCsrf?: boolean }

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const { timeoutMs, skipCsrf, ...fetchInit } = init ?? {}
  const method = (fetchInit.method ?? 'GET').toUpperCase()

  if (!skipCsrf && method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    await ensureCsrfCookie()
  }

  const controller = timeoutMs ? new AbortController() : null
  const timer = timeoutMs ? window.setTimeout(() => controller?.abort(), timeoutMs) : null
  const xsrf = readCookie('XSRF-TOKEN')

  try {
    const response = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(xsrf ? { 'X-XSRF-TOKEN': xsrf } : {}),
        ...(fetchInit.headers ?? {}),
      },
      ...fetchInit,
      signal: controller?.signal ?? fetchInit.signal,
    })

    if (response.status === 204) {
      return undefined as T
    }

    const contentType = response.headers.get('content-type') ?? ''
    const body = contentType.includes('application/json')
      ? await response.json().catch(() => null)
      : await response.text().catch(() => null)

    if (!response.ok) {
      const message =
        typeof body === 'object' && body && 'message' in body && typeof (body as { message: unknown }).message === 'string'
          ? (body as { message: string }).message
          : `API ${response.status}`
      throw new ApiError(response.status, message, body)
    }

    return body as T
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('La solicitud tardó demasiado (timeout)')
    }
    throw error
  } finally {
    if (timer !== null) window.clearTimeout(timer)
  }
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path)
}

export function apiPost<T>(path: string, body?: unknown, options?: { timeoutMs?: number }): Promise<T> {
  return request<T>(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    timeoutMs: options?.timeoutMs,
  })
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' })
}
