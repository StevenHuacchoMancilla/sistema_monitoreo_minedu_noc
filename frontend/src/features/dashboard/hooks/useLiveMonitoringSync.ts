import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'

/**
 * Sincroniza PRTG/Cloudnet en segundo plano y refresca el dashboard
 * sin necesidad de pulsar botones.
 */
export function useLiveMonitoringSync(options?: {
  prtgMs?: number
  cloudnetMs?: number
  enabled?: boolean
}) {
  const client = useQueryClient()
  const prtgMs = options?.prtgMs ?? 30_000
  const cloudnetMs = options?.cloudnetMs ?? 300_000
  const enabled = options?.enabled ?? true
  const prtgBusy = useRef(false)
  const cloudBusy = useRef(false)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false

    const invalidate = async () => {
      await client.invalidateQueries({ queryKey: ['dashboard'] })
    }

    const syncPrtg = async () => {
      if (prtgBusy.current || cancelled) return
      prtgBusy.current = true
      try {
        await endpoints.syncPrtg()
        if (!cancelled) await invalidate()
      } catch {
        // silencioso: el próximo ciclo reintentará
      } finally {
        prtgBusy.current = false
      }
    }

    const syncCloudnet = async () => {
      if (cloudBusy.current || cancelled) return
      cloudBusy.current = true
      try {
        await endpoints.syncCloudnet()
        if (!cancelled) await invalidate()
      } catch {
        // silencioso
      } finally {
        cloudBusy.current = false
      }
    }

    // Primera sync tras montar (no bloquea UI)
    const boot = window.setTimeout(() => {
      void syncPrtg()
    }, 2_000)

    const prtgTimer = window.setInterval(() => {
      void syncPrtg()
    }, prtgMs)

    const cloudTimer = window.setInterval(() => {
      void syncCloudnet()
    }, cloudnetMs)

    return () => {
      cancelled = true
      window.clearTimeout(boot)
      window.clearInterval(prtgTimer)
      window.clearInterval(cloudTimer)
    }
  }, [client, prtgMs, cloudnetMs, enabled])
}
