import { API_URL, ApiError, apiGet, apiPost } from '../../../api/client'
import type { TrackingDetail, TrackingListResponse } from '../types/tracking'
import type { TrackingReportResponse } from '../types/trackingReport'

function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}

export function fetchTrackingList(params: Record<string, string | number | undefined | null> = {}) {
  return apiGet<TrackingListResponse>(`/tracking${toQuery(params)}`)
}

export function fetchTrackingSummary(params: Record<string, string | undefined | null> = {}) {
  return apiGet<{ data: TrackingListResponse['kpis'] }>(`/tracking/summary${toQuery(params)}`)
}

export function fetchTrackingReport(params: Record<string, string | number | undefined | null> = {}) {
  return apiGet<TrackingReportResponse>(`/tracking/report${toQuery(params)}`)
}

export function trackingReportXlsxUrl(params: Record<string, string | number | undefined | null> = {}) {
  return `${API_URL}/tracking/report.xlsx${toQuery(params)}`
}

/** Descarga autenticada (cookies Sanctum) del XLSX filtrado. */
export async function downloadTrackingReportXlsx(
  params: Record<string, string | number | undefined | null> = {},
): Promise<void> {
  const response = await fetch(trackingReportXlsxUrl(params), {
    method: 'GET',
    credentials: 'include',
    headers: {
      Accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'X-Requested-With': 'XMLHttpRequest',
    },
  })

  if (!response.ok) {
    let message = `API ${response.status}`
    try {
      const body = await response.json()
      if (body && typeof body.message === 'string') message = body.message
    } catch {
      /* binary / empty */
    }
    throw new ApiError(response.status, message)
  }

  const disposition = response.headers.get('content-disposition') ?? ''
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i)
  const filename = match?.[1]
    ? decodeURIComponent(match[1].replace(/"/g, ''))
    : `tracking_general_${new Date().toISOString().slice(0, 10)}.xlsx`

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function fetchTrackingDetail(id: number) {
  return apiGet<{ data: TrackingDetail }>(`/tracking/${id}`)
}

export function openTrackingFromIncident(incidentId: number, ticket?: string | null) {
  return apiPost<{ created: boolean; data: TrackingDetail }>('/tracking', {
    incident_id: incidentId,
    ...(ticket ? { ticket } : {}),
  })
}

export function postTrackingUpdate(id: number, body: { body: string; event_type?: string }) {
  return apiPost<{ data: TrackingDetail }>(`/tracking/${id}/updates`, body)
}

export function closeTracking(id: number, body: { lock_version: number; closing_note?: string }) {
  return apiPost<{ data: TrackingDetail }>(`/tracking/${id}/close`, body)
}

export function reopenTracking(id: number, body: { lock_version: number; note?: string }) {
  return apiPost<{ data: TrackingDetail }>(`/tracking/${id}/reopen`, body)
}

export function acknowledgeTrackingRecovery(id: number, body: { lock_version: number; note?: string }) {
  return apiPost<{ data: TrackingDetail }>(`/tracking/${id}/acknowledge-recovery`, body)
}
