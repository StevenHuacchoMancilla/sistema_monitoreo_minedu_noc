import { useAuth } from '../../auth/context/ContextoAuth'
import { usePermisos } from '../../auth/hooks/usePermisos'
import { P } from '../../auth/permisos'
import { useSyncMonitoreoEnVivo } from '../hooks/useSyncMonitoreoEnVivo'

/** Arranca sync PRTG en vivo (estilo monitoring:watch) con sesión autenticada. */
export function ArranqueSyncEnVivo() {
  const { user, loading } = useAuth()
  const { can } = usePermisos()
  useSyncMonitoreoEnVivo({
    prtgMs: 45_000,
    enabled: !loading && user !== null && can(P.syncRun),
  })
  return null
}
