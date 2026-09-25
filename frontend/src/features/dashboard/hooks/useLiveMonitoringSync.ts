import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'

const TAB_LOCK_KEY = 'noc:live-sync-leader'
const TAB_LOCK_TTL_MS = 90_000

const tabId =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`

function tryClaimTabLeadership(): boolean {
  try {
    const now = Date.now()
    const raw = localStorage.getItem(TAB_LOCK_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as { id?: string; until?: number }
      if (parsed.until && parsed.until > now && parsed.id !== tabId) {
        return false
      }
    }
    localStorage.setItem(TAB_LOCK_KEY, JSON.stringify({ id: tabId, until: now + TAB_LOCK_TTL_MS }))
    return true
  } catch {
    return true
  }
}

function renewTabLeadership(): void {
  try {
    localStorage.setItem(
      TAB_LOCK_KEY,
      JSON.stringify({ id: tabId, until: Date.now() + TAB_LOCK_TTL_MS }),
    )
  } catch {
    // ignore
  }
}

/**
 * Mantiene PRTG/Cloudnet al día sin martillar la API.
 * Solo una pestaña del navegador dispara sync; el resto solo refresca datos.
 */
export function useLiveMonitoringSync(options?: {
  prtgMs?: number
  cloudnetMs?: number
  enabled?: boolean
}) {
  const client = useQueryClient()
  // 2 min PRTG / 5 min Cloudnet: suficiente para NOC y evita solapes/timeouts.
  const prtgMs = options?.prtgMs ?? 120_000
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
      if (!tryClaimTabLeadership()) {
        await invalidate()
        return
      }
      renewTabLeadership()
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
      if (!tryClaimTabLeadership()) return
      renewTabLeadership()
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
    }, 3_000)

    const prtgTimer = window.setInterval(() => {
      void syncPrtg()
    }, prtgMs)

    const cloudTimer = window.setInterval(() => {
      void syncCloudnet()
    }, cloudnetMs)

    const heartbeat = window.setInterval(() => {
      if (tryClaimTabLeadership()) renewTabLeadership()
    }, 30_000)

    return () => {
      cancelled = true
      window.clearTimeout(boot)
      window.clearInterval(prtgTimer)
      window.clearInterval(cloudTimer)
      window.clearInterval(heartbeat)
    }
  }, [client, prtgMs, cloudnetMs, enabled])
}
