import { Link } from 'react-router-dom'
import { ConcentrationCards } from './ConcentrationCards'
import type { Concentration } from '../../../types/api'

export function ConcentrationsPreview({ items }: { items: Concentration[] }) {
  return (
    <ConcentrationCards
      items={items}
      title="Posibles concentraciones zonales"
      subtitle="Zonas con 2 o más colegios caídos al mismo tiempo."
      limit={4}
      action={
        <Link to="/concentrations" className="text-sm font-medium text-noc-info hover:underline">
          Ver todas →
        </Link>
      }
    />
  )
}
