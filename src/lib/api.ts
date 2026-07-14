import type { ApiErrorShape } from './types'

export class ApiError extends Error {
  code: string
  fieldErrors: Record<string, string[] | string>
  requestId?: string
  status: number

  constructor(status: number, payload?: Partial<ApiErrorShape['error']>) {
    super(payload?.message || 'İşlem tamamlanamadı. Lütfen tekrar deneyin.')
    this.name = 'ApiError'
    this.status = status
    this.code = payload?.code || 'UNEXPECTED_ERROR'
    this.fieldErrors = payload?.fieldErrors || {}
    this.requestId = payload?.requestId
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  headers.set('Accept', 'application/json')

  const response = await fetch(`/api${path}`, {
    ...init,
    headers,
    credentials: 'include',
  })

  if (response.status === 204) return undefined as T
  const payload = await response.json().catch(() => undefined) as T | ApiErrorShape | undefined
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined
    throw new ApiError(response.status, error)
  }
  return payload as T
}

export const money = (cents = 0) => new Intl.NumberFormat('tr-TR', {
  style: 'currency', currency: 'TRY', maximumFractionDigits: 2,
}).format(cents / 100)

export const shortDate = (value: string | Date) => new Intl.DateTimeFormat('tr-TR', {
  day: '2-digit', month: 'short', year: 'numeric',
}).format(new Date(value))

export const shortTime = (value: string | Date) => new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit', minute: '2-digit',
}).format(new Date(value))

