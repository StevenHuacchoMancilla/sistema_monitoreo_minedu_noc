import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock3, ImagePlus, MessageSquareText, ScrollText, X } from 'lucide-react'
import { endpoints } from '../../../api/endpoints'
import { formatDateTime } from '../../../lib/fechaHora'
import type { IncidentAttachment, IncidentDetail } from '../../../types/api'

export type ComentariosPanelKind = 'detalle' | 'evento'

export type ComentariosPanelState = {
  incidentId: number
  kind: ComentariosPanelKind
  cid?: string | null
  local?: string | null
  ticket?: string | null
}

type TimelineEntry = { at?: string; text: string; by?: string | null }

function stripSystemPrefix(text: string): string {
  return text.replace(/^(Caída de enlace|Queja|Requerimiento|Gestión)[^\n]*·\s*/iu, '').trim()
}

function buildGestionTimeline(detail: IncidentDetail): TimelineEntry[] {
  const managements = [...(detail.managements ?? [])].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
  const entries: TimelineEntry[] = []
  const seen = new Set<string>()

  for (const m of managements) {
    const raw = stripSystemPrefix(String(m.detail || m.observation || '').trim())
    if (!raw) continue
    const key = raw.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    entries.push({
      at: m.created_at ? formatDateTime(m.created_at) : undefined,
      text: raw,
      by: m.created_by_name ?? null,
    })
  }

  if (entries.length > 0) return entries

  const fallback = stripSystemPrefix(String(detail.gestion?.detail_text || detail.gestion?.outage_text || '').trim())
  if (fallback) return [{ text: fallback }]
  return []
}

function eventBody(detail: IncidentDetail): string {
  const ticket = detail.ticket
  if (!ticket) return ''
  if (ticket.event_detail?.trim()) return ticket.event_detail.trim()
  const parts: string[] = []
  if (ticket.technician_name) parts.push(`Técnico: ${ticket.technician_name}`)
  if (ticket.visit_reason) parts.push(`Motivo: ${ticket.visit_reason}`)
  if (ticket.activities) parts.push(`Actividades: ${ticket.activities}`)
  if (ticket.materials) parts.push(`Materiales: ${ticket.materials}`)
  return parts.join('\n')
}

function MetaChip({ label }: { label?: string | null }) {
  if (!label || label === '—') return null
  return (
    <span className="inline-flex max-w-[10rem] truncate rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {label}
    </span>
  )
}

