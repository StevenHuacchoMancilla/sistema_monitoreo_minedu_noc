import { useAuth } from '../../auth/context/AuthContext'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { P } from '../../auth/permissions'
import { useLiveMonitoringSync } from '../hooks/useLiveMonitoringSync'

/** Arranca sync PRTG en vivo (estilo monitoring:watch) con sesión autenticada. */
export function LiveSyncBootstrap() {
  const { user, loading } = useAuth()
  const { can } = usePermissions()
  useLiveMonitoringSync({
    prtgMs: 45_000,
    enabled: !loading && user !== null && can(P.syncRun),
  })
  return null
}
