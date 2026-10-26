// Conciliación de un extracto leído con las compras que ya tiene la tarjeta en la app. Puro y probado.
import { norm } from './csv.js'

export const huella = c => `${c.fecha}|${Math.round(+c.monto)}|${norm(c.descripcion).replace(/[^a-z0-9]/g, '').slice(0, 24)}`
const dias = (a, b) => Math.abs(Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5))
const parecido = (a, b) => { const x = norm(a).replace(/[^a-z0-9 ]/g, ''), y = norm(b).replace(/[^a-z0-9 ]/g, ''); if (!x || !y) return false; if (x === y) return true; const px = x.split(' ')[0], py = y.split(' ')[0]; return px.length >= 4 && px === py }

// Devuelve filas con estado: 'nueva' | 'existente' | 'ajuste' (existe pero las cuotas pagadas no coinciden)
export function conciliar(compras, cargosExistentes, pagadasPorCargo = {}) {
  const usados = new Set()
  return compras.map(c => {
    const ref = huella(c)
    let m = cargosExistentes.find(x => !usados.has(x.id) && x.ref_extracto === ref)
    if (!m) m = cargosExistentes.find(x => !usados.has(x.id) && Math.abs(+x.monto - +c.monto) <= Math.max(1, +c.monto * 0.005) && dias(x.fecha, c.fecha) <= 5 && (parecido(x.descripcion, c.descripcion) || x.cuotas === c.cuotas))
    if (!m) return { ...c, ref, estado: 'nueva', incluir: true }
    usados.add(m.id)
    const pagadasApp = (pagadasPorCargo[m.id] || 0) + (+m.cuotas_previas || 0)
    const deberian = c.cuota_actual - 1   // cuotas ya pagadas según el banco (la actual se está facturando)
    const ajuste = deberian !== pagadasApp || (+m.cuotas || 1) !== c.cuotas
    return { ...c, ref, estado: ajuste ? 'ajuste' : 'existente', incluir: ajuste, cargo: m, pagadasApp, deberian, nuevasPrevias: Math.max(0, deberian - (pagadasPorCargo[m.id] || 0)) }
  })
}

// Diferencia entre lo que la app calcula de saldo y lo que dice el banco
export function diferenciaSaldo(saldoApp, estado) {
  if (estado.utilizado == null) return null
  return Math.round(saldoApp - estado.utilizado)
}
