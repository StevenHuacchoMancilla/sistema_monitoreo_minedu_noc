/**
 * Origen del backend Laravel (sin /api) y base /api.
 * En Vercel el front y el API son orígenes distintos: las cookies XSRF de Render
 * no son legibles por JS → CSRF 419. Solución: URLs same-origin (/api, /sanctum)
 * + rewrites en vercel.json hacia Render (igual que el proxy de Vite en local).
 */
function resolveUrls(): { backend: string; api: string } {
  const envApi = (import.meta.env.VITE_API_URL as string | undefined)?.trim()
  const envBackend = (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim()

  const isAbs = (u: string) => /^https?:\/\//i.test(u)
  const otherHost = (u: string) => {
    if (typeof window === 'undefined' || !isAbs(u)) return false
    try {
      return new URL(u).origin !== window.location.origin
    } catch {
      return true
    }
  }

  // API absoluto a otro host (ej. onrender.com desde vercel.app) → forzar proxy local.
  if ((envApi && otherHost(envApi)) || (envBackend && otherHost(envBackend))) {
    return { backend: '', api: '/api' }
  }

  // Relativo (/api) o vacío → same-origin (dev proxy / Vercel rewrites).
  if (!envApi || envApi.startsWith('/')) {
    const api = envApi || '/api'
    const backend = (envBackend && !isAbs(envBackend) ? envBackend : '').replace(/\/$/, '')
    return { backend, api }
  }

  const backend = (
    envBackend ||
    envApi.replace(/\/api\/?$/, '')
  ).replace(/\/$/, '')

  return { backend, api: envApi }
}

const resolved = resolveUrls()
export const BACKEND_URL = resolved.backend
export const API_URL = resolved.api

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
  permissions: string[]
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
      const message = (() => {
        if (response.status === 403) return 'No tienes permisos para realizar esta acción.'
        if (typeof body === 'object' && body) {
          const obj = body as { message?: unknown; errors?: Record<string, string[] | string> }
          if (obj.errors && typeof obj.errors === 'object') {
            const first = Object.values(obj.errors).flat().find((v) => typeof v === 'string' && v.trim())
            if (typeof first === 'string') return first
          }
          if (typeof obj.message === 'string' && obj.message.trim()) return obj.message
        }
        return `API ${response.status}`
      })()
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
