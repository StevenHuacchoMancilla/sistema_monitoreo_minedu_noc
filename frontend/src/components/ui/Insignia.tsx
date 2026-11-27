const tones: Record<string, string> = {
  OPERATIVO: 'text-noc-success',
  CAIDO: 'text-noc-danger',
  PARCIAL: 'text-noc-warning',
  PAUSADO: 'text-noc-faint',
  SIN_DATOS: 'text-noc-faint',
  DESCONOCIDO: 'text-noc-faint',
  VINCULADO: 'text-noc-info',
  OFFLINE: 'text-noc-danger',
  UNKNOWN: 'text-noc-faint',
  MATCHED: 'text-noc-success',
  PENDIENTE_CONTACTO: 'text-noc-warning',
  EN_GESTION: 'text-noc-info',
  EN_DESCARTE: 'text-noc-warning',
  EN_ESPERA: 'text-noc-info',
  ESCALADO: 'text-noc-warning',
  TECNICO_EN_CAMPO: 'text-noc-info',
  PENDIENTE_CIERRE: 'text-noc-warning',
  RECUPERADO: 'text-noc-success',
  RECUPERADA: 'text-noc-success',
  CERRADO: 'text-noc-faint',
  ACTIVA: 'text-noc-danger',
  REINCIDENTE: 'text-noc-warning',
  EN_INCIDENCIA: 'text-noc-danger',
}

export const FOLLOWUP_LABELS: Record<string, string> = {
  PENDIENTE_CONTACTO: 'Pendiente de gestión',
  EN_GESTION: 'En gestión',
  EN_DESCARTE: 'En descarte',
  EN_ESPERA: 'En espera',
  ESCALADO: 'Escalado',
  TECNICO_EN_CAMPO: 'Técnico en campo',
  PENDIENTE_CIERRE: 'Pendiente de cierre',
  RECUPERADO: 'Recuperado',
  CERRADO: 'Cerrado',
}

export const PRTG_STATUS_LABELS: Record<string, string> = {
  OPERATIVO: 'Operativo',
  CAIDO: 'Caído',
  PARCIAL: 'Parcial caído',
  PAUSADO: 'Pausado',
  SIN_DATOS: 'Sin datos',
  DESCONOCIDO: 'Desconocido',
}

export function Insignia({ value, label }: { value?: string | null; label?: string }) {
  const key = (value ?? 'UNKNOWN').toUpperCase()
  const cls = tones[key] ?? 'text-noc-muted'
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 truncate text-[12px] font-medium whitespace-nowrap ${cls}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden />
      {label ?? FOLLOWUP_LABELS[key] ?? PRTG_STATUS_LABELS[key] ?? value ?? '—'}
    </span>
  )
}
