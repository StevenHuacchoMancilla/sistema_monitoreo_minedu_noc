import { useEffect, useRef } from 'react'
import { endpoints } from '../../../api/endpoints'

const TAB_LOCK_KEY = 'noc:live-sync-leader'
const TAB_LOCK_TTL_MS = 45_000
/** Producto: no menos de 45s entre disparos (antes 30s agravaba el freeze). */
const MIN_PRTG_MS = 45_000

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
 * Sync PRTG en vivo. Pausa total con pestaña oculta (vuelves de Cursor → no dispara sync).
 * No invalida React Query: las páginas ya hacen refetchInterval propio.
 */
export function useLiveMonitoringSync(options?: {
  prtgMs?: number
  enabled?: boolean
}) {
  // Default 45s; LiveSyncBootstrap puede pedir 30s — respetamos el mínimo.
  const prtgMs = Math.max(MIN_PRTG_MS, options?.prtgMs ?? MIN_PRTG_MS)
  const enabled = options?.enabled ?? true
  const prtgBusy = useRef(false)

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    let wake: (() => void) | null = null

    const waitWhileHidden = async () => {
      while (!cancelled && document.hidden) {
        await new Promise<void>((resolve) => {
          wake = resolve
          const onVis = () => {
            if (!document.hidden) {
              document.removeEventListener('visibilitychange', onVis)
              wake?.()
              wake = null
            }
          }
          document.addEventListener('visibilitychange', onVis)
        })
        // Al volver a la pestaña, esperar un poco para no saturar el hilo principal.
        if (!cancelled) await sleep(4_000)
      }
    }

    const syncPrtg = async () => {
      if (prtgBusy.current || cancelled || document.hidden) return
      if (!tryClaimTabLeadership()) return

      renewTabLeadership()
      prtgBusy.current = true
      const hangTimer = window.setTimeout(() => {
        prtgBusy.current = false
      }, 25_000)

      try {
        await endpoints.syncPrtg()
      } catch {
        // silencioso
      } finally {
        window.clearTimeout(hangTimer)
        prtgBusy.current = false
      }
    }

    const runLoop = async () => {
      await sleep(5_000)
      while (!cancelled) {
        await waitWhileHidden()
        if (cancelled) break
        await syncPrtg()
        if (cancelled) break
        await sleep(prtgMs)
      }
    }

    const heartbeat = window.setInterval(() => {
      if (document.hidden) return
      if (tryClaimTabLeadership()) renewTabLeadership()
    }, 25_000)

    void runLoop()

    return () => {
      cancelled = true
      wake?.()
      window.clearInterval(heartbeat)
      prtgBusy.current = false
    }
  }, [prtgMs, enabled])
}
