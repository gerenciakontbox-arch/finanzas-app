// Cálculo del perfil financiero por usuario (finalidad "perfil") y de las señales comerciales (finalidad
// "comercial"). Corre en el servidor con la service_role; solo escribe para usuarios con la finalidad vigente.
// Para agregar una señal: una fila en senales_def + una función en SENALES (misma clave).
import { admin, hoyBogota } from './_push.mjs'

const mes = d => String(d).slice(0, 7)
const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7) }
const dias = (a, b) => Math.round((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 864e5)
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) : 0
const cfFija = (cap, tm, n) => { const r = (tm || 0) / 100; if (!n) return 0; if (r === 0) return cap / n; return cap * r / (1 - Math.pow(1 + r, -n)) }

// Carga en memoria todo lo que el usuario puede ver (sus espacios). Escala bien hasta miles de filas por usuario.
async function datosDe(sb, uid) {
  const { data: ms } = await sb.from('espacio_miembros').select('espacio_id,rol').eq('user_id', uid)
  const ids = (ms || []).map(m => m.espacio_id); if (!ids.length) return null
  const { data: espacios } = await sb.from('espacios').select('id,tipo,nombre,dueno_id').in('id', ids)
  const personal = (espacios || []).find(e => e.tipo === 'personal' && e.dueno_id === uid)
  const q = t => sb.from(t).select('*').in('espacio_id', ids)
  const [mov, pre, prog, deu, cuo, abo, act, cta, car, cat] = await Promise.all([q('movimientos'), q('presupuesto'), q('programado'), q('deudas'), q('cuotas_pagadas'), q('abonos_capital'), q('activos'), q('cuentas'), q('tc_cargos'), q('categorias')].map(p => p.then(r => r.data || [])))
  return { uid, ids, espacios, personal, mov, pre, prog, deu, cuo, abo, act, cta, car, cat }
}

