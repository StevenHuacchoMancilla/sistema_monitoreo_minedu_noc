import { useMemo } from 'react'
import { FormField, Select } from '../../../components/ui/FormControls'
import rootCauseLegend from '../data/rootCauseLegend.json' with { type: 'json' }

export type RootCauseRow = {
  group_code: string
  group_name: string
  code: string
  segment: string
  cause: string
  when: string
  attention: string
  agent: string
}

const LEGEND = rootCauseLegend as RootCauseRow[]

/** Quita el prefijo "01 · " del nombre de grupo para leerlo como operador. */
export function friendlyGroupName(groupName: string): string {
  return groupName.replace(/^\d+\s*·\s*/, '').trim() || groupName
}

export function rootCauseGroups(): Array<{ code: string; label: string }> {
  const map = new Map<string, string>()
  for (const row of LEGEND) {
    if (!map.has(row.group_code)) {
      map.set(row.group_code, friendlyGroupName(row.group_name))
    }
  }
  return Array.from(map.entries()).map(([code, label]) => ({ code, label }))
}

export function findRootCause(groupCode: string, code: string): RootCauseRow | undefined {
  return LEGEND.find((row) => row.group_code === groupCode && row.code === code)
}

export function causesForGroup(groupCode: string): RootCauseRow[] {
  return LEGEND.filter((row) => row.group_code === groupCode)
}

/**
 * 1) Elige el grupo (7 opciones claras).
 * 2) Elige la causa raíz por texto (el código viaja en el value).
 * 3) Segmento / atención / agente / guía se muestran autocompletados.
 */
export function RootCausePicker({
  groupCode,
  causeCode,
  onGroupChange,
  onCauseChange,
  required = false,
}: {
  groupCode: string
  causeCode: string
  onGroupChange: (groupCode: string) => void
  onCauseChange: (causeCode: string, row: RootCauseRow | null) => void
  required?: boolean
}) {
  const groups = useMemo(() => rootCauseGroups(), [])
  const causes = useMemo(() => causesForGroup(groupCode), [groupCode])
  const selected = useMemo(
    () => (groupCode && causeCode ? findRootCause(groupCode, causeCode) : undefined),
    [groupCode, causeCode],
  )

  const bySegment = useMemo(() => {
    const map = new Map<string, RootCauseRow[]>()
    for (const row of causes) {
      const key = row.segment || 'Otros'
      const list = map.get(key) ?? []
      list.push(row)
      map.set(key, list)
    }
    return Array.from(map.entries())
  }, [causes])

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="1. Grupo">
          <Select
            value={groupCode}
            required={required}
            onChange={(e) => {
              const next = e.target.value
              onGroupChange(next)
              onCauseChange('', null)
            }}
          >
            <option value="">— Elige el grupo —</option>
            {groups.map((g) => (
              <option key={g.code} value={g.code}>
                {g.label}
              </option>
            ))}
          </Select>
        </FormField>

        <FormField label="2. Causa raíz">
          <Select
            value={causeCode}
            disabled={!groupCode}
            required={required}
            onChange={(e) => {
              const next = e.target.value
              const row = next ? findRootCause(groupCode, next) ?? null : null
              onCauseChange(next, row)
            }}
          >
            <option value="">{groupCode ? '— Elige la causa —' : '— Primero el grupo —'}</option>
            {bySegment.map(([segment, rows]) => (
              <optgroup key={segment} label={segment}>
                {rows.map((row) => (
                  <option key={row.code} value={row.code}>
                    {row.cause}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </FormField>
      </div>

      <div
        className={`rounded-xl border px-3 py-2.5 ${
          selected
            ? 'border-emerald-500/30 bg-emerald-500/10'
            : 'border-dashed border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-950'
        }`}
      >
        <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Autocompletado</p>
        {selected ? (
          <dl className="mt-2 grid gap-1.5 text-[12px] text-slate-700 dark:text-slate-200 sm:grid-cols-2">
            <div>
              <dt className="inline font-semibold text-slate-500">Código: </dt>
              <dd className="inline font-mono font-semibold">{selected.code}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-500">Segmento: </dt>
              <dd className="inline">{selected.segment || '—'}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-500">Atención: </dt>
              <dd className="inline">{selected.attention || '—'}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-slate-500">Agente: </dt>
              <dd className="inline">{selected.agent || '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="inline font-semibold text-slate-500">Guía: </dt>
              <dd className="inline text-slate-500">{selected.when || '—'}</dd>
            </div>
          </dl>
        ) : (
          <p className="mt-1 text-sm text-slate-400">Opcional. Elige grupo y causa, o déjalo vacío (p. ej. Requerimientos).</p>
        )}
      </div>
    </div>
  )
}
