import { createRoot, type Root } from 'react-dom/client'
import { toPng } from 'html-to-image'
import { PlantillaReporteServicio, type ReporteServicioFila } from '../components/PlantillaReporteServicio'

function stampFilename(kind: 'corte' | 'restablecido', date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`
  return kind === 'restablecido' ? `restablecimiento_${stamp}.png` : `corte_servicio_${stamp}.png`
}

export async function descargarReporteServicioPng(opts: {
  kind: 'corte' | 'restablecido'
  rows: ReporteServicioFila[]
  responsable: string
}): Promise<void> {
  if (opts.rows.length === 0) {
    throw new Error('Selecciona al menos un colegio.')
  }

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    pointerEvents: 'none',
    opacity: '1',
    zIndex: '-1',
  })
  document.body.appendChild(host)

  let root: Root | null = createRoot(host)
  const generatedAt = new Date()

  try {
    await new Promise<void>((resolve) => {
      root!.render(
        <PlantillaReporteServicio kind={opts.kind} rows={opts.rows} responsable={opts.responsable} />,
      )
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    await new Promise((wait) => setTimeout(wait, 80))

    const target = host.querySelector('[data-reporte-servicio]') as HTMLElement | null
    if (!target) throw new Error('No se pudo preparar la imagen.')

    const dataUrl = await toPng(target, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: opts.kind === 'restablecido' ? '#052e1f' : '#2a0b0b',
      width: target.scrollWidth,
      height: target.scrollHeight,
    })

    const link = document.createElement('a')
    link.href = dataUrl
    link.download = stampFilename(opts.kind, generatedAt)
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    root?.unmount()
    root = null
    host.remove()
  }
}
