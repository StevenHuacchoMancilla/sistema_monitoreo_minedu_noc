/** Insignia de fuente de energía del colegio (red pública / panel solar). */
export function InsigniaEnergia({
  energy,
  size = 'md',
}: {
  energy?: string | null
  size?: 'sm' | 'md'
}) {
  const value = (energy ?? '').trim().toUpperCase()
  const pad = size === 'sm' ? 'px-1.5 py-0.5 text-[11px]' : 'px-2.5 py-1 text-[12px]'

  if (value.includes('PANEL') || value.includes('SOLAR')) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-amber-50 font-semibold text-amber-900 ring-1 ring-amber-500/20 dark:bg-amber-950/45 dark:text-amber-200 dark:ring-amber-500/30 ${pad}`}
        title={energy ?? 'Panel solar'}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        Panel solar
      </span>
    )
  }

  if (value.includes('RED')) {
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-600/15 dark:bg-emerald-950/45 dark:text-emerald-300 dark:ring-emerald-500/30 ${pad}`}
        title={energy ?? 'Red pública'}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
        Red pública
      </span>
    )
  }

  if (value !== '') {
    return (
      <span
        className={`inline-flex rounded-md bg-slate-100 font-semibold text-slate-700 ring-1 ring-slate-500/10 dark:bg-slate-800 dark:text-slate-200 ${pad}`}
        title={energy ?? undefined}
      >
        {energy}
      </span>
    )
  }

  return (
    <span className={`inline-flex rounded-md bg-slate-50 font-medium text-slate-400 ring-1 ring-slate-200/80 dark:bg-slate-900 dark:text-slate-500 dark:ring-slate-700 ${pad}`}>
      Sin energía
    </span>
  )
}