export function indicadores(d, hoy) {
  const pid = d.personal?.id; const m0 = mes(hoy); const m3 = [addMonths(m0, -1), addMonths(m0, -2), addMonths(m0, -3)]
  const catNombre = Object.fromEntries(d.cat.map(c => [c.id, c.nombre]))
  const movP = d.mov.filter(m => m.espacio_id === pid)
  // Ingresos (personal: Ingreso + recibidos de empresa ya caen como Ingreso espejo)
  const ingPorMes = m3.map(mm => movP.filter(m => m.tipo === 'Ingreso' && mes(m.fecha) === mm).reduce((a, m) => a + +m.monto, 0))
  const ingresos_mes = Math.round(ingPorMes.reduce((a, b) => a + b, 0) / 3)
  const mesesHonorarios = m3.filter(mm => movP.some(m => m.tipo === 'Ingreso' && mes(m.fecha) === mm && /honorario/i.test(catNombre[m.categoria_id] || m.descripcion || ''))).length
  // Puntualidad (6 meses): programado completado donde el usuario pagó (personal o pagador)
  const comp = d.prog.filter(p => p.estado === 'Completado' && p.completado_en && dias(hoy, p.vencimiento) <= 183 && (p.espacio_id === pid || p.pagador_id === d.uid))
  const atrasos = comp.map(p => Math.max(0, dias(p.completado_en, p.vencimiento)))
  const puntualidad_pct = comp.length ? pct(atrasos.filter(x => x === 0).length, comp.length) : null
  const atraso_promedio_dias = comp.length ? Math.round(atrasos.reduce((a, b) => a + b, 0) / comp.length) : null
  const vencidos = d.prog.filter(p => p.estado === 'Pendiente' && p.vencimiento < hoy && (p.espacio_id === pid || p.pagador_id === d.uid)).length
  // Presupuesto (3 meses cerrados) en el espacio personal
  const ejec = {}; for (const m of movP) if (m.presupuesto_id && m.tipo === 'Salida') ejec[m.presupuesto_id] = (ejec[m.presupuesto_id] || 0) + +m.monto
  const presMeses = m3.map(mm => { const rows = d.pre.filter(p => p.espacio_id === pid && mes(p.periodo) === mm); const plan = rows.reduce((a, p) => a + +p.monto, 0); const ex = rows.reduce((a, p) => a + (ejec[p.id] || 0), 0); return plan > 0 ? pct(ex, plan) : null }).filter(x => x !== null)
  const presupuesto_ejecucion_pct = presMeses.length ? Math.round(presMeses.reduce((a, b) => a + b, 0) / presMeses.length) : null
  const meses_desbordados = presMeses.filter(x => x > 110).length
  // Deuda: créditos activos en mis espacios donde soy dueño del espacio personal o pagador
  const creditos = d.deu.filter(x => x.estado === 'Activo' && (x.espacio_id === pid || d.espacios.find(e => e.id === x.espacio_id)?.tipo !== 'personal'))
  const capPrevias = x => { const k = +x.cuotas_previas || 0; if (!k) return 0; if (x.sistema === 'capital') return +x.capital_inicial / x.total_cuotas * k; const cf = cfFija(+x.capital_inicial, +x.tasa_mensual, x.total_cuotas); let s = +x.capital_inicial, pag = 0; for (let i = 0; i < k; i++) { const cap = cf - s * (+x.tasa_mensual / 100); pag += cap; s -= cap } return pag }
  const capPagado = id => { const x = d.deu.find(y => y.id === id); return capPrevias(x) + d.cuo.filter(c => c.deuda_id === id).reduce((a, c) => a + (+c.capital || 0), 0) + d.abo.filter(a => a.deuda_id === id).reduce((a, x) => a + +x.monto, 0) }
  const saldoCred = creditos.reduce((a, x) => a + Math.max(0, +x.capital_inicial - capPagado(x.id)), 0)
  const cargaMes = creditos.reduce((a, x) => a + (x.sistema === 'capital' ? +x.capital_inicial / x.total_cuotas + Math.max(0, +x.capital_inicial - capPagado(x.id)) * +x.tasa_mensual / 100 : cfFija(+x.capital_inicial, +x.tasa_mensual, x.total_cuotas)) + (+x.seguro_mensual || 0), 0)
  const tcs = d.cta.filter(c => c.tipo === 'Tarjeta crédito' && c.espacio_id === pid)
  const saldoTC = tcs.reduce((a, t) => a + d.car.filter(c => c.cuenta_id === t.id).reduce((s, c) => { const pag = d.cuo.filter(x => x.cargo_id === c.id).length + (+c.cuotas_previas || 0); return s + +c.monto * Math.max(0, c.cuotas - pag) / c.cuotas }, 0), 0)
  const cupo = tcs.reduce((a, t) => a + (+t.cupo || 0), 0)
  // Hábito de registro: salidas manuales anotadas el mismo día (90 días)
  const manuales = movP.filter(m => m.origen === 'manual' && m.tipo === 'Salida' && m.creado_en && dias(hoy, m.fecha) <= 90)
  const registro_mismo_dia_pct = manuales.length ? pct(manuales.filter(m => m.creado_en.slice(0, 10) === m.fecha).length, manuales.length) : null
  // Patrimonio
  const neto = a => { if (!a.vida_util_meses) return +a.valor_estimado || 0; const base = +(a.valor_base ?? a.valor_estimado) || 0, res = Math.min(+a.valor_residual || 0, base); const desde = a.fecha_base || a.fecha_adquisicion; if (!desde) return base; const d0 = new Date(desde + 'T12:00:00'), d1 = new Date(hoy + 'T12:00:00'); const ms = Math.max(0, Math.min(a.vida_util_meses, (d1.getFullYear() - d0.getFullYear()) * 12 + d1.getMonth() - d0.getMonth())); return Math.round(base - (base - res) * ms / a.vida_util_meses) }
  const activosNeto = d.act.filter(a => a.espacio_id === pid).reduce((a, x) => a + neto(x), 0)
  const saldoCuentas = d.cta.filter(c => c.espacio_id === pid && c.tipo !== 'Tarjeta crédito').reduce((a, c) => a + (+c.saldo_inicial || 0) + movP.filter(m => m.cuenta_id === c.id && !(c.fecha_corte && m.fecha <= c.fecha_corte)).reduce((s, m) => s + (m.tipo === 'Ingreso' || (m.tipo === 'Transferencia' && m.subtipo !== 'aporte' && m.subtipo !== 'traslado') ? +m.monto : -m.monto), 0) + movP.filter(m => m.subtipo === 'traslado' && m.cuenta_destino_id === c.id && !(c.fecha_corte && m.fecha <= c.fecha_corte)).reduce((s, m) => s + +m.monto, 0), 0)
  const patrimonio_neto = Math.round(activosNeto + saldoCuentas - saldoCred - saldoTC)
  // Aportes a espacios compartidos (mes actual y anterior, promedio)
  const aportes_mes = Math.round([m0, addMonths(m0, -1)].map(mm => movP.filter(m => m.tipo === 'Transferencia' && m.subtipo === 'aporte' && mes(m.fecha) === mm).reduce((a, m) => a + +m.monto, 0)).reduce((a, b) => a + b, 0) / 2)
  const carga_deuda_pct = ingresos_mes > 0 ? pct(cargaMes, ingresos_mes) : null
  // Salud 0–100: puntualidad 30 · presupuesto 25 · carga de deuda 25 · registro 10 · patrimonio 10
  const sPunt = puntualidad_pct == null ? 20 : Math.round(puntualidad_pct * 0.3)
  const sPres = presupuesto_ejecucion_pct == null ? 15 : presupuesto_ejecucion_pct <= 100 ? 25 : Math.max(0, 25 - (presupuesto_ejecucion_pct - 100))
  const sDeu = carga_deuda_pct == null ? (creditos.length ? 10 : 25) : carga_deuda_pct <= 30 ? 25 : carga_deuda_pct <= 50 ? 15 : carga_deuda_pct <= 70 ? 5 : 0
  const sReg = registro_mismo_dia_pct == null ? 5 : Math.round(registro_mismo_dia_pct * 0.1)
  const sPat = patrimonio_neto > 0 ? 10 : 0
  const salud = Math.min(100, sPunt + sPres + sDeu + sReg + sPat)
  const salud_explicacion = `Puntualidad ${sPunt}/30 · presupuesto ${sPres}/25 · carga de deuda ${sDeu}/25 · registro ${sReg}/10 · patrimonio ${sPat}/10.`
  return {
    salud, salud_explicacion, puntualidad_pct, atraso_promedio_dias, vencidos, presupuesto_ejecucion_pct, meses_desbordados, ingresos_mes, meses_honorarios: mesesHonorarios,
    carga_deuda_pct, creditos_activos: creditos.length, saldo_creditos: Math.round(saldoCred), tc_uso_pct: cupo > 0 ? pct(saldoTC, cupo) : null, patrimonio_neto, registro_mismo_dia_pct, aportes_mes,
    espacios_hogar: d.espacios.filter(e => e.tipo === 'hogar').length, espacios_empresa: d.espacios.filter(e => e.tipo === 'empresa').length,
  }
}

