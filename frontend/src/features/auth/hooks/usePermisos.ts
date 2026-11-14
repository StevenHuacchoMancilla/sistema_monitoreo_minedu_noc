import { useMemo } from 'react'
import { useAuth } from '../context/ContextoAuth'
import type { Permission } from '../permisos'

export function usePermisos() {
  const { user } = useAuth()
  const permissions = user?.permissions ?? []

  return useMemo(() => {
    const set = new Set(permissions)
    return {
      permissions,
      can: (permission: Permission | string) => set.has(permission),
      canAny: (...perms: Array<Permission | string>) => perms.some((p) => set.has(p)),
      canAll: (...perms: Array<Permission | string>) => perms.every((p) => set.has(p)),
    }
  }, [permissions])
}
