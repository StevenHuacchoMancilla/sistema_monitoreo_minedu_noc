import { formatDuration, formatRelativeDateTime } from '../../../lib/fechaHora'
import type { SolicitudesEnlaceResponse, SolicitudColegio } from '../types/solicitudes'

function esc(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function modeLabel(mode: SolicitudColegio['caidas_modo'], days: number): string {
  if (mode === 'semana') return `Caídas reales de Ping en los últimos ${days} días`
  if (mode === 'mes') return 'Sin caída en 7 días · última del mes anterior'
  return 'Sin caída real de Ping'
}

function schoolHtml(school: SolicitudColegio, windowDays: number): string {
  const down = school.estado === 'CAIDO'
  const activo = school.sin_caidas
    ? 'Sin caídas de Ping en 120 días'
    : `${school.activo_desde ? esc(formatRelativeDateTime(school.activo_desde)) : '—'} · hace ${esc(formatDuration(school.activo_segundos))}`
  const statusLine = down
    ? `Caído hace ${esc(formatDuration(school.caido_segundos))}${school.caido_desde ? ` · desde ${esc(formatRelativeDateTime(school.caido_desde))}` : ''}`
    : school.sin_caidas
      ? 'Flujo continuo · sin corte de Ping'
      : `Activo continuo hace ${esc(formatDuration(school.activo_segundos))}`

  const falls =
    school.caidas.length === 0
      ? `<p class="muted">No hay Ping caído en los últimos 7 días ni en el mes anterior.</p>`
      : `<table>
          <thead><tr><th>Inicio</th><th>Fin</th><th>Duración</th><th>Estado</th></tr></thead>
          <tbody>
            ${school.caidas
              .map(
                (fall) => `<tr>
                  <td>${esc(formatRelativeDateTime(fall.inicio))}</td>
                  <td>${fall.abierta ? 'Sigue caído' : esc(formatRelativeDateTime(fall.fin))}</td>
                  <td>${esc(formatDuration(fall.duracion_segundos))}</td>
                  <td>${fall.abierta ? 'Abierta' : 'Recuperada'}</td>
                </tr>`,
              )
              .join('')}
          </tbody>
        </table>`

  return `<article class="card">
    <header>
      <div>
        <strong class="cid">${esc(school.cid)}</strong>
        <span class="badge ${down ? 'down' : 'up'}">${esc(school.estado_label)}</span>
      </div>
      <div class="title">${esc(school.local_educativo ?? 'Sin nombre')}</div>
      <div class="muted">${esc([school.codigo_local ? `Cód. ${school.codigo_local}` : null, school.distrito, school.provincia].filter(Boolean).join(' · ') || '—')}</div>
    </header>
    <div class="grid">
      <div><div class="label">Enlaces</div><div>Primario ${esc(school.nodo_primario ?? '—')}</div><div class="muted">Secundario ${esc(school.nodo_secundario ?? 'Sin enlace')}</div></div>
      <div><div class="label">Activo desde</div><div>${activo}</div><div class="muted">Desde la última recuperación real</div></div>
      <div><div class="label">${down ? 'Caído' : 'Flujo continuo'}</div><div>${statusLine}</div></div>
    </div>
    <div class="label" style="margin-top:10px">${esc(modeLabel(school.caidas_modo, windowDays))} · ${school.caidas.length}</div>
    ${falls}
  </article>`
}

export function descargarSolicitudesPdf(data: SolicitudesEnlaceResponse): void {
  const windowDays = data.window_days ?? 7
  const generated = data.generated_at
    ? formatRelativeDateTime(data.generated_at)
    : new Date().toLocaleString('es-PE')

  const body = data.groups
    .map(
      (group) => `<section>
        <h2>${esc(group.label)} <span class="count">${group.total}</span></h2>
        <p class="muted">${esc(group.hint)}</p>
        ${group.schools.map((school) => schoolHtml(school, windowDays)).join('') || '<p class="muted">Sin colegios.</p>'}
      </section>`,
    )
    .join('')

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Solicitudes Providencia / Santa Cruz</title>
  <style>
    @page { size: A4; margin: 14mm; }
    body { font-family: Segoe UI, Arial, sans-serif; color: #0f172a; font-size: 12px; margin: 0; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 18px 0 4px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
    .sub { color: #475569; margin-bottom: 14px; }
    .count { display: inline-block; background: #e2e8f0; border-radius: 999px; padding: 1px 8px; font-size: 11px; }
    .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 10px 12px; margin: 8px 0; page-break-inside: avoid; }
    .cid { font-family: ui-monospace, Consolas, monospace; margin-right: 8px; }
    .badge { display: inline-block; border-radius: 999px; padding: 1px 8px; font-size: 10px; font-weight: 700; }
    .badge.up { background: #dcfce7; color: #166534; }
    .badge.down { background: #fee2e2; color: #991b1b; }
    .title { font-weight: 700; margin-top: 4px; }
    .muted { color: #64748b; }
    .label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; letter-spacing: .04em; }
    .grid { display: grid; grid-template-columns: 1fr 1fr 1.2fr; gap: 8px; margin-top: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th, td { border: 1px solid #e2e8f0; padding: 4px 6px; text-align: left; }
    th { background: #f8fafc; font-size: 10px; text-transform: uppercase; color: #64748b; }
    .actions { margin: 12px 0 18px; }
    button { background: #1d4ed8; color: #fff; border: 0; border-radius: 8px; padding: 8px 14px; font-weight: 700; cursor: pointer; }
    @media print { .actions { display: none; } }
  </style>
</head>
<body>
  <div class="actions"><button onclick="window.print()">Guardar / imprimir PDF</button></div>
  <h1>Solicitudes · Providencia / Santa Cruz</h1>
  <p class="sub">Fuente sensor Ping PRTG · ${esc(generated)} · ${data.total} colegios · ventana ${windowDays} días</p>
  ${body}
  <script>window.addEventListener('load', () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank', 'noopener,noreferrer')
  if (!win) {
    const a = document.createElement('a')
    a.href = url
    a.download = `solicitudes_providencia_santa_cruz_${new Date().toISOString().slice(0, 10)}.html`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
