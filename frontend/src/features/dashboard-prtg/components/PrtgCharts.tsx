import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
} from 'recharts'
import { SectionCard } from '../../../components/ui/Card'
import type { PrtgDashboard } from '../types/prtgDashboard'

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  fontWeight: 600,
}

function FleetChart({
  title,
  subtitle,
  data,
}: {
  title: string
  subtitle: string
  data: NonNullable<PrtgDashboard['charts']>['fleet_2d']
}) {
  if (!data || data.length === 0) {
    return (
      <SectionCard title={title} accent="prtg">
        <p className="text-sm font-medium text-slate-500">
          Aún no hay suficiente histórico de sync para {subtitle.toLowerCase()}. Se irá llenando con cada sincronización
          PRTG.
        </p>
      </SectionCard>
    )
  }

  return (
    <SectionCard title={title} accent="prtg">
      <p className="mb-3 text-xs font-medium text-slate-500">{subtitle}</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="availFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1d4ed8" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis
              yAxisId="pct"
              domain={[0, 100]}
              tick={{ fontSize: 11 }}
              stroke="#94a3b8"
              width={36}
              tickFormatter={(v) => `${v}%`}
            />
            <YAxis yAxisId="alarms" orientation="right" tick={{ fontSize: 11 }} stroke="#94a3b8" width={36} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name) => {
                const n = Number(value)
                if (name === 'availability_pct') return [`${n}%`, 'Disponibilidad Ping']
                if (name === 'alarms') return [n.toLocaleString('es-PE'), 'Colegios caídos']
                if (name === 'transitions_down') return [n.toLocaleString('es-PE'), 'Transiciones a caído']
                return [n.toLocaleString('es-PE'), String(name)]
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area
              yAxisId="pct"
              type="monotone"
              dataKey="availability_pct"
              name="availability_pct"
              stroke="#1d4ed8"
              fill="url(#availFill)"
              strokeWidth={2.2}
            />
            <Line
              yAxisId="alarms"
              type="monotone"
              dataKey="alarms"
              name="alarms"
              stroke="#b91c1c"
              strokeWidth={2}
              dot={false}
            />
            <Bar
              yAxisId="alarms"
              dataKey="transitions_down"
              name="transitions_down"
              fill="#fca5a5"
              opacity={0.7}
              barSize={10}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </SectionCard>
  )
}

export function PrtgCharts({ data }: { data: PrtgDashboard }) {
  const charts = data.charts
  if (!charts) {
    return null
  }

  const pingStatus = charts.ping_status.filter((d) => d.value > 0)
  const byProvince = charts.by_province.slice(0, 8)
  const concentrations = charts.concentrations
  const snapshot = charts.snapshot

  return (
    <div className="space-y-4">
      {snapshot ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Disponibilidad Ping</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-noc-info">{snapshot.availability_pct}%</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Alarmas activas</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-noc-danger">{snapshot.alarms}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Operativos</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-noc-success">{snapshot.operational}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Monitoreados</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-slate-950">{snapshot.monitored}</p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <FleetChart
          title="Flota Ping · 2 días"
          subtitle="Disponibilidad % (eje izq) · colegios caídos y transiciones (eje der)"
          data={charts.fleet_2d ?? []}
        />
        <FleetChart
          title="Flota Ping · 30 días"
          subtitle="Tendencia diaria de disponibilidad y alarmas (histórico de sync PRTG)"
          data={charts.fleet_30d ?? []}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard title="Estado Ping actual" accent="prtg">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pingStatus}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={58}
                  outerRadius={84}
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {pingStatus.map((entry) => (
                    <Cell key={entry.key} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Ping por provincia" accent="prtg">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byProvince} layout="vertical" margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis type="category" dataKey="province" width={110} tick={{ fontSize: 10 }} stroke="#94a3b8" />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="operational" name="Operativos" stackId="a" fill="#15803d" />
                <Bar dataKey="down" name="Caídos" stackId="a" fill="#b91c1c" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Concentraciones activas" accent="prtg">
          <div className="h-56">
            {concentrations.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm font-medium text-slate-500">
                Sin concentraciones (≥2 caídas)
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={concentrations} margin={{ top: 4, right: 8, left: 0, bottom: 36 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 9 }} angle={-24} textAnchor="end" height={48} stroke="#94a3b8" />
                  <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" width={28} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="caidos" name="Caídos" fill="#b91c1c" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

export function SyncDiagnosticsPanel({ data }: { data: PrtgDashboard }) {
  const diag = data.sync_diagnostics
  if (!diag) {
    return null
  }

  const hasWarn = diag.total_warnings > 0 || diag.total_errors > 0

  return (
    <SectionCard title="Diagnóstico de sincronización PRTG" accent="prtg">
      <p className={`text-sm font-medium ${hasWarn ? 'text-noc-warning' : 'text-noc-success'}`}>{diag.summary}</p>
      {diag.by_code.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {diag.by_code.map((row) => (
            <span
              key={`${row.code}-${row.severity}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-noc-warning"
              title={row.code}
            >
              {row.label}
              <span className="tabular-nums text-slate-700">{row.total}</span>
            </span>
          ))}
        </div>
      ) : null}
      {diag.samples.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-slate-100 pt-3">
          {diag.samples.slice(0, 4).map((sample, idx) => (
            <li key={`${sample.code}-${sample.cid ?? idx}`} className="text-xs leading-relaxed text-slate-600">
              <span className="font-semibold text-slate-800">{sample.cid ? `CID ${sample.cid}` : sample.code}</span>
              {' · '}
              {sample.message}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 text-[11px] font-medium text-slate-500">
        La ubicación operativa se alinea con las carpetas PRTG (provincia/distrito). La base Excel se actualiza en sync
        cuando difiere.
      </p>
    </SectionCard>
  )
}
