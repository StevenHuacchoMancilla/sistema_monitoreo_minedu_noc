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
import type { ReactNode } from 'react'
import type { FilterField, GroupBar, Interval, PreparedRow } from '../lib/modelo'
import { classify, dailyPoints, fold, grouped, optionLabel, reasonSlices } from '../lib/modelo'
import type { TicketeraFilters } from '../types/ticketera'

const tooltipStyle = {
  borderRadius: 12,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  fontWeight: 600,
  boxShadow: '0 10px 30px -18px rgba(15, 23, 42, 0.45)',
}

function Panel({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.7)] md:p-5 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[15px] font-semibold tracking-tight text-slate-950 dark:text-slate-50">{title}</h2>
        {action}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  )
}

function CodeCauseBars({
  groups,
  active,
  onPick,
}: {
  groups: Array<GroupBar & { cause: string; extra: number }>
  active: string
  onPick: (key: string) => void
}) {
  const max = groups[0]?.count ?? 1
  if (!groups.length) {
    return <p className="py-8 text-center text-sm text-slate-500">Sin datos para estos filtros.</p>
  }
  return (
    <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
      {groups.map((group) => {
        const cause = group.extra > 0 ? `${group.cause} · y ${group.extra} más` : group.cause
        return (
          <button
            key={group.key}
            type="button"
            onClick={() => onPick(group.key)}
            title={`${group.label}: ${cause}`}
            className={`grid w-full grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_2.5rem] items-center gap-2 rounded-lg px-2 py-1.5 text-left ${
              active === group.key ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{group.label}</span>
              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">{cause}</span>
            </span>
            <span className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span
                className="block h-full rounded-full bg-[#2997FF]"
                style={{ width: `${(group.count / max) * 100}%` }}
              />
            </span>
            <span className="text-right text-xs font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {group.count.toLocaleString('es-PE')}
            </span>
          </button>
        )
      })}
    </div>
  )
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
              className="block h-full rounded-full bg-[#2997FF]"
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

function causaDeCodigo(row: PreparedRow): string {
  const causa = row.causa.trim()
  if (!causa || causa.startsWith('#') || fold(causa) === 'NINGUNO') return ''
  return causa
}

function codigosConCausa(rows: PreparedRow[]): Array<GroupBar & { cause: string; extra: number }> {
  const map = new Map<string, { key: string; count: number; causes: Map<string, number> }>()
  for (const row of rows) {
    const key = classify(row, 'codigo')
    const current = map.get(key) ?? { key, count: 0, causes: new Map<string, number>() }
    current.count += 1
    const cause = causaDeCodigo(row)
    if (cause) current.causes.set(cause, (current.causes.get(cause) ?? 0) + 1)
    map.set(key, current)
  }
  return [...map.values()]
    .map((group) => {
      const ranked = [...group.causes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'))
      return {
        key: group.key,
        label: optionLabel(group.key),
        count: group.count,
        cids: 0,
        cause: ranked[0]?.[0] ?? 'Sin causa raíz',
        extra: Math.max(0, ranked.length - 1),
      }
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'es'))
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
        <Panel title="Evolución de incidencias" action={<span className="text-xs text-slate-500">{points.length} días</span>}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={points}
                onClick={(state) => {
                  const key = (state as { activePayload?: Array<{ payload?: { key?: string } }> }).activePayload?.[0]?.payload?.key
                  if (key) onDay(key)
                }}
              >
                <CartesianGrid stroke="#293A54" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="count" name="Incidencias" stroke="#2997FF" fill="#2997FF" fillOpacity={0.16} strokeWidth={2.5} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">Selecciona un punto para ver solo ese día.</p>
        </Panel>

        <Panel title="Distribución por razón (MINEDU)">
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
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Incidencias por provincia">
          <Bars groups={grouped(rows, 'provincia')} onPick={(key) => onFilter('provincia', key)} />
        </Panel>
        <Panel title="Grupos de causa">
          <Bars groups={grouped(rows, 'grupo')} onPick={(key) => onFilter('grupo', key)} />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Razones MINEDU" action={<span className="text-xs text-slate-500">{total.toLocaleString('es-PE')} incidencias</span>}>
          <Bars groups={grouped(rows, 'minedu')} onPick={(key) => onFilter('minedu', filters.minedu === key ? '' : key)} />
        </Panel>
        <Panel title="Códigos y causa raíz">
          <CodeCauseBars
            groups={codigosConCausa(rows)}
            active={filters.codigo}
            onPick={(key) => onFilter('codigo', filters.codigo === key ? '' : key)}
          />
        </Panel>
      </div>
    </div>
  )
}
