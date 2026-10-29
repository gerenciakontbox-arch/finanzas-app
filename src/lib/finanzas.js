// Cálculos derivados sobre las tablas del hogar. Puros: reciben db, devuelven datos.
import { amortizacion, cfFija, addMonths, TC } from './util.js'

// Mapa de cuotas pagadas: { deuda: {deudaId: {n: fila}}, cargo: {cargoId: {n: fila}} }
export function indicePagadas(cuotas_pagadas) {
  const deuda = {}, cargo = {}
  for (const c of cuotas_pagadas || []) {
    if (c.deuda_id) (deuda[c.deuda_id] ||= {})[c.numero] = c
    if (c.cargo_id) (cargo[c.cargo_id] ||= {})[c.numero] = c
  }
  return { deuda, cargo }
}

const conPrevias = (pag, n) => { const out = { ...pag }; for (let i = 1; i <= (n || 0); i++) if (!out[i]) out[i] = { previa: true, numero: i, fecha_pago: null, monto_pagado: null }; return out }
export function resumenDeuda(d, idx, abonos = [], ajustes = []) {
  const pag = conPrevias(idx.deuda[d.id] || {}, d.cuotas_previas)
  const misAbonos = abonos.filter(a => a.deuda_id === d.id), misAjustes = ajustes.filter(a => a.deuda_id === d.id)
  const am = amortizacion({ capital: +d.capital_inicial, tasa: +d.tasa_mensual, n: d.total_cuotas, fechaInicio: d.fecha_primera_cuota, sistema: d.sistema || 'fija', seguro: +d.seguro_mensual || 0, pagadas: pag, abonos: misAbonos, ajustes: misAjustes })
  const rows = am.map(c => ({ ...c, pago: pag[c.n] || null }))
  const pendientes = rows.filter(c => !c.pago)
  const capitalPagado = rows.filter(c => c.pago).reduce((a, c) => a + c.capital, 0) + misAbonos.reduce((a, x) => a + +x.monto, 0)
  const capitalPendiente = pendientes.reduce((a, c) => a + c.capital, 0)
  const ultimoAjuste = misAjustes.slice().sort((a, b) => b.despues_de_cuota - a.despues_de_cuota || (b.fecha || '').localeCompare(a.fecha || ''))[0] || null
  // % amortizado sobre lo que realmente hay que pagar (capital inicial, o saldo real + lo ya pagado si hubo ajuste)
  const base = ultimoAjuste ? capitalPagado + capitalPendiente : +d.capital_inicial
  return { ...d, am: rows, cuotasTotales: rows.length, pagadas: rows.length - pendientes.length, capitalPagado, capitalPendiente, pct: base > 0 ? Math.round(capitalPagado / base * 100) : 0, proxima: pendientes[0] || null, cf: pendientes[0] ? pendientes[0].total : 0, abonos: misAbonos, ajustes: misAjustes, ultimoAjuste }
}

// Depreciación lineal mensual con valor residual. Devuelve null si el activo no deprecia.
export function depreciacion(a, hoy) {
  if (!a.vida_util_meses) return null
  const base = +(a.valor_base ?? a.valor_estimado) || 0, residual = Math.min(+a.valor_residual || 0, base), vida = +a.vida_util_meses
  const desde = a.fecha_base || a.fecha_adquisicion; if (!desde) return { base, residual, vida, meses: 0, acumulada: 0, neto: base }
  const d0 = new Date(desde + 'T12:00:00'), d1 = new Date((hoy || new Date().toISOString().slice(0, 10)) + 'T12:00:00')
  const meses = Math.max(0, Math.min(vida, (d1.getFullYear() - d0.getFullYear()) * 12 + (d1.getMonth() - d0.getMonth()) + (d1.getDate() >= d0.getDate() ? 0 : -1)))
  const mensual = (base - residual) / vida
  const acumulada = Math.round(mensual * meses)
  return { base, residual, vida, meses, mensual: Math.round(mensual), acumulada, neto: base - acumulada, pct: Math.round(meses / vida * 100) }
}
export const valorNeto = (a, hoy) => { const d = depreciacion(a, hoy); return d ? d.neto : +a.valor_estimado || 0 }

export function resumenCargo(c, idx) {
  const am = amortizacion({ capital: +c.monto, tasa: +c.tasa_mensual, n: c.cuotas, fechaInicio: c.primera_cuota || addMonths(c.fecha, 1) })
  const pag = conPrevias(idx.cargo[c.id] || {}, c.cuotas_previas)
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
  const cred = db.deudas.filter(d => d.estado === 'Activo').reduce((a, d) => a + resumenDeuda(d, idx, db.abonos_capital || [], db.ajustes_saldo_deuda || []).capitalPendiente, 0)
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

// ── Deuda vs costo financiero ───────────────────────────────────────────────
// Lee el desglose de los pagos de crédito y de tarjeta: el capital baja la deuda (no es gasto); interés, seguros,
// mora, manejo y otros son el costo financiero real. Devuelve totales y el gasto del mes sin capital.
export function costoFinanciero(movimientos) {
  const t = { capital: 0, interes: 0, seguro: 0, mora: 0, manejo: 0, otros: 0, parcial: 0 }
  let n = 0
  for (const m of movimientos) {
    if (m.tipo !== 'Salida' || m.espejo_de || !(m.deuda_id || m.tc_cuenta_id)) continue
    const d = m.desglose || {}; const x = m.tc_cuenta_id ? (d.extras || {}) : d
    n++
    t.capital += +d.capital || 0; t.interes += (+d.interes || 0) + (+x.intereses || 0)
    t.seguro += (+d.seguro || 0) + (+x.seguros || 0); t.mora += +x.mora || 0; t.manejo += +x.cuota_manejo || 0; t.otros += +x.otros || 0
    t.parcial += +x.parcial || 0
  }
  const costo = t.interes + t.seguro + t.mora + t.manejo + t.otros
  return { ...t, costo, pagos: n, total: t.capital + costo + t.parcial }
}
// Gastos por categoría para informes: los pagos de deuda se parten en 'Costo financiero' (sin el capital).
export function gastosPorCategoria(movimientos, cat) {
  const out = {}
  for (const m of movimientos) {
    if (m.tipo !== 'Salida') continue
    const d = m.desglose || {}
    if ((m.deuda_id || m.tc_cuenta_id) && d.capital != null) { const c = Math.max(0, +m.monto - (+d.capital || 0)); if (c > 0) out['Costo financiero'] = (out['Costo financiero'] || 0) + c; continue }
    const nombre = cat[m.categoria_id]?.nombre || 'Sin categoría'; out[nombre] = (out[nombre] || 0) + +m.monto
  }
  return out
}
// Salidas del mes por etiqueta (un movimiento con varias etiquetas cuenta completo en cada una: no hay reparto).
export function porEtiqueta(movimientos, etiquetas) {
  const out = {}
  for (const e of etiquetas) out[e.id] = { etiqueta: e, salidas: 0, ingresos: 0, n: 0 }
  for (const m of movimientos) for (const id of m.etiqueta_ids || []) { const o = out[id]; if (!o) continue; o.n++; if (m.tipo === 'Salida') o.salidas += +m.monto; else if (m.tipo === 'Ingreso') o.ingresos += +m.monto }
  return Object.values(out).filter(o => o.n > 0).sort((a, b) => b.salidas - a.salidas)
}
