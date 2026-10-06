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
import { SectionCard } from '../../../components/ui/Card'
import type { FilterField, GroupBar, Interval, PreparedRow } from '../lib/model'
import { dailyPoints, grouped, motiveSlices } from '../lib/model'
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

export function TicketeraCharts({
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
  const motives = motiveSlices(rows)
  const total = rows.length

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

        <SectionCard title="Distribución por motivo">
          <div className="grid items-center gap-3 sm:grid-cols-2">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={motives} dataKey="count" nameKey="label" innerRadius={58} outerRadius={84} paddingAngle={2}>
                    {motives.map((slice) => (
                      <Cell key={slice.label} fill={slice.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="space-y-3">
              {motives.map((slice) => (
                <li key={slice.label} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
                  <span className="min-w-0 flex-1">{slice.label}</span>
                  <span className="text-right font-bold tabular-nums text-slate-900 dark:text-slate-100">
                    {slice.count.toLocaleString('es-PE')}
                    <span className="block text-[10px] font-medium text-slate-500">
                      {total ? ((slice.count / total) * 100).toFixed(1) : '0.0'}%
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
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

      <SectionCard title="Clasificación MINEDU" action={<span className="text-xs text-slate-500">{total.toLocaleString('es-PE')} incidencias</span>}>
        <Bars groups={grouped(rows, 'minedu')} onPick={(key) => onFilter('minedu', key)} />
      </SectionCard>
    </div>
  )
}
