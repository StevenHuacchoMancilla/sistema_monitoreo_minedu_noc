import { useAuth } from '../../auth/context/AuthContext'
import { useLiveMonitoringSync } from '../hooks/useLiveMonitoringSync'

/** Arranca sync PRTG/Cloudnet en vivo solo con sesión autenticada. */
export function LiveSyncBootstrap() {
  const { user, loading } = useAuth()
  useLiveMonitoringSync({
    prtgMs: 120_000,
    cloudnetMs: 300_000,
    enabled: !loading && user !== null,
  })
  return null
}
