// Conciliación de un extracto leído con las compras que ya tiene la tarjeta en la app. Puro y probado.
import { norm } from './csv.js'

export const huella = c => `${c.fecha}|${Math.round(+c.monto)}|${norm(c.descripcion).replace(/[^a-z0-9]/g, '').slice(0, 24)}`
const dias = (a, b) => Math.abs(Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5))
const parecido = (a, b) => { const x = norm(a).replace(/[^a-z0-9 ]/g, ''), y = norm(b).replace(/[^a-z0-9 ]/g, ''); if (!x || !y) return false; if (x === y) return true; const px = x.split(' ')[0], py = y.split(' ')[0]; return px.length >= 4 && px === py }

// Plan según el banco. Los bancos (Nu, Falabella/CMR) facturan cada compra como capital/n por cuota y cobran el
// interés aparte; además imprimen datos incoherentes (Falabella: "4 de 1" tras un cambio de cuotas, o un "valor del
// movimiento" que incluye intereses). Lo fiable es la cuota de este mes y el saldo pendiente: de ahí salen las cuotas
// restantes (saldo ÷ cuota, entero) y el capital financiado (cuota × cuotas). Devuelve la compra con `capital`,
// `cuotas`/`cuotas_previas` corregidas y `plan_nota` cuando cambió algo. Pura y probada.
const casiEntero = x => Math.abs(x - Math.round(x)) <= 0.02
export function planDesdeBanco(c) {
  const monto = +c.monto || 0, actual = Math.max(1, +c.cuota_actual || 1), cuotasBanco = Math.max(1, +c.cuotas || 1)
  const out = { ...c, capital: monto, cuotas: cuotasBanco, cuotas_previas: Math.min(actual - 1, cuotasBanco - 1), plan_nota: null }
  const pend = c.saldo_pendiente == null ? null : +c.saldo_pendiente
  if (pend == null || pend < 0) return out
  // lo impreso es coherente (cuota × cuotas = monto): no se toca
  if (c.valor_cuota_mes > 0 && Math.abs(+c.valor_cuota_mes * cuotasBanco - monto) <= Math.max(1, monto * 0.005)) return out
  // candidatos de cuota de capital: lo que imprime el banco como cuota del mes, o monto/cuotas
  const cands = [+c.valor_cuota_mes || 0, monto / cuotasBanco].filter(v => v > 0)
  for (const v of cands) {
    const restantes = pend === 0 ? 0 : pend / v
    if (!casiEntero(restantes)) continue
    const r = Math.round(restantes), cuotas = actual + r
    if (cuotas < 1 || cuotas > 120) continue
    const capital = Math.round(v * cuotas * 100) / 100
    const cambioCuotas = cuotas !== cuotasBanco, cambioCapital = Math.abs(capital - monto) > Math.max(1, monto * 0.005)
    out.cuotas = cuotas; out.cuotas_previas = actual - 1; out.capital = cambioCapital ? capital : monto
    if (cambioCuotas || cambioCapital) out.plan_nota = [cambioCuotas ? `el extracto dice "${actual} de ${cuotasBanco}" pero por el saldo pendiente son ${cuotas} cuotas` : null, cambioCapital ? `capital financiado ${Math.round(capital).toLocaleString('es-CO')} (el extracto imprime ${Math.round(monto).toLocaleString('es-CO')}, que incluye intereses)` : null].filter(Boolean).join(' · ')
    return out
  }
  return out
}

// Devuelve filas con estado: 'nueva' | 'existente' | 'ajuste' (existe pero cuotas/capital/tasa no coinciden con el banco)
export function conciliar(comprasBanco, cargosExistentes, pagadasPorCargo = {}) {
  const usados = new Set()
  const compras = comprasBanco.map(planDesdeBanco)
  return compras.map(c => {
    const ref = huella(c)
    let m = cargosExistentes.find(x => !usados.has(x.id) && x.ref_extracto === ref)
    if (!m) m = cargosExistentes.find(x => !usados.has(x.id) && Math.abs(+x.monto - +c.monto) <= Math.max(1, +c.monto * 0.005) && dias(x.fecha, c.fecha) <= 5 && (parecido(x.descripcion, c.descripcion) || x.cuotas === c.cuotas))
    if (!m) return { ...c, ref, estado: 'nueva', incluir: true }
    usados.add(m.id)
    const pagadasApp = (pagadasPorCargo[m.id] || 0) + (+m.cuotas_previas || 0)
    const deberian = c.cuota_actual - 1   // cuotas ya pagadas según el banco (la actual se está facturando)
    // la compra se amortiza como capital/n sin tasa (el interés viene aparte en la factura): si la app la tenía con tasa o con otro capital, se corrige
    const ajuste = deberian !== pagadasApp || (+m.cuotas || 1) !== c.cuotas || Math.abs(+m.monto - c.capital) > 1 || +m.tasa_mensual > 0
    return { ...c, ref, estado: ajuste ? 'ajuste' : 'existente', incluir: ajuste, cargo: m, pagadasApp, deberian, nuevasPrevias: Math.max(0, deberian - (pagadasPorCargo[m.id] || 0)) }
  })
}

// Diferencia entre lo que la app calcula de saldo y lo que dice el banco
export function diferenciaSaldo(saldoApp, estado) {
  if (estado.utilizado == null) return null
  return Math.round(saldoApp - estado.utilizado)
}
