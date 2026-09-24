import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { usePermissions } from '../hooks/usePermissions'
import { homePathForPermissions, type Permission } from '../permissions'
import { useAuth } from '../context/AuthContext'

export function RequirePermission({
  permission,
  anyOf,
}: {
  permission?: Permission | string
  anyOf?: Array<Permission | string>
}) {
  const { user, loading } = useAuth()
  const { can, canAny, permissions } = usePermissions()
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
