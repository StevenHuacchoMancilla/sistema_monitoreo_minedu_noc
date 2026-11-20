import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { SectionCard } from '../../../components/ui/Tarjeta'
import type { FilterField, GroupBar, Interval, PreparedRow } from '../lib/modelo'
import { dailyPoints, grouped, reasonSlices } from '../lib/modelo'
import type { TicketeraFilters } from '../types/ticketera'

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  fontWeight: 600,
}

function Bars({
  groups,
  onPick,
}: {
  groups: GroupBar[]
  onPick: (key: string) => void
}) {
  const max = groups[0]?.count ?? 1
  if (!groups.length) {
    return <p className="py-8 text-center text-sm text-slate-500">Sin datos para estos filtros.</p>
  }
  return (
    <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
      {groups.map((group) => (
        <button
          key={group.key}
          type="button"
          onClick={() => onPick(group.key)}
          className="grid w-full grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_2.5rem] items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200" title={group.label}>
            {group.label}
          </span>
          <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <span
              className="block h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500"
              style={{ width: `${(group.count / max) * 100}%` }}
            />
          </span>
          <span className="text-right text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {group.count.toLocaleString('es-PE')}
          </span>
        </button>
      ))}
    </div>
  )
}

export function GraficosTicketera({
  rows,
  intervals,
  filters,
  now,
  onDay,
  onFilter,
}: {
  rows: PreparedRow[]
  intervals: Interval[]
  filters: TicketeraFilters
  now: string
  onDay: (key: string) => void
  onFilter: (field: FilterField, value: string) => void
}) {
  const points = dailyPoints(intervals, rows, filters.criterion, now)
  const motives = reasonSlices(rows).filter((slice) => slice.count > 0)
  const total = rows.length
  const selectedReason = filters.minedu

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard title="Evolución de incidencias" action={<span className="text-xs text-slate-500">{points.length} días</span>}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={points}
                onClick={(state) => {
                  const key = (state as { activePayload?: Array<{ payload?: { key?: string } }> }).activePayload?.[0]?.payload?.key
                  if (key) onDay(key)
                }}
              >
                <CartesianGrid stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="count" name="Incidencias" stroke="#4963ee" fill="#4963ee" fillOpacity={0.16} strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">Selecciona un punto para ver solo ese día.</p>
        </SectionCard>

        <SectionCard title="Distribución por razón (MINEDU)">
          {motives.length ? (
            <div className="grid items-center gap-3 sm:grid-cols-2">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={motives}
                      dataKey="count"
                      nameKey="label"
                      outerRadius={100}
                      stroke="transparent"
                      onClick={(entry) => {
                        const key = (entry as { key?: string }).key
                        if (!key) return
                        onFilter('minedu', selectedReason === key ? '' : key)
                      }}
                    >
                      {motives.map((slice) => (
                        <Cell key={slice.key} fill={slice.color} cursor="pointer" />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={tooltipStyle} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="max-h-64 space-y-1 overflow-y-auto">
                {motives.map((slice) => {
                  const active = selectedReason === slice.key
                  return (
                    <li key={slice.key}>
                      <button
                        type="button"
                        onClick={() => onFilter('minedu', active ? '' : slice.key)}
                        className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${active ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                      >
                        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: slice.color }} />
                        <span className="min-w-0 flex-1 font-semibold text-slate-700 dark:text-slate-200">{slice.label}</span>
                        <span className="text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">
                          {slice.count.toLocaleString('es-PE')}
                          <span className="block text-[10px] font-medium text-slate-500">
                            {total ? ((slice.count / total) * 100).toFixed(1) : '0.0'}%
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No hay incidencias con estos filtros.</p>
          )}
          <p className="mt-2 text-xs text-slate-500">Pulsa una razón para filtrar. Pulsa de nuevo para quitar el filtro.</p>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Incidencias por provincia">
          <Bars groups={grouped(rows, 'provincia')} onPick={(key) => onFilter('provincia', key)} />
        </SectionCard>
        <SectionCard title="Grupos de causa">
          <Bars groups={grouped(rows, 'grupo')} onPick={(key) => onFilter('grupo', key)} />
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Razones MINEDU" action={<span className="text-xs text-slate-500">{total.toLocaleString('es-PE')} incidencias</span>}>
          <Bars groups={grouped(rows, 'minedu')} onPick={(key) => onFilter('minedu', filters.minedu === key ? '' : key)} />
        </SectionCard>
        <SectionCard title="Códigos de la razón filtrada">
          <Bars groups={grouped(rows, 'codigo')} onPick={(key) => onFilter('codigo', filters.codigo === key ? '' : key)} />
        </SectionCard>
      </div>
    </div>
  )
}
