import type { ReactNode } from 'react'
import { usePermissions } from '../hooks/usePermissions'
import type { Permission } from '../permissions'

export function Can({
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
  const { can, canAny } = usePermissions()
  const allowed = permission
    ? can(permission)
    : anyOf
      ? canAny(...anyOf)
      : false

  return <>{allowed ? children : fallback}</>
}