export function PanelComentariosIncidente({
  panel,
  onClose,
  showEvidence = false,
}: {
  panel: ComentariosPanelState
  onClose: () => void
  /** Histórico de tickets: fotos subidas como evidencia, en la misma franja. */
  showEvidence?: boolean
}) {
  const detail = useQuery({
    queryKey: ['incidents', 'detail', panel.incidentId, 'comentarios-panel'],
    queryFn: () => endpoints.incidentDetail(panel.incidentId),
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const data = detail.data
  const entries = data && panel.kind === 'detalle' ? buildGestionTimeline(data) : []
  const evento = data && panel.kind === 'evento' ? eventBody(data) : ''
  const ticketCode = data?.ticket?.ticket_code ?? panel.ticket ?? null
  const cid = data?.colegio?.cid ?? data?.ticket?.cid ?? panel.cid ?? '—'
  const local = data?.colegio?.local_educativo ?? data?.ticket?.school_name ?? panel.local ?? '—'

  return createPortal(
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button type="button" className="absolute inset-0 bg-slate-950/55 backdrop-blur-[2px]" aria-label="Cerrar" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-slate-50 shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:max-w-lg">
        <header className="border-b border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 inline-flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    panel.kind === 'detalle'
                      ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200'
                      : 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200'
                  }`}
                >
                  {panel.kind === 'detalle' ? (
                    <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <ScrollText className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {panel.kind === 'detalle' ? 'Detalle de gestión' : 'Detalle de evento'}
                </span>
              </div>
              <h2 className="truncate font-mono text-sm font-bold text-slate-900 dark:text-slate-50" title={ticketCode ?? undefined}>
                {ticketCode || 'Sin ticket'}
              </h2>
              <p className="mt-1 truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">
                CID {cid} · {local}
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-100"
              onClick={onClose}
              aria-label="Cerrar panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <MetaChip label={data?.colegio?.provincia} />
            <MetaChip label={data?.colegio?.distrito} />
            <MetaChip label={data?.colegio?.tecnologia} />
            <MetaChip label={data?.gestion?.minedu_reason_label} />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {detail.isLoading ? (
            <p className="text-sm text-slate-500">Cargando comentarios…</p>
          ) : detail.isError ? (
            <p className="text-sm font-semibold text-red-600">No se pudo cargar el detalle.</p>
          ) : panel.kind === 'detalle' ? (
            entries.length > 0 ? (
              <ol className="relative space-y-0 border-l border-noc-border pl-5">
                {entries.map((entry, i) => (
                  <li key={`${entry.at ?? ''}-${i}`} className="relative pb-5 last:pb-0">
                    <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-noc-surface bg-noc-copper" />
                    {entry.at ? (
                      <p className="mb-1 inline-flex flex-wrap items-center gap-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                        <Clock3 className="h-3 w-3" aria-hidden />
                        {entry.at}
                        {entry.by ? <span className="font-medium normal-case text-slate-400">· {entry.by}</span> : null}
                      </p>
                    ) : null}
                    <div className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      {entry.text}
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                kind="detalle"
                hint="Todavía no hay comentarios de gestión del operador NOC o admin."
              />
            )
          ) : evento ? (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 text-[13px] leading-relaxed text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
              <pre className="whitespace-pre-wrap break-words font-sans">{evento}</pre>
            </div>
          ) : (
            <EmptyState
              kind="evento"
              hint="Este caso aún no tiene Detalle de evento (visita técnica / informe)."
            />
          )}
          {showEvidence && data ? <EvidenceStrip attachments={data.attachments ?? []} /> : null}
        </div>

        {data?.gestion?.cause ? (
          <footer className="border-t border-slate-200 bg-white px-5 py-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-[10px] font-semibold tracking-wide text-slate-400 uppercase">Causa raíz</p>
            <p className="mt-0.5 text-[13px] text-slate-700 dark:text-slate-300">{data.gestion.cause}</p>
          </footer>
        ) : null}
      </aside>
    </div>,
    document.body,
  )
}

function EvidenceStrip({ attachments }: { attachments: IncidentAttachment[] }) {
  const [preview, setPreview] = useState<IncidentAttachment | null>(null)
  const photos = attachments.filter((item) => !item.mime || item.mime.startsWith('image/'))

  return (
    <section className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-800">
      <h3 className="mb-3 inline-flex items-center gap-1.5 text-[12px] font-bold tracking-wide text-slate-500 uppercase">
        <ImagePlus className="h-3.5 w-3.5" aria-hidden />
        Evidencias
        <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {photos.length}
        </span>
      </h3>
      {photos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-[13px] text-slate-500 dark:border-slate-700">
          No se subieron imágenes en este ticket.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2">
          {photos.map((item) => (
            <li key={item.id} className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                className="block w-full bg-slate-100 text-left dark:bg-slate-900"
                onClick={() => setPreview(item)}
              >
                <img src={item.url} alt={item.original_name} className="h-28 w-full object-cover" loading="lazy" />
              </button>
              <p className="truncate px-2 py-1.5 text-[11px] text-slate-600 dark:text-slate-300" title={item.original_name}>
                {item.original_name}
              </p>
            </li>
          ))}
        </ul>
      )}
      {preview ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/80 p-4" onClick={() => setPreview(null)}>
          <button
            type="button"
            className="absolute top-4 right-4 rounded-lg bg-white/10 p-2 text-white"
            aria-label="Cerrar imagen"
            onClick={() => setPreview(null)}
          >
            <X className="h-4 w-4" />
          </button>
          <img
            src={preview.url}
            alt={preview.original_name}
            className="max-h-[85vh] max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  )
}

function EmptyState({ kind, hint }: { kind: ComentariosPanelKind; hint: string }) {
  return (
    <div className="flex h-full min-h-[12rem] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 text-center dark:border-slate-700 dark:bg-slate-900/50">
      <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
        {kind === 'detalle' ? <MessageSquareText className="h-5 w-5" /> : <ScrollText className="h-5 w-5" />}
      </div>
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sin contenido</p>
      <p className="mt-1 max-w-xs text-[13px] text-slate-500">{hint}</p>
    </div>
  )
}
