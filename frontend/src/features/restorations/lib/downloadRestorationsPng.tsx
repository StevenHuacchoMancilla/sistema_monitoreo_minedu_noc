import { createRoot, type Root } from 'react-dom/client'
import { toPng } from 'html-to-image'
import { RestorationImageTemplate } from '../components/RestorationImageTemplate'
import type { RestorationRow } from '../types'

function stampFilename(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const min = pad(date.getMinutes())
  return `restablecimientos_${y}${m}${d}_${h}${min}.png`
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

export async function downloadRestorationsPng(opts: {
  rows: RestorationRow[]
  windowMinutes: number
}): Promise<void> {
  if (opts.rows.length === 0) {
    throw new Error('No hay restablecimientos para exportar.')
  }

  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '1600px',
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
        <RestorationImageTemplate
          rows={opts.rows}
          windowMinutes={opts.windowMinutes}
          generatedAt={generatedAt}
        />,
      )
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })
    await new Promise((r) => setTimeout(r, 60))

    const target = host.querySelector('[data-restoration-image]') as HTMLElement | null
    if (!target) throw new Error('No se pudo preparar la plantilla.')

    const dataUrl = await toPng(target, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#052e1f',
      width: target.scrollWidth,
      height: target.scrollHeight,
    })

    downloadDataUrl(dataUrl, stampFilename(generatedAt))
  } finally {
    root?.unmount()
    root = null
    host.remove()
  }
}
