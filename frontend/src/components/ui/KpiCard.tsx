export function KpiCard({
  label,
  value,
  hint,
  tone = 'default',
}: {
  label: string
  value: number | string
  hint?: string
  tone?: 'default' | 'ok' | 'danger' | 'warn'
}) {
  const valueColor =
    tone === 'ok'
      ? 'text-noc-success'
      : tone === 'danger'
        ? 'text-noc-danger'
        : tone === 'warn'
          ? 'text-noc-warning'
          : 'text-noc-text'

  return (
    <article className="rounded-2xl border border-noc-border/80 bg-noc-surface p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)]">
      <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-noc-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${valueColor}`}>
        {typeof value === 'number' ? value.toLocaleString('es-PE') : value}
      </p>
      {hint ? <p className="mt-1 text-xs text-noc-muted">{hint}</p> : null}
    </article>
  )
}
