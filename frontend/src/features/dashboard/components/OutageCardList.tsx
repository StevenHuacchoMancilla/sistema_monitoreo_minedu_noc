import { Link } from 'react-router-dom'
import { SectionCard } from '../../../components/ui/Card'
import { EmptyState } from '../../../components/ui/States'
import { OutageCard } from './OutageCard'
import type { OutageRow } from '../../../types/api'

export function OutageCardList({
  title,
  rows,
  linkTo,
  linkLabel,
  onManage,
  tone = 'danger',
}: {
  title: string
  rows: OutageRow[]
  linkTo?: string
  linkLabel?: string
  onManage?: (incidentId: number) => void
  tone?: 'danger' | 'success'
}) {
  return (
    <SectionCard
      title={title}
      action={
        linkTo ? (
          <Link to={linkTo} className="text-sm text-noc-info hover:underline">
            {linkLabel ?? 'Ver todos →'}
          </Link>
        ) : undefined
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="Sin registros" />
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <OutageCard key={row.incident_id} row={row} tone={tone} onManage={onManage} />
          ))}
        </div>
      )}
    </SectionCard>
  )
}
