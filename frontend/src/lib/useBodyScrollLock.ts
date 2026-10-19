import { useEffect } from 'react'

let lockCount = 0

/** Ref-counted body scroll lock (safe with multiple modals). */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return

    lockCount += 1
    if (lockCount === 1) {
      document.body.style.overflow = 'hidden'
    }

    return () => {
      lockCount = Math.max(0, lockCount - 1)
      if (lockCount === 0) {
        document.body.style.overflow = ''
      }
    }
  }, [locked])
}
