import type { ReactNode } from 'react'
import { usePermisos } from '../hooks/usePermisos'
import type { Permission } from '../permisos'

export function Puede({
  permission,
  anyOf,
  children,
  fallback = null,
}: {
  permission?: Permission | string
  anyOf?: Array<Permission | string>
  children: ReactNode
  fallback?: ReactNode
}) {
  const { can, canAny } = usePermisos()
  const allowed = permission
    ? can(permission)
    : anyOf
      ? canAny(...anyOf)
      : false

  return <>{allowed ? children : fallback}</>
}