// Señales comerciales (hipótesis). Reciben indicadores + datos crudos y devuelven true/false.
export const SENALES = {
  honorarios_sin_empresa: (i, d) => i.meses_honorarios >= 2 && i.espacios_empresa === 0,
  empresa_activa: (i, d, hoy) => d.espacios.some(e => e.tipo === 'empresa' && d.mov.filter(m => m.espacio_id === e.id && dias(hoy, m.fecha) <= 30).length >= 5),
  creditos_multiples: i => i.creditos_activos >= 2,
  presupuesto_desbordado: i => i.meses_desbordados >= 3,
  activos_sin_cobertura: (i, d) => d.act.some(a => ['Vehículo', 'Inmueble'].includes(a.tipo) && !d.prog.some(p => p.activo_id === a.id && p.tipo === 'Seguro')),
}

export async function calcularPara(sb, uid, hoy = hoyBogota()) {
  const [{ data: cPerfil }, { data: cCom }] = await Promise.all([sb.rpc('consiente', { p_user: uid, p_finalidad: 'perfil' }), sb.rpc('consiente', { p_user: uid, p_finalidad: 'comercial' })])
  if (!cPerfil) { await sb.from('perfil_usuario').delete().eq('user_id', uid); return { uid, perfil: false } }
  const d = await datosDe(sb, uid); if (!d) return { uid, perfil: false }
  const ind = indicadores(d, hoy)
  const { data: defs } = await sb.from('senales_def').select('codigo').eq('activa', true)
  const senales = (defs || []).map(x => x.codigo).filter(k => SENALES[k] && SENALES[k](ind, d, hoy))
  const { data: prev } = await sb.from('perfil_usuario').select('codigo').eq('user_id', uid).maybeSingle()
  const codigo = prev?.codigo || 'U-' + Math.random().toString(16).slice(2, 8).toUpperCase()
  const { error } = await sb.from('perfil_usuario').upsert({ user_id: uid, codigo, indicadores: ind, senales, version: 1, calculado_en: new Date().toISOString() }, { onConflict: 'user_id' }); if (error) throw new Error(error.message)
  if (cCom && senales.length) {
    const { error: e2 } = await sb.from('ofertas').upsert(senales.map(s => ({ user_id: uid, senal: s })), { onConflict: 'user_id,senal', ignoreDuplicates: true }); if (e2) console.error('ofertas', e2.message)
  }
  return { uid, perfil: true, senales }
}

export async function calcularTodos(sb) {
  const { data: users, error } = await sb.from('consentimientos').select('user_id').eq('finalidad', 'perfil'); if (error) throw new Error(error.message)
  const uids = [...new Set((users || []).map(u => u.user_id))]
  let ok = 0, fallos = 0
  for (const uid of uids) { try { await calcularPara(sb, uid); ok++ } catch (e) { fallos++; console.error('perfil', uid, e.message) } }
  const { data: podados } = await sb.rpc('podar_eventos', { p_dias: 90 })
  return { usuarios: uids.length, ok, fallos, eventos_podados: podados }
}
