import { limaDateKey } from '../../../lib/fechaHora'
import { fold } from './modelo'
import type { PreparedRow } from './modelo'

export type CuadreKey =
  | 'restablecidos'
  | 'solicitudes'
  | 'sinrespuesta'
  | 'averias'
  | 'descartes'
  | 'equipos'
  | 'energia'
  | 'sinClasificar'
  | 'revisar'
  | 'otros'
  | 'futuras'

export const CUADRE_CATEGORIAS: Array<{ key: CuadreKey; label: string; color: string }> = [
  { key: 'restablecidos', label: 'Restablecidos · abrieron y cerraron el mismo día', color: '#6179fb' },
  { key: 'solicitudes', label: 'Solicitudes · Requerimiento', color: '#11b5bd' },
  { key: 'sinrespuesta', label: 'Sin respuesta · código asignado', color: '#9a70ec' },
  { key: 'averias', label: 'Caída de Enlace · otras aperturas', color: '#f1a43d' },
  { key: 'descartes', label: 'Descartes GS03 · otros', color: '#e56ba2' },
  { key: 'equipos', label: 'Equipos apagados LE07 · otros', color: '#1cad8c' },
  { key: 'energia', label: 'Energía LE05 · otros', color: '#e6b64c' },
  { key: 'sinClasificar', label: 'Sin razón MINEDU ni código', color: '#548ee2' },
  { key: 'revisar', label: 'Fecha de cierre incorrecta · requiere revisión', color: '#d87c62' },
  { key: 'otros', label: 'Otras clasificaciones', color: '#889cc3' },
  { key: 'futuras', label: 'Fecha futura · por revisar', color: '#bc6fec' },
]

export function clasificarApertura(row: PreparedRow, nowMs: number): CuadreKey {
  if (row.openMs == null || row.openMs > nowMs) return 'futuras'
  if (row.status === 'REVISAR') return 'revisar'
  if (
    row.status === 'CERRADO' &&
    row.closeMs != null &&
    row.closeMs >= row.openMs &&
    row.closeMs <= nowMs &&
    limaDateKey(row.openMs) === limaDateKey(row.closeMs)
  ) {
    return 'restablecidos'
  }
  const reason = fold(row.minedu)
  if (reason === 'REQUERIMIENTO' || reason === 'REQUERIMEINTO') return 'solicitudes'
  const code = fold(row.codigo)
  if (code && (code === 'SINRESPUESTA' || fold(row.causa) === 'SINRESPUESTA')) return 'sinrespuesta'
  if (reason === 'CAIDADEENLACE') return 'averias'
  if (code === 'GS03' && row.status === 'ABIERTO') return 'descartes'
  if (code === 'LE07') return 'equipos'
  if (code === 'LE05') return 'energia'
  if (!reason && !code) return 'sinClasificar'
  return 'otros'
}

export function causaDe(row: PreparedRow): string {
  const causa = row.causa.trim()
  if (!causa || fold(causa) === 'NINGUNO' || causa.startsWith('#')) return 'Causa raíz sin descripción'
  return causa
}

export function codigoDe(row: PreparedRow): string {
  const code = row.codigo.trim()
  if (!code || fold(code) === 'NINGUNO' || code.startsWith('#')) return '(sin código)'
  return code
}
