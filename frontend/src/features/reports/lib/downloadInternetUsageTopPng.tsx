import { createRoot, type Root } from 'react-dom/client'
import { toPng } from 'html-to-image'
import {
  InternetUsageTopImageTemplate,
  type UsageTopRow,
} from '../components/InternetUsageTopImageTemplate'

function stampFilename(prefix: string, date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  const y = date.getFullYear()
  const m = pad(date.getMonth() + 1)
  const d = pad(date.getDate())
  const h = pad(date.getHours())
  const min = pad(date.getMinutes())
  return `${prefix}_${y}${m}${d}_${h}${min}.png`
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

export async function downloadInternetUsageTopPng(opts: {
  periodLabel: string
  rural: UsageTopRow[]
  urbano: UsageTopRow[]
  heading?: string
  subheading?: string
  showTecnologia?: boolean
  volumeMode?: boolean
  filenamePrefix?: string
}): Promise<void> {
  if (opts.rural.length === 0 && opts.urbano.length === 0) {
    throw new Error('No hay top Rural/Urbano para exportar.')
  }

  const width = opts.showTecnologia || opts.volumeMode ? 1580 : 1480
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: `${width}px`,
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
        <InternetUsageTopImageTemplate
          periodLabel={opts.periodLabel}
          rural={opts.rural}
          urbano={opts.urbano}
          generatedAt={generatedAt}
          heading={opts.heading}
          subheading={opts.subheading}
          showTecnologia={opts.showTecnologia}
          volumeMode={opts.volumeMode}
        />,
      )
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })
    await new Promise((r) => setTimeout(r, 80))

    const target = host.querySelector('[data-usage-top-image]') as HTMLElement | null
    if (!target) {
      throw new Error('No se pudo preparar la plantilla del top.')
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

    downloadDataUrl(
      dataUrl,
      stampFilename(opts.filenamePrefix ?? 'uso_internet_top_rural_urbano', generatedAt),
    )
  } finally {
    root?.unmount()
    root = null
    host.remove()
  }
}
