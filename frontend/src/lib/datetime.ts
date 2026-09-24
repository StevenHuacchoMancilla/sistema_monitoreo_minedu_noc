const TIME_ZONE = 'America/Lima'

const dateFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})

const shortDateFormatter = new Intl.DateTimeFormat('es-PE', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: 'short',
})

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value == null || value === '') return null
  const d = value instanceof Date ? value : new Date(typeof value === 'string' ? value.replace(' ', 'T') : value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** 23/09/2026 */
export function formatDate(value: string | number | Date | null | undefined): string {
  const d = toDate(value)
  return d ? dateFormatter.format(d) : '—'
}

/** 02:49 PM */
export function formatTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value)
  return d ? timeFormatter.format(d) : '—'
}

/** 23/09/2026 02:49 PM */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value)
  return d ? `${dateFormatter.format(d)} ${timeFormatter.format(d)}` : '—'
}

/** 23/09/2026 18:07 (24h, America/Lima) */
export function formatDateTime24(value: string | number | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return '—'
  const time = new Intl.DateTimeFormat('es-PE', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return `${dateFormatter.format(d)} ${time}`
}

/** Día calendario en America/Lima como YYYY-MM-DD (comparable como string). */
export function limaDateKey(value: string | number | Date | null | undefined): string | null {
  const d = toDate(value)
  return d ? dayKeyFormatter.format(d) : null
}

export function todayLimaKey(): string {
  return dayKeyFormatter.format(new Date())
}

/** Suma días a una clave YYYY-MM-DD sin depender de la zona del navegador. */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** < 1 min · 3 min · 1 h 24 min · 1 d 3 h */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '—'
  const total = Math.floor(seconds)
  if (total < 60) return '< 1 min'
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days > 0) return `${days} d ${hours} h`
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`
  return `${minutes} min`
}

/** "Hoy 02:49 PM", "Ayer 09:10 AM" o "21 sept 02:49 PM". */
export function formatRelativeDateTime(value: string | number | Date | null | undefined): string {
  const d = toDate(value)
  if (!d) return '—'
  const key = dayKeyFormatter.format(d)
  const today = todayLimaKey()
  const yesterday = shiftDateKey(today, -1)
  const time = timeFormatter.format(d)
  if (key === today) return `Hoy ${time}`
  if (key === yesterday) return `Ayer ${time}`
  return `${shortDateFormatter.format(d).replace('.', '')} ${time}`
}
