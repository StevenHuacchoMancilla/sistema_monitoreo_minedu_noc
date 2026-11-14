import { Link } from 'react-router-dom'
import { TarjetasConcentracion } from './TarjetasConcentracion'
import type { Concentration } from '../../../types/api'

export function VistaPreviaConcentraciones({ items }: { items: Concentration[] }) {
  return (
    <TarjetasConcentracion
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
