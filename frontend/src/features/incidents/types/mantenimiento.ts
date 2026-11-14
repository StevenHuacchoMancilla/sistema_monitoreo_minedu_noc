export type MaintenanceTicket = {
  id: number
  incident_id: number | null
  ticket_code: string
  kind: 'CORRECTIVO' | 'PREVENTIVO' | 'ASIGNACION_LIBRE'
  kind_label: string
  is_maintenance: boolean
  status: 'ABIERTO' | 'CERRADO'
  cid: string | null
  tss: string | null
  school_name: string | null
  local_educativo?: string | null
  province: string | null
  district: string | null
  cause_code: string | null
  cause: string | null
  detail: string | null
  opened_at: string | null
  restored_at: string | null
  closed_at: string | null
  opened_by_name: string | null
  closed_by_name: string | null
  technician_name: string | null
  technician_phone: string | null
  polygon: string | null
  visit_reason: string | null
  arrived_at: string | null
  departed_at: string | null
  activities: string | null
  materials: string | null
  event_detail: string
  incident_followup?: string | null
}

export function linesFromBlock(value?: string | null): string[] {
  if (!value?.trim()) return []
  return value
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/^[\s•\-\*]+/, '').trim())
    .filter(Boolean)
}

export function limaTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}

export function limaDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d)
}
