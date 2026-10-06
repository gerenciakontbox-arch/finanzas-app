// Cálculos derivados sobre las tablas del hogar. Puros: reciben db, devuelven datos.
import { amortizacion, cfFija, addMonths, TC } from './util'

// Mapa de cuotas pagadas: { deuda: {deudaId: {n: fila}}, cargo: {cargoId: {n: fila}} }
export function indicePagadas(cuotas_pagadas) {
  const deuda = {}, cargo = {}
  for (const c of cuotas_pagadas || []) {
    if (c.deuda_id) (deuda[c.deuda_id] ||= {})[c.numero] = c
    if (c.cargo_id) (cargo[c.cargo_id] ||= {})[c.numero] = c
  }
  return { deuda, cargo }
}

export function resumenDeuda(d, idx) {
  const am = amortizacion({ capital: +d.capital_inicial, tasa: +d.tasa_mensual, n: d.total_cuotas, fechaInicio: d.fecha_primera_cuota })
  const pag = idx.deuda[d.id] || {}
  const rows = am.map(c => ({ ...c, pago: pag[c.n] || null }))
  const pendientes = rows.filter(c => !c.pago)
  const capitalPagado = rows.filter(c => c.pago).reduce((a, c) => a + c.capital, 0)
  return { ...d, am: rows, pagadas: rows.length - pendientes.length, capitalPagado, capitalPendiente: pendientes.reduce((a, c) => a + c.capital, 0), pct: Math.round(capitalPagado / +d.capital_inicial * 100), proxima: pendientes[0] || null, cf: Math.round(cfFija(+d.capital_inicial, +d.tasa_mensual, d.total_cuotas)) }
}

export function resumenCargo(c, idx) {
  const am = amortizacion({ capital: +c.monto, tasa: +c.tasa_mensual, n: c.cuotas, fechaInicio: c.primera_cuota || addMonths(c.fecha, 1) })
  const pag = idx.cargo[c.id] || {}
  const rows = am.map(x => ({ ...x, pago: pag[x.n] || null }))
  const pend = rows.filter(x => !x.pago)
  return { ...c, am: rows, pend, pagadas: rows.length - pend.length, next: pend[0] || null, saldo: pend.reduce((a, x) => a + x.capital, 0), liquidado: pend.length === 0 }
}

export function resumenTarjeta(cuenta, tc_cargos, idx) {
  const cargos = (tc_cargos || []).filter(c => c.cuenta_id === cuenta.id).map(c => resumenCargo(c, idx))
  const activos = cargos.filter(c => !c.liquidado)
  const saldo = activos.reduce((a, c) => a + c.saldo, 0)
  return { cuenta, cargos, activos, saldo, proximaFactura: activos.reduce((a, c) => a + (c.next ? c.next.total : 0), 0), proximaFecha: activos.map(c => c.next?.fecha).filter(Boolean).sort()[0] || null, cupo: +cuenta.cupo || 0, disponible: (+cuenta.cupo || 0) - saldo }
}

export function deudaTotal(db) {
  const idx = indicePagadas(db.cuotas_pagadas)
  const cred = db.deudas.filter(d => d.estado === 'Activo').reduce((a, d) => a + resumenDeuda(d, idx).capitalPendiente, 0)
  const tcs = db.cuentas.filter(c => c.tipo === TC).reduce((a, c) => a + resumenTarjeta(c, db.tc_cargos, idx).saldo, 0)
  return { cred, tcs, total: cred + tcs }
}

// Presupuesto con ejecutado (suma de movimientos de salida vinculados)
export function presupuestoConEjecucion(db, periodo) {
  const exec = {}
  for (const m of db.movimientos) if (m.presupuesto_id && m.tipo === 'Salida') exec[m.presupuesto_id] = (exec[m.presupuesto_id] || 0) + +m.monto
  return db.presupuesto.filter(p => !periodo || p.periodo === periodo).map(p => { const e = exec[p.id] || 0; return { ...p, monto: +p.monto, ejecutado: e, diferencia: +p.monto - e, pct: +p.monto > 0 ? Math.round(e / +p.monto * 100) : 0 } })
}

// Cruce hogar/empresa: entidad beneficiaria ≠ entidad dueña de la cuenta (cuando ambas son conocidas)
export function esCruce(m, ix) {
  const cta = ix.cta[m.cuenta_id]; if (!cta || !cta.entidad_id || !m.entidad_id) return false
  const eCta = ix.ent[cta.entidad_id], eMov = ix.ent[m.entidad_id]
  if (!eCta || !eMov) return false
  if (eCta.tipo === 'grupo' || eMov.tipo === 'grupo') return false // "Familia" no cuenta como cruce
  return (eCta.tipo === 'empresa') !== (eMov.tipo === 'empresa')
}
