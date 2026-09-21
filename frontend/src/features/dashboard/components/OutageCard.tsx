import { FollowupBadge, ReincidenteBadge } from '../../../components/monitoring/StatusBadges'
import type { OutageRow } from '../../../types/api'

export function OutageCard({
  row,
  tone = 'danger',
  onManage,
}: {
  row: OutageRow
  tone?: 'danger' | 'success'
  onManage?: (incidentId: number) => void
}) {
  const bar = tone === 'success' ? 'bg-noc-success' : 'bg-noc-danger'

  return (
    <button
      type="button"
      onClick={() => onManage?.(row.incident_id)}
      className="flex w-full overflow-hidden rounded-2xl border border-noc-border/80 bg-noc-surface text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-noc-info/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
    >
      <span className={`w-1.5 shrink-0 ${bar}`} />
      <div className="min-w-0 flex-1 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-noc-text">CID {row.cid ?? '—'}</span>
          <ReincidenteBadge count={row.reincidente_count} />
        </div>
        <p className="mt-1 truncate text-sm text-noc-muted">
          {row.codigo_local ? `${row.codigo_local} ` : ''}
          {row.local_educativo}
          {row.provincia || row.distrito
            ? ` · ${[row.provincia, row.distrito].filter(Boolean).join(' - ')}`
            : ''}
        </p>
        <div className="mt-2 space-y-0.5 text-xs text-noc-muted">
          {tone === 'success' ? (
            <>
              <p>
                Recuperado:{' '}
                {/* recovered_at may arrive via recovery panel; for outage rows use started_at + duracion */}
                {row.started_at ? new Date(row.started_at).toLocaleString() : '—'}
              </p>
              <p>Duración: {row.duracion ?? '—'}</p>
            </>
          ) : (
            <>
              <p>
                Fecha de caída:{' '}
                {row.started_at ? new Date(row.started_at).toLocaleString() : '—'}
              </p>
              <p>PRTG reportó: {row.duracion ?? '—'}</p>
            </>
          )}
        </div>
        <div className="mt-2">
          <FollowupBadge status={row.followup_status} />
        </div>
      </div>
    </button>
  )
}
