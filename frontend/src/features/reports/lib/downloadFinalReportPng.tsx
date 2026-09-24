import { createRoot, type Root } from 'react-dom/client'
import { toPng } from 'html-to-image'
import { FinalReportImageTemplate } from '../components/FinalReportImageTemplate'
import type { ReportRow } from '../types/operationalReport'

function stampFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const min = pad(date.getMinutes())
  const s = pad(date.getSeconds())
  return `informe_final_contacto_confirmado_${y}${m}${d}_${h}${min}${s}.png`
}

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/**
 * Renderiza el template fuera de pantalla (ancho completo) y exporta PNG.
 * No captura la tabla con scroll de la UI.
 */
export async function downloadFinalReportPng(rows: ReportRow[]): Promise<void> {
  if (rows.length === 0) {
    throw new Error('No hay registros para exportar.')
  }

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '2480px',
    pointerEvents: 'none',
    opacity: '1',
    zIndex: '-1',
  })
  document.body.appendChild(host)

  let root: Root | null = createRoot(host)
  const generatedAt = new Date()

  try {
    await new Promise<void>((resolve) => {
      root!.render(<FinalReportImageTemplate rows={rows} generatedAt={generatedAt} />)
      // Esperar paint + fuentes
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })

    // Dar tiempo a layout/imagen de fuentes
    await new Promise((r) => setTimeout(r, 80))

    const target = host.querySelector('[data-final-report-image]') as HTMLElement | null
    if (!target) {
      throw new Error('No se pudo preparar la plantilla del informe.')
    }

    const dataUrl = await toPng(target, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#06101F',
      width: target.scrollWidth,
      height: target.scrollHeight,
      style: {
        transform: 'none',
        margin: '0',
      },
    })

    downloadDataUrl(dataUrl, stampFilename(generatedAt))
  } finally {
    root?.unmount()
    root = null
    host.remove()
  }
}
