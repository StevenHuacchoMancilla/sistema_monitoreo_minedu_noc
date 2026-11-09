import { createRoot, type Root } from 'react-dom/client'
import { toPng } from 'html-to-image'
import { MaintenanceTicketImageTemplate } from '../components/MaintenanceTicketImageTemplate'
import type { MaintenanceTicket } from '../types/maintenance'

function downloadDataUrl(dataUrl: string, filename: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function downloadMaintenanceTicketPng(ticket: MaintenanceTicket): Promise<void> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '980px',
    pointerEvents: 'none',
    opacity: '1',
    zIndex: '-1',
  })
  document.body.appendChild(host)

  let root: Root | null = createRoot(host)
  const generatedAt = new Date()

  try {
    await new Promise<void>((resolve) => {
      root!.render(<MaintenanceTicketImageTemplate ticket={ticket} generatedAt={generatedAt} />)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => resolve())
      })
    })
    await new Promise((r) => setTimeout(r, 80))

    const target = host.querySelector('[data-maintenance-ticket-image]') as HTMLElement | null
    if (!target) {
      throw new Error('No se pudo preparar la plantilla del ticket.')
    }

    const dataUrl = await toPng(target, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#f1f5f9',
      width: target.scrollWidth,
      height: target.scrollHeight,
      style: { transform: 'none', margin: '0' },
    })

    const safeCode = (ticket.ticket_code || String(ticket.id)).replace(/[^\w.-]+/g, '_')
    downloadDataUrl(dataUrl, `${safeCode}.png`)
  } finally {
    root?.unmount()
    root = null
    host.remove()
  }
}
