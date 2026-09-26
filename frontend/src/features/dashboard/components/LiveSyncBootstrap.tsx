import { useAuth } from '../../auth/context/AuthContext'
import { useLiveMonitoringSync } from '../hooks/useLiveMonitoringSync'

/** Arranca sync PRTG en vivo (estilo monitoring:watch) con sesión autenticada. */
export function LiveSyncBootstrap() {
  const { user, loading } = useAuth()
  useLiveMonitoringSync({
    prtgMs: 30_000,
    enabled: !loading && user !== null,
  })
  return null
}
