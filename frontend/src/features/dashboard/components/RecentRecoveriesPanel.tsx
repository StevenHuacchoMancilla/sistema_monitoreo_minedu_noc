import { Link } from 'react-router-dom'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/States'
import { formatDateTime } from '../../../lib/datetime'
import type { DashboardSummary } from '../../../types/api'

export function RecentRecoveriesPanel({
  items,
  onManage,
}: {
  items: DashboardSummary['recent_recoveries']
  onManage?: (incidentId: number) => void
}) {
  return (
    <SectionCard
      title="Recuperados recientemente"
      action={
        <Link to="/recoveries" className="text-sm text-noc-info hover:underline">
          Ver todos →
        </Link>
      }
    >
      {items.length === 0 ? (
        <EmptyState title="Sin recuperaciones recientes" />
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.incident_id}>
              <button
                type="button"
                onClick={() => onManage?.(item.incident_id)}
                className="flex w-full overflow-hidden rounded-2xl border border-noc-border/80 bg-noc-surface text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition hover:border-noc-success/40 hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)]"
              >
                <span className="w-1.5 shrink-0 bg-noc-success" />
                <div className="min-w-0 flex-1 p-3">
                  <span className="font-semibold">CID {item.cid ?? '—'}</span>
                  <p className="mt-1 truncate text-sm text-noc-muted">
                    {item.codigo_local ? `${item.codigo_local} ` : ''}
                    {item.local_educativo}
                  </p>
                  <p className="mt-1 text-xs text-noc-muted">
                    Recuperado: {formatDateTime(item.recovered_at)}
                  </p>
                  <p className="text-xs text-noc-muted">Duración: {item.duracion ?? '—'}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
