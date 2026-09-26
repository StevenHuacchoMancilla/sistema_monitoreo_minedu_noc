import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { endpoints } from '../../../api/endpoints'

const TAB_LOCK_KEY = 'noc:live-sync-leader'
const TAB_LOCK_TTL_MS = 45_000

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

/**
 * Equivalente web a `php artisan monitoring:watch` (sin Cron de pago).
 * Solo sync PRTG. Una pestaña dispara; el servidor responde al instante y termina
 * el trabajo en background (evita timeout del proxy Vercel).
 */
export function useLiveMonitoringSync(options?: {
  prtgMs?: number
  enabled?: boolean
}) {
  const client = useQueryClient()
  const prtgMs = options?.prtgMs ?? 30_000
  const enabled = options?.enabled ?? true
  const prtgBusy = useRef(false)

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
        await sleep(8_000)
        if (!cancelled) await invalidate()
      } catch {
        // silencioso: el próximo ciclo reintentará
      } finally {
        prtgBusy.current = false
      }
    }

    const runPrtgLoop = async () => {
      await sleep(1_500)
      while (!cancelled) {
        await syncPrtg()
        if (cancelled) break
        await sleep(prtgMs)
      }
    }

    const refreshTimer = window.setInterval(() => {
      void invalidate()
    }, 20_000)

    const heartbeat = window.setInterval(() => {
      if (tryClaimTabLeadership()) renewTabLeadership()
    }, 15_000)

    void runPrtgLoop()

    return () => {
      cancelled = true
      window.clearInterval(refreshTimer)
      window.clearInterval(heartbeat)
    }
  }, [client, prtgMs, enabled])
}
