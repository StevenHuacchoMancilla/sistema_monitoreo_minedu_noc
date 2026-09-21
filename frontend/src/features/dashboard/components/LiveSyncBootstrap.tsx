import { useLiveMonitoringSync } from '../hooks/useLiveMonitoringSync'

/** Arranca sync PRTG/Cloudnet en vivo para toda la app. */
export function LiveSyncBootstrap() {
  useLiveMonitoringSync({
    prtgMs: 30_000,
    cloudnetMs: 300_000,
    enabled: true,
  })
  return null
}
