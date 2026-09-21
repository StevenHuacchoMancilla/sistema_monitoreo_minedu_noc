const API_URL = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000/api'

type RequestOptions = RequestInit & { timeoutMs?: number }

async function request<T>(path: string, init?: RequestOptions): Promise<T> {
  const { timeoutMs, ...fetchInit } = init ?? {}
  const controller = timeoutMs ? new AbortController() : null
  const timer = timeoutMs
    ? window.setTimeout(() => controller?.abort(), timeoutMs)
    : null

  try {
    const response = await fetch(`${API_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(fetchInit.headers ?? {}),
      },
      ...fetchInit,
      signal: controller?.signal ?? fetchInit.signal,
    })

    if (!response.ok) {
      throw new Error(`API ${response.status}`)
    }

    return (await response.json()) as T
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
