import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { usePermisos } from '../hooks/usePermisos'
import { homePathForPermissions, type Permission } from '../permisos'
import { useAuth } from '../context/ContextoAuth'

export function RequierePermiso({
  permission,
  anyOf,
}: {
  permission?: Permission | string
  anyOf?: Array<Permission | string>
}) {
  const { user, loading } = useAuth()
  const { can, canAny, permissions } = usePermisos()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-sm font-medium text-slate-500">Verificando permisos…</p>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  const allowed = permission ? can(permission) : anyOf ? canAny(...anyOf) : false
  if (!allowed) {
    return <Navigate to={homePathForPermissions(permissions)} replace />
  }

  return <Outlet />
}
