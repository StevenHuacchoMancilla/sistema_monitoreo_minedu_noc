import type { ConcentrationZoneSchool } from '../../../types/api'
import { formatDateTime, formatDuration } from '../../../lib/datetime'

export type MassOutageExportRow = ConcentrationZoneSchool & {
  duration_label?: string | null
}

const HEADERS = [
  'TSS',
  'CID',
  'Local educativo',
  'Código local',
  'Provincia',
  'Distrito',
  'Tecnología',
  'Nodo/POP',
  'Estado',
  'Seguimiento',
  'Caída',
  'Duración (seg)',
  'Duración',
] as const

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function durationSeconds(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null
  const start = Date.parse(iso)
  if (Number.isNaN(start)) return null
  return Math.max(0, Math.floor((now - start) / 1000))
}

export function buildMassOutageCsv(nodo: string, rows: MassOutageExportRow[]): string {
  const now = Date.now()
  const lines = [
    `# Caídas masivas · ${nodo}`,
    `# Generado ${formatDateTime(new Date().toISOString())}`,
    HEADERS.join(','),
  ]

  for (const row of rows) {
    const secs = durationSeconds(row.down_started_at, now)
    const cells = [
      row.tss ?? '',
      row.cid ?? '',
      row.local_educativo ?? '',
      row.codigo_local ?? '',
      row.provincia ?? '',
      row.distrito ?? '',
      row.tecnologia ?? '',
      row.nodo_pop ?? nodo,
      row.estado,
      row.followup_status ?? '',
      row.down_started_at ? formatDateTime(row.down_started_at) : '',
      secs ?? '',
      secs != null ? formatDuration(secs) : row.duration_label ?? '',
    ].map((v) => csvEscape(String(v)))
    lines.push(cells.join(','))
  }

  // BOM para que Excel abra UTF-8 correctamente
  return `\uFEFF${lines.join('\n')}`
}

export function downloadMassOutageCsv(nodo: string, rows: MassOutageExportRow[]): void {
  if (rows.length === 0) throw new Error('No hay filas para exportar.')
  const blob = new Blob([buildMassOutageCsv(nodo, rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safe = nodo.replace(/[^\w.-]+/g, '_').slice(0, 40)
  a.href = url
  a.download = `caidas_masivas_${safe}_${new Date().toISOString().slice(0, 10)}.csv`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
