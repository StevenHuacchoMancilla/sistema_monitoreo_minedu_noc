import type { IncidentDetail } from '../../../types/api'
import type { MaintenanceTicket } from '../types/maintenance'
import { downloadMaintenanceTicketPng } from './downloadMaintenanceTicketPng'

export function ticketPayloadFromDetail(detail: IncidentDetail): MaintenanceTicket {
  const t = detail.ticket
  if (!t?.ticket_code) {
    throw new Error('Este caso aún no tiene código de ticket.')
  }

  return {
    id: t.id,
    incident_id: t.incident_id,
    ticket_code: t.ticket_code,
    kind: t.kind === 'PREVENTIVO' || t.kind === 'ASIGNACION_LIBRE' ? t.kind : 'CORRECTIVO',
    kind_label: t.kind_label,
    is_maintenance: Boolean(t.is_maintenance),
    status: t.status,
    cid: t.cid ?? detail.colegio?.cid ?? null,
    tss: t.tss ?? (detail.colegio?.current_sequence != null ? String(detail.colegio.current_sequence) : null),
    school_name: t.school_name ?? detail.colegio?.local_educativo ?? null,
    local_educativo: detail.colegio?.local_educativo ?? t.school_name ?? null,
    province: t.province ?? detail.colegio?.provincia ?? null,
    district: t.district ?? detail.colegio?.distrito ?? null,
    cause_code: t.cause_code ?? null,
    cause: t.cause ?? null,
    detail: t.detail ?? null,
    opened_at: t.opened_at,
    restored_at: t.restored_at,
    closed_at: t.closed_at,
    opened_by_name: t.opened_by_name,
    closed_by_name: t.closed_by_name,
    technician_name: t.technician_name,
    technician_phone: t.technician_phone ?? null,
    polygon: t.polygon,
    visit_reason: t.visit_reason,
    arrived_at: t.arrived_at,
    departed_at: t.departed_at,
    activities: t.activities,
    materials: t.materials,
    event_detail: t.event_detail,
  }
}

/** Descarga la imagen del ticket; el archivo se nombra con el código TGS. */
export async function downloadTicketImageFromIncidentId(incidentId: number): Promise<string> {
  const { endpoints } = await import('../../../api/endpoints')
  const detail = await endpoints.incidentDetail(incidentId)
  const ticket = ticketPayloadFromDetail(detail)
  await downloadMaintenanceTicketPng(ticket)
  return ticket.ticket_code
}
