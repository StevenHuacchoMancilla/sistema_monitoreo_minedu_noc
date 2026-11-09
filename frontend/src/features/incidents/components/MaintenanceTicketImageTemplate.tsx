import type { MaintenanceTicket } from '../types/maintenance'
import { limaTime, linesFromBlock } from '../types/maintenance'

type Props = {
  ticket: MaintenanceTicket
  generatedAt?: Date
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 12, padding: '10px 0', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#64748b' }}>
        {label}
      </div>
      <div style={{ fontSize: 15, color: '#0f172a', fontWeight: 600, lineHeight: 1.45 }}>{children}</div>
    </div>
  )
}

function BulletList({ items }: { items: string[] }) {
  if (items.length === 0) return <span style={{ color: '#94a3b8' }}>—</span>
  return (
    <ul style={{ margin: 0, paddingLeft: 18 }}>
      {items.map((item) => (
        <li key={item} style={{ marginBottom: 4 }}>
          {item}
        </li>
      ))}
    </ul>
  )
}

export function MaintenanceTicketImageTemplate({ ticket, generatedAt = new Date() }: Props) {
  const startIso = ticket.arrived_at ?? ticket.opened_at
  const school = ticket.local_educativo || ticket.school_name || '—'
  const kind =
    ticket.kind_label
    || (ticket.kind === 'PREVENTIVO' ? 'Preventivo' : ticket.kind === 'ASIGNACION_LIBRE' ? 'Asignación libre' : 'Correctivo')
  const isMaint = ticket.is_maintenance || ticket.kind === 'PREVENTIVO'
  const title = isMaint ? 'Acta de mantenimiento' : 'Acta de atención técnica'
  const stamp = generatedAt.toLocaleString('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })

  return (
    <div
      data-maintenance-ticket-image
      style={{
        width: 980,
        fontFamily: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
        background: '#f1f5f9',
        color: '#0f172a',
        padding: 28,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          borderRadius: 18,
          overflow: 'hidden',
          background: '#ffffff',
          boxShadow: '0 18px 40px rgba(15, 23, 42, 0.12)',
          border: '1px solid #dbe3ef',
        }}
      >
        <header
          style={{
            background: isMaint
              ? 'linear-gradient(135deg, #0b3b5c 0%, #0f766e 55%, #115e59 100%)'
              : 'linear-gradient(135deg, #0b3b5c 0%, #1d4ed8 55%, #1e3a8a 100%)',
            color: '#fff',
            padding: '28px 32px 24px',
            position: 'relative',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 85% 20%, rgba(255,255,255,0.16), transparent 40%)' }} />
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'space-between', gap: 24, alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.85 }}>
                NOC Loreto · Atención técnica
              </div>
              <h1 style={{ margin: '8px 0 0', fontSize: 28, fontWeight: 800, letterSpacing: '-0.02em' }}>
                {title}
              </h1>
              <p style={{ margin: '8px 0 0', fontSize: 14, opacity: 0.9, maxWidth: 520 }}>
                Registro formal de intervención ({kind}) en local educativo. Documento para el cliente.
              </p>
            </div>
            <div
              style={{
                minWidth: 220,
                borderRadius: 14,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.22)',
                padding: '14px 16px',
                textAlign: 'right',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>
                Código de ticket
              </div>
              <div style={{ marginTop: 6, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 18, fontWeight: 800 }}>
                {ticket.ticket_code}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.9 }}>{kind}</div>
            </div>
          </div>
        </header>

        <section style={{ padding: '22px 32px 8px' }}>
          <div style={{ borderRadius: 14, border: '1px solid #e2e8f0', padding: '16px 18px', background: '#f8fafc' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b' }}>
              Local educativo
            </div>
            <div style={{ marginTop: 6, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{school}</div>
            <div style={{ marginTop: 8, fontSize: 13, color: '#475569' }}>
              CID {ticket.cid || '—'} · TSS {ticket.tss || '—'}
              {(ticket.province || ticket.district) ? ` · ${[ticket.province, ticket.district].filter(Boolean).join(' / ')}` : ''}
            </div>
          </div>
        </section>

        <section style={{ padding: '8px 32px 28px' }}>
          <div
            style={{
              borderRadius: 16,
              border: '1px solid #cbd5e1',
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            <div
              style={{
                background: '#0b3b5c',
                color: '#fff',
                padding: '12px 18px',
                fontSize: 13,
                fontWeight: 800,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              Detalle de evento
            </div>
            <div style={{ padding: '6px 18px 14px' }}>
              <Row label="Hora de inicio">{limaTime(startIso)}</Row>
              <Row label="Datos del técnico">{ticket.technician_name || '—'}</Row>
              <Row label="Celular">{ticket.technician_phone || '—'}</Row>
              <Row label="Actividades ejecutadas">
                <BulletList items={linesFromBlock(ticket.activities)} />
              </Row>
              <Row label="Materiales utilizados">
                <BulletList items={linesFromBlock(ticket.materials)} />
              </Row>
              {ticket.kind !== 'PREVENTIVO' ? (
                <Row label="Hora de restablecimiento">{limaTime(ticket.restored_at)}</Row>
              ) : null}
              <Row label="Hora de salida">{limaTime(ticket.departed_at)}</Row>
            </div>
          </div>

          {ticket.cause ? (
            <p style={{ margin: '14px 0 0', fontSize: 13, color: '#475569' }}>
              <strong style={{ color: '#0f172a' }}>Causa:</strong> {ticket.cause_code ? `${ticket.cause_code} · ` : ''}
              {ticket.cause}
            </p>
          ) : null}

          <div
            style={{
              marginTop: 16,
              borderRadius: 14,
              border: '1px solid #86efac',
              background: 'linear-gradient(180deg, #f0fdf4 0%, #dcfce7 100%)',
              padding: '16px 18px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: 18,
                fontWeight: 800,
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
                color: '#15803d',
              }}
            >
              Servicio operativo
            </div>
            <div style={{ marginTop: 4, fontSize: 13, fontWeight: 600, color: '#166534' }}>
              Intervención concluida. El servicio se encuentra operativo.
            </div>
          </div>
        </section>

        <footer
          style={{
            borderTop: '1px solid #e2e8f0',
            padding: '14px 32px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            background: '#f8fafc',
            fontSize: 11,
            color: '#64748b',
          }}
        >
          <span>Documento generado por NOC Loreto · uso del cliente</span>
          <span>{stamp}</span>
        </footer>
      </div>
    </div>
  )
}
