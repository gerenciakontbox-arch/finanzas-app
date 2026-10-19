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

// ── Aportes entre espacios ───────────────────────────────────────────────────
// En el espacio personal: aportes hechos y dinero recibido, por espacio compartido (espejos).
export function aportesPorEspacio(all, personalId, mes) {
  const out = {}
  for (const m of all.movimientos) {
    if (m.espacio_id !== personalId || !m.espejo_de || !m.espacio_contraparte) continue
    if (mes && !m.fecha.startsWith(mes)) continue
    const o = (out[m.espacio_contraparte] ||= { aportes: 0, recibidos: 0, ingresos: 0 })
    if (m.subtipo === 'aporte') o.aportes += +m.monto
    else if (m.tipo === 'Ingreso') o.ingresos += +m.monto // honorarios/salario desde una empresa: ya cuenta como ingreso normal
    else o.recibidos += +m.monto // recibido, devolución (transferencias)
  }
  return out
}
// En un espacio compartido: qué puso cada miembro (pagador) y qué recibió, en el mes o acumulado.
export function aportesPorMiembro(all, espacioId, mes, duenoCuenta) {
  const out = {}
  for (const m of all.movimientos) {
    if (m.espacio_id !== espacioId || m.espejo_de) continue
    if (mes && !m.fecha.startsWith(mes)) continue
    const cta = all.cuentas.find(c => c.id === m.cuenta_id); const d = cta ? duenoCuenta(cta) : null
    if (d) { const o = (out[d] ||= { aportes: 0, recibidos: 0 }); if (m.tipo === 'Salida' || (m.tipo === 'Transferencia' && m.subtipo === 'traslado')) o.aportes += +m.monto; else if (m.tipo === 'Ingreso') o.recibidos += +m.monto }
    const cd = all.cuentas.find(c => c.id === m.cuenta_destino_id); const d2 = cd ? duenoCuenta(cd) : null
    if (d2 && m.tipo === 'Salida') { const o = (out[d2] ||= { aportes: 0, recibidos: 0 }); o.recibidos += +m.monto }
  }
  return out
}
// Rubros de presupuestos compartidos asignados a mí → aporte planificado por espacio
export function aportesPlanificados(all, periodo, userId, personalId) {
  const out = {}
  for (const p of all.presupuesto) {
    if (p.espacio_id === personalId || p.periodo !== periodo || p.pagador_id !== userId || p.estado === 'Cancelado') continue
    out[p.espacio_id] = (out[p.espacio_id] || 0) + +p.monto
  }
  return out
}
