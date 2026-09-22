import { apiGet, apiPost } from '../../../api/client'
import type { TrackingDetail, TrackingListResponse } from '../types/tracking'

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
