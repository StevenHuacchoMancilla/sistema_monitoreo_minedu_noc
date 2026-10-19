import { useEffect, useState } from 'react'

/** Reloj que re-renderiza cada `intervalMs`. Se pausa con la pestaña oculta (anti-freeze). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let id: number | null = null

    const tick = () => setNow(Date.now())

    const start = () => {
      if (id !== null) return
      id = window.setInterval(tick, intervalMs)
    }

    const stop = () => {
      if (id === null) return
      window.clearInterval(id)
      id = null
    }

    const onVisibility = () => {
      if (document.hidden) {
        stop()
        return
      }
      tick()
      start()
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [intervalMs])

  return now
}
