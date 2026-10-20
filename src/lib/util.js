export const fmtCOP = v => '$ ' + Math.round(Number(v) || 0).toLocaleString('es-CO')
export const fmtDate = d => { if (!d) return '—'; const [y, m, day] = String(d).slice(0, 10).split('-'); return `${day}/${m}/${y}` }
export const today = () => new Date().toISOString().slice(0, 10)
export const addDays = (d, n) => { const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10) }
export const addMonths = (d, n) => { const dt = new Date(d + 'T12:00:00'); dt.setMonth(dt.getMonth() + n); return dt.toISOString().slice(0, 10) }
export const daysLeft = d => Math.round((new Date(d + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5)
export const primeroDelMes = (d = today()) => d.slice(0, 7) + '-01'

export const cfFija = (cap, tm, n) => { const r = (tm || 0) / 100; if (!n) return 0; if (r === 0) return cap / n; return cap * r / (1 - Math.pow(1 + r, -n)) }
// Tabla de amortización. sistema: 'fija' (cuota fija, francés) | 'capital' (abono constante a capital, cuota decreciente).
// seguro: valor fijo mensual que se suma a cada cuota (no amortiza). pagadas: {n: {capital, interes, seguro}} de cuotas ya pagadas
// (se respetan tal cual). abonos: [{monto, modo: 'plazo'|'cuota', despues_de_cuota}] → recalculan el saldo pendiente:
// 'plazo' mantiene la cuota y acorta el plazo; 'cuota' mantiene el plazo y baja la cuota.
export const amortizacion = ({ capital, tasa, n, fechaInicio, sistema = 'fija', seguro = 0, pagadas = {}, abonos = [] }) => {
  const r = (tasa || 0) / 100; const seg = +seguro || 0
  let s = +capital; let i = 0; let cf = sistema === 'fija' ? cfFija(s, tasa, n) : null; let capFijo = sistema === 'capital' ? s / n : null
  let restantes = n; const out = []; const ab = [...abonos].sort((a, b) => a.despues_de_cuota - b.despues_de_cuota)
  const aplicar = k => { for (const a of ab.filter(x => +x.despues_de_cuota === k)) { s = Math.max(0, s - +a.monto); if (a.modo === 'cuota') { if (sistema === 'fija') cf = cfFija(s, tasa, restantes); else capFijo = s / restantes } } }
  aplicar(0)
  while (s > 0.5 && i < n * 3) {
    i++
    const interes = s * r
    let cap = sistema === 'fija' ? cf - interes : capFijo
    const p = pagadas[i]
    if (p && p.capital != null) { cap = +p.capital }
    if (cap > s || (sistema === 'capital' && restantes === 1)) cap = s           // última cuota ajusta
    const int = p && p.interes != null ? +p.interes : interes
    s = Math.max(0, s - cap); restantes--
    out.push({ n: i, fecha: addMonths(fechaInicio, i - 1), capital: Math.round(cap), interes: Math.round(int), seguro: Math.round(p && p.seguro != null ? +p.seguro : seg), total: Math.round(cap + int + (p && p.seguro != null ? +p.seguro : seg)), saldo: Math.round(s) })
    aplicar(i)
    if (restantes <= 0 && s > 0.5) { restantes = 1 } // modo 'plazo' nunca deja saldo colgado: una cuota más
  }
  return out
}

export const GRUPOS = ['Fijo', 'Variable', 'Provisión', 'Amortización crédito', 'Depreciación activo']
export const ESTADOS_P = ['Planificado', 'Programado', 'Pagado', 'Cancelado']
export const TIPOS_DEUDA = ['Hipotecario', 'Vehicular', 'Consumo', 'Microcrédito', 'Otro']
export const TIPOS_ACTIVO = ['Inmueble', 'Vehículo', 'Moto', 'Equipo', 'Otro']
export const TIPOS_PROG = ['Impuesto', 'Seguro', 'Mantenimiento', 'Cuota crédito', 'Servicio', 'Suscripción', 'Nómina', 'Honorarios', 'Arriendo', 'Otro']
export const PERIODICIDADES = ['Semanal', 'Quincenal', 'Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Puntual']
export const TIPOS_CTA = ['Bancaria', 'Billetera digital', 'Efectivo', 'Tarjeta crédito', 'Otro']
export const TC = 'Tarjeta crédito'
