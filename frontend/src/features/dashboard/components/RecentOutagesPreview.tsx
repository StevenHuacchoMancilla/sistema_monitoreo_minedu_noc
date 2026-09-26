import { Link, useNavigate } from 'react-router-dom'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/States'
import { FollowupBadge, PrtgStatusBadge } from '../../../components/monitoring/StatusBadges'
import type { OutageRow } from '../../../types/api'

export function RecentOutagesPreview({
  rows,
  totalActive,
}: {
  rows: OutageRow[]
  totalActive: number
}) {
  const navigate = useNavigate()

  return (
    <SectionCard
      title="Caídas activas"
      action={
        <Link to="/incidents/active" className="text-sm text-noc-info hover:underline">
          Ver todas las {totalActive} caídas →
        </Link>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="Sin caídas activas" description="Todas las sedes monitorizadas responden." />
      ) : (
        <>
          <p className="mb-3 text-xs text-noc-muted">
            Haz clic en una fila para abrir el historial operativo del colegio.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-noc-muted">
                <tr>
                  <th className="px-2 py-2">CID</th>
                  <th className="px-2 py-2">Local</th>
                  <th className="px-2 py-2">PRTG</th>
                  <th className="px-2 py-2">Duración</th>
                  <th className="px-2 py-2">Seguimiento</th>
                  <th className="px-2 py-2 text-right">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const href = row.school_id ? `/history/schools/${row.school_id}` : null
                  return (
                    <tr
                      key={row.incident_id}
                      className={`border-t border-noc-border/70 ${href ? 'cursor-pointer hover:bg-white/5' : ''}`}
                      onClick={() => {
                        if (href) navigate(href)
                      }}
                    >
                      <td className="max-w-[90px] truncate px-2 py-2 font-medium">{row.cid}</td>
                      <td className="max-w-[220px] truncate px-2 py-2" title={row.local_educativo ?? ''}>
                        {row.local_educativo}
                      </td>
                      <td className="px-2 py-2">
                        <PrtgStatusBadge status={row.estado_prtg} />
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-noc-muted">{row.duracion}</td>
                      <td className="px-2 py-2">
                        <FollowupBadge status={row.followup_status} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        {href ? (
                          <Link
                            to={href}
                            className="text-sm text-noc-info hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Historial →
                          </Link>
                        ) : (
                          <span className="text-noc-muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </SectionCard>
  )
}
