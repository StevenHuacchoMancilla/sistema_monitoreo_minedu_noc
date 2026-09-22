import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  CircleCheck,
  MessageSquare,
  Phone,
  PhoneOff,
  TriangleAlert,
  Truck,
  Wrench,
} from 'lucide-react'
import type { IncidentDetail } from '../../../types/api'

type TimelineEvent = NonNullable<IncidentDetail['timeline']>[number]

const ICONS: Record<string, LucideIcon> = {
  phone: Phone,
  phone_missed: PhoneOff,
  message: MessageSquare,
  wrench: Wrench,
  check: CircleCheck,
  activity: Activity,
  alert: TriangleAlert,
  truck: Truck,
}

export function IncidentTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">Sin eventos operativos registrados.</p>
  }

  return (
    <ol className="relative space-y-0 border-l border-slate-200 pl-0">
      {events.map((event) => {
        const Icon = ICONS[event.icon] ?? Activity
        return (
          <li key={event.id} className="relative pb-5 pl-8 last:pb-0">
            <span className="absolute top-0.5 -left-[9px] inline-flex h-[18px] w-[18px] items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600">
              <Icon className="h-3 w-3" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <time className="text-xs font-semibold tabular-nums text-slate-500">
                  {event.at ? new Date(event.at).toLocaleString('es-PE') : '—'}
                </time>
                <span className="text-xs font-medium text-slate-400">{event.actor}</span>
              </div>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{event.title}</p>
              {event.detail ? <p className="mt-0.5 text-sm text-slate-600">{event.detail}</p> : null}
              {event.status_before || event.status_after ? (
                <p className="mt-1 text-xs text-slate-500">
                  {event.status_before ?? '—'} → {event.status_after ?? '—'}
                </p>
              ) : null}
              {event.contact ? (
                <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  <p className="font-semibold text-slate-800">Contacto (snapshot histórico)</p>
                  <p className="mt-0.5">
                    {[event.contact.name, event.contact.role].filter(Boolean).join(' · ') || 'Sin nombre'}
                  </p>
                  {event.contact.phone ? (
                    <p className="tabular-nums text-slate-600">{event.contact.phone}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
