import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CheckCircle2, ChevronDown, ChevronUp, ImageDown, TriangleAlert, X } from 'lucide-react'
import { formatDateTime, formatDuration } from '../../../lib/datetime'
import { usePermissions } from '../../auth/hooks/usePermissions'
import { P } from '../../auth/permissions'
import { useLiveEvents } from '../hooks/useLiveEvents'
import { downloadRestorationsPng } from '../lib/downloadRestorationsPng'
import type { LiveEventRow } from '../types'

const SEEN_KEY = 'noc.live-events.seen'
const WINDOW_MINUTES = 60

function loadSeen(): Set<string> {
  try {
    const raw = sessionStorage.getItem(SEEN_KEY)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as string[]
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

function saveSeen(ids: Set<string>) {
  try {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-300)))
  } catch {
    /* ignore */
  }
}

/**
 * Aviso flotante claro: caídas y restablecimientos juntos, sin tapar la pantalla.
 */
export function LiveOpsToastDock() {
  const { can } = usePermissions()
  const canSee = can(P.recoveriesView) || can(P.incidentsView)
  const navigate = useNavigate()
  const query = useLiveEvents(WINDOW_MINUTES, 20_000, canSee)
  const [queue, setQueue] = useState<LiveEventRow[]>([])
  const [expanded, setExpanded] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const seenRef = useRef<Set<string>>(loadSeen())
  const seededRef = useRef(false)

  useEffect(() => {
    if (!query.isSuccess) return
    const outages = query.data?.outages ?? []
    const restorations = query.data?.restorations ?? []
    const all = [...outages, ...restorations]

    if (!seededRef.current) {
      seededRef.current = true
      if (seenRef.current.size === 0) {
        for (const row of all) seenRef.current.add(row.id)
        saveSeen(seenRef.current)
      }
      return
    }

    const fresh = all.filter((row) => !seenRef.current.has(row.id))
    if (fresh.length === 0) return

    setQueue((prev) => {
      const ids = new Set(prev.map((row) => row.id))
      const merged = [...fresh.filter((row) => !ids.has(row.id)), ...prev]
      return merged
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'outage' ? -1 : 1
          const aAt = Date.parse((a.kind === 'restoration' ? a.recovered_at : a.started_at) ?? '')
          const bAt = Date.parse((b.kind === 'restoration' ? b.recovered_at : b.started_at) ?? '')
          return (Number.isNaN(bAt) ? 0 : bAt) - (Number.isNaN(aAt) ? 0 : aAt)
        })
        .slice(0, 30)
    })
    setExpanded(true)
  }, [query.data, query.isSuccess])

  const downs = useMemo(() => queue.filter((row) => row.kind === 'outage'), [queue])
  const ups = useMemo(() => queue.filter((row) => row.kind === 'restoration'), [queue])

  if (!canSee || queue.length === 0) return null

  const markSeen = (ids: string[]) => {
    for (const id of ids) seenRef.current.add(id)
    saveSeen(seenRef.current)
  }

  const dismissAll = () => {
    markSeen(queue.map((row) => row.id))
    setQueue([])
    setExportError(null)
  }

  const dismissOne = (id: string) => {
    markSeen([id])
    setQueue((prev) => prev.filter((row) => row.id !== id))
  }

  const exportImage = async () => {
    if (ups.length === 0) {
      setExportError('Para exportar imagen de restablecimientos abre Restablecimientos o Recuperados.')
      return
    }
    setExporting(true)
    setExportError(null)
    try {
      await downloadRestorationsPng({
        rows: ups,
        windowMinutes: query.data?.meta.window_minutes ?? WINDOW_MINUTES,
      })
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'No se pudo exportar la imagen.')
    } finally {
      setExporting(false)
    }
  }

  const titleParts: string[] = []
  if (downs.length === 1) titleParts.push(`Se cayó ${downs[0]?.local_educativo ?? `CID ${downs[0]?.cid ?? ''}`}`)
  else if (downs.length > 1) titleParts.push(`Se cayeron ${downs.length} colegios`)
  if (ups.length === 1) titleParts.push(`Se restableció ${ups[0]?.local_educativo ?? `CID ${ups[0]?.cid ?? ''}`}`)
  else if (ups.length > 1) titleParts.push(`Se restablecieron ${ups.length} colegios`)
  const title = titleParts.join(' · ')

  const mixed = downs.length > 0 && ups.length > 0
  const accentBar = mixed ? 'bg-amber-400' : downs.length > 0 ? 'bg-red-500' : 'bg-emerald-500'
  const iconWrap = mixed
    ? 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800'
    : downs.length > 0
      ? 'bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/60 dark:text-red-300 dark:ring-red-800'
      : 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:ring-emerald-800'

  return (
    <div className="pointer-events-none fixed right-3 bottom-3 z-[60] w-[min(26rem,calc(100vw-1.5rem))] sm:right-5 sm:bottom-5">
      <div className="pointer-events-auto overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 text-slate-900 shadow-[0_18px_50px_-20px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/5 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-50 dark:ring-white/10">
        <div className={`h-1 w-full ${accentBar}`} aria-hidden />
        <div className="flex items-start gap-2.5 px-3.5 py-3">
          <span className={`mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ${iconWrap}`}>
            {downs.length > 0 && ups.length === 0 ? (
              <TriangleAlert className="h-4 w-4" aria-hidden />
            ) : (
              <CheckCircle2 className="h-4 w-4" aria-hidden />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold tracking-[0.14em] text-slate-500 uppercase dark:text-slate-400">
              {mixed ? 'Caídas y restablecimientos' : downs.length > 0 ? 'Caída' : 'Restablecimiento'}
            </p>
            <p className="mt-0.5 text-[13px] font-semibold leading-snug text-slate-900 dark:text-slate-50">{title}</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label={expanded ? 'Contraer' : 'Expandir'}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </button>
          <button
            type="button"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Cerrar avisos"
            onClick={dismissAll}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {expanded ? (
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {queue.map((row) => {
              const down = row.kind === 'outage'
              return (
                <li
                  key={row.id}
                  className={`flex items-start gap-2 px-3.5 py-2.5 ${
                    down ? 'bg-red-50/40 dark:bg-red-950/20' : 'bg-emerald-50/40 dark:bg-emerald-950/20'
                  }`}
                >
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${down ? 'bg-red-500' : 'bg-emerald-500'}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-900 dark:text-slate-50">
                      {down ? 'Se cayó' : 'Se restableció'}
                      {': '}
                      {row.cid ? `CID ${row.cid}` : 'Sin CID'}
                      {row.local_educativo ? ` · ${row.local_educativo}` : ''}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {down
                        ? row.started_at
                          ? formatDateTime(row.started_at)
                          : '—'
                        : row.recovered_at
                          ? formatDateTime(row.recovered_at)
                          : '—'}
                      {' · '}
                      {row.duration ?? formatDuration(row.duration_seconds)}
                      {row.pendiente_cierre ? ' · Pendiente de cierre' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={`shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold hover:bg-white/70 dark:hover:bg-slate-800 ${
                      down ? 'text-red-700 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
                    }`}
                    onClick={() => {
                      dismissOne(row.id)
                      navigate(row.href)
                    }}
                  >
                    Ver
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    aria-label="Descartar"
                    onClick={() => dismissOne(row.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/80 px-3.5 py-2 dark:border-slate-800 dark:bg-slate-950/50">
          {downs.length > 0 ? (
            <Link
              to="/incidents/total"
              className="text-[12px] font-semibold text-red-700 hover:text-red-800 dark:text-red-300 dark:hover:text-red-200"
              onClick={dismissAll}
            >
              Caídas totales
            </Link>
          ) : null}
          {ups.length > 0 ? (
            <Link
              to="/restorations"
              className="text-[12px] font-semibold text-emerald-700 hover:text-emerald-800 dark:text-emerald-300"
              onClick={dismissAll}
            >
              Restablecimientos
            </Link>
          ) : null}
          {ups.length > 0 ? (
            <button
              type="button"
              disabled={exporting}
              onClick={() => void exportImage()}
              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[12px] font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-60"
            >
              <ImageDown className="h-3.5 w-3.5" aria-hidden />
              {exporting ? 'Exportando…' : 'Exportar imagen'}
            </button>
          ) : null}
        </div>
        {exportError ? <p className="px-3.5 pb-2 text-[11px] text-red-600 dark:text-red-300">{exportError}</p> : null}
      </div>
    </div>
  )
}
