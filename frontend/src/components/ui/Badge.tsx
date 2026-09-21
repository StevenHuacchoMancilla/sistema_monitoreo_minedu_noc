const variants: Record<string, string> = {
  OPERATIVO: 'bg-green-100 text-green-800',
  CAIDO: 'bg-red-100 text-red-700',
  PARCIAL: 'bg-orange-100 text-orange-800',
  PAUSADO: 'bg-slate-100 text-slate-600',
  SIN_DATOS: 'bg-slate-100 text-slate-500',
  DESCONOCIDO: 'bg-slate-100 text-slate-500',
  VINCULADO: 'bg-sky-100 text-sky-800',
  OFFLINE: 'bg-red-100 text-red-700',
  UNKNOWN: 'bg-slate-100 text-slate-500',
  MATCHED: 'bg-green-100 text-green-800',
  PENDIENTE_CONTACTO: 'bg-amber-100 text-amber-800',
  EN_GESTION: 'bg-sky-100 text-sky-800',
  EN_DESCARTE: 'bg-orange-100 text-orange-800',
  EN_ESPERA: 'bg-violet-100 text-violet-800',
  ESCALADO: 'bg-fuchsia-100 text-fuchsia-800',
  TECNICO_EN_CAMPO: 'bg-cyan-100 text-cyan-800',
  RECUPERADO: 'bg-green-100 text-green-800',
  RECUPERADA: 'bg-green-100 text-green-800',
  CERRADO: 'bg-slate-100 text-slate-600',
  ACTIVA: 'bg-red-100 text-red-700',
  REINCIDENTE: 'bg-amber-100 text-amber-900',
}

export const FOLLOWUP_LABELS: Record<string, string> = {
  PENDIENTE_CONTACTO: 'Pendiente contacto',
  EN_GESTION: 'En gestión',
  EN_DESCARTE: 'En descarte',
  EN_ESPERA: 'En espera',
  ESCALADO: 'Escalado',
  TECNICO_EN_CAMPO: 'Técnico en campo',
  RECUPERADO: 'Recuperado',
  CERRADO: 'Cerrado',
}

export function Badge({ value, label }: { value?: string | null; label?: string }) {
  const key = (value ?? 'UNKNOWN').toUpperCase()
  const cls = variants[key] ?? 'bg-slate-100 text-slate-700'
  return (
    <span className={`inline-flex max-w-full truncate rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      {label ?? FOLLOWUP_LABELS[key] ?? value ?? '—'}
    </span>
  )
}
