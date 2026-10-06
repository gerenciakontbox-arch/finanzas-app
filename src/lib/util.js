export const fmtCOP = v => '$ ' + Math.round(Number(v) || 0).toLocaleString('es-CO')
export const fmtDate = d => { if (!d) return '—'; const [y, m, day] = String(d).slice(0, 10).split('-'); return `${day}/${m}/${y}` }
export const today = () => new Date().toISOString().slice(0, 10)
export const addDays = (d, n) => { const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10) }
export const addMonths = (d, n) => { const dt = new Date(d + 'T12:00:00'); dt.setMonth(dt.getMonth() + n); return dt.toISOString().slice(0, 10) }
export const daysLeft = d => Math.round((new Date(d + 'T12:00:00') - new Date(today() + 'T12:00:00')) / 864e5)
export const primeroDelMes = (d = today()) => d.slice(0, 7) + '-01'

export const cfFija = (cap, tm, n) => { const r = (tm || 0) / 100; if (!n) return 0; if (r === 0) return cap / n; return cap * r / (1 - Math.pow(1 + r, -n)) }
export const amortizacion = ({ capital, tasa, n, fechaInicio }) => {
  const r = (tasa || 0) / 100; const cf = cfFija(capital, tasa, n); let s = capital
  return Array.from({ length: n }, (_, i) => {
    const interes = s * r; const cap = cf - interes; s = Math.max(0, s - cap)
    return { n: i + 1, fecha: addMonths(fechaInicio, i), capital: Math.round(cap), interes: Math.round(interes), total: Math.round(cf), saldo: Math.round(s) }
  })
}

export const GRUPOS = ['Fijo', 'Variable', 'Provisión', 'Amortización crédito', 'Depreciación activo']
export const ESTADOS_P = ['Planificado', 'Programado', 'Pagado', 'Cancelado']
export const TIPOS_DEUDA = ['Hipotecario', 'Vehicular', 'Consumo', 'Microcrédito', 'Otro']
export const TIPOS_ACTIVO = ['Inmueble', 'Vehículo', 'Moto', 'Equipo', 'Otro']
export const TIPOS_PROG = ['Impuesto', 'Seguro', 'Mantenimiento', 'Cuota crédito', 'Servicio', 'Suscripción', 'Nómina', 'Honorarios', 'Arriendo', 'Otro']
export const PERIODICIDADES = ['Semanal', 'Quincenal', 'Mensual', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Puntual']
export const TIPOS_CTA = ['Bancaria', 'Billetera digital', 'Efectivo', 'Tarjeta crédito', 'Otro']
export const TC = 'Tarjeta crédito'
