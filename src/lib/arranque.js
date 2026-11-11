// Arranque progresivo. Decisión del dueño (lote 8): el hábito central de la familia es PAGAR LO PROGRAMADO, y un usuario
// nuevo ve solo lo necesario para eso hasta que lo haga. Todo se deriva del estado de los datos (sin tablas nuevas);
// el único interruptor guardado es `modo_completo` en los metadatos del usuario. Puro y probado (test/arranque.test.mjs).
import { TC, addDays } from './util.js'

// días desde hoy hasta d (negativo = pasado); `hoy` se pasa explícito para que sea probable sin reloj
const daysLeft = (d, hoy) => Math.round((new Date(d + 'T12:00:00') - new Date(hoy + 'T12:00:00')) / 864e5)

// Niveles: 0 sin cuenta de pago · 1 sin pagos programados · 2 programados sin ningún pago hecho ·
// 3 ya pagó algo (se abre Movimientos) · 4 lleva una semana pagando o 5 pagos (se abre todo).
export function nivelArranque(db, hoy) {
  const caja = (db.cuentasPropias || db.cuentas || []).filter(c => c.tipo !== TC)
  const prog = db.programado || []
  const pagos = (db.movimientos || []).filter(m => m.origen === 'programado' && !m.espejo_de).sort((a, b) => a.fecha.localeCompare(b.fecha))
  if (!caja.length) return 0
  if (!prog.length) return 1
  if (!pagos.length) return 2
  const primero = pagos[0].fecha
  if (pagos.length >= 5 || -daysLeft(primero, hoy) >= 7) return 4
  return 3
}

// Pestañas visibles por nivel (claves de App.jsx). 'plan' muestra solo Programado hasta el nivel 4.
export function tabsVisibles(nivel, modoCompleto) {
  if (modoCompleto || nivel >= 4) return ['dashboard', 'movimientos', 'plan', 'deudas', 'activos', 'config']
  if (nivel >= 3) return ['dashboard', 'movimientos', 'plan', 'config']
  return ['dashboard', 'plan', 'config']
}
export const presupuestoVisible = (nivel, modoCompleto) => modoCompleto || nivel >= 4

// Una sola tarea a la vez, resuelta en menos de dos minutos, con el botón que la abre.
// Devuelve { clave, titulo, detalle, cta, ir, arg } o null si todo está al día.
export function siguientePaso(db, hoy) {
  const caja = (db.cuentasPropias || db.cuentas || []).filter(c => c.tipo !== TC)
  const prog = db.programado || []
  const pend = prog.filter(p => p.estado === 'Pendiente')
  const vencidos = pend.filter(p => daysLeft(p.vencimiento, hoy) < 0)
  const hoyVence = pend.filter(p => daysLeft(p.vencimiento, hoy) === 0)
  const pagos = (db.movimientos || []).filter(m => m.origen === 'programado' && !m.espejo_de)
  const n = nivelArranque(db, hoy)

  if (n === 0) return { clave: 'cuenta', titulo: 'Crea la cuenta desde la que pagas', detalle: 'Solo el nombre (por ejemplo "Bancolombia" o "Nequi"). El saldo lo pones después, cuando quieras ver cuánto te queda.', cta: 'Crear cuenta', ir: 'config', arg: { seccion: 'cuentas', nuevaCuenta: true } }
  if (n === 1) return { clave: 'pagos_fijos', titulo: 'Anota lo que pagas todos los meses', detalle: 'Arriendo, servicios, colegio, tarjeta, crédito… Marca los tuyos, pon el valor y el día. Dos minutos. Desde ahí la app te avisa qué toca pagar.', cta: 'Anotar mis pagos fijos', ir: 'programado', arg: { pagosFijos: true } }
  if (vencidos.length) { const t = vencidos.reduce((a, p) => a + +p.monto, 0); return { clave: 'vencidos', titulo: vencidos.length === 1 ? `Se venció ${vencidos[0].nombre}` : `Tienes ${vencidos.length} pagos vencidos`, detalle: `Si ya los pagaste, márcalos para que la app los dé por hechos. Si no, hazlo hoy: ${fmt(t)}.`, cta: 'Ver y pagar', ir: 'programado', arg: {}, pagar: vencidos } }
  if (hoyVence.length) { const t = hoyVence.reduce((a, p) => a + +p.monto, 0); return { clave: 'hoy', titulo: hoyVence.length === 1 ? `Hoy vence ${hoyVence[0].nombre}` : `Hoy vencen ${hoyVence.length} pagos`, detalle: `Total ${fmt(t)}. Págalos y márcalos aquí mismo.`, cta: 'Pagar', ir: 'programado', arg: {}, pagar: hoyVence } }
  // ya paga: afinar poco a poco
  const sinSaldo = caja.filter(c => !(+c.saldo_inicial))
  if (pagos.length >= 3 && sinSaldo.length) return { clave: 'saldo', titulo: `Pon el saldo de ${sinSaldo[0].nombre}`, detalle: 'Con el saldo real de hoy, Inicio te muestra cuánto te queda disponible después de cada pago.', cta: 'Poner saldo', ir: 'config', arg: { seccion: 'cuentas', editar: sinSaldo[0].id } }
  const tarjetasProg = pend.filter(p => /tarjeta|tc\b|visa|master|amex|cmr|nu\b/i.test(p.nombre) && !p.deuda_id)
  const tcs = (db.cuentasPropias || db.cuentas || []).filter(c => c.tipo === TC)
  if (pagos.length >= 2 && tarjetasProg.length && !tcs.length) return { clave: 'tarjeta', titulo: `Convierte "${tarjetasProg[0].nombre}" en una tarjeta de verdad`, detalle: 'Si creas la tarjeta y cargas el extracto PDF, la app te muestra las compras a cuotas, los intereses y cuánto te queda de cupo.', cta: 'Crear tarjeta', ir: 'config', arg: { seccion: 'cuentas', nuevaCuenta: true, tipo: TC } }
  if (n >= 4 && !(db.presupuesto || []).length && prog.length >= 3) return { clave: 'presupuesto', titulo: 'Arma tu presupuesto en un toque', detalle: 'Lo que ya pagas cada mes es el 80 % de tu presupuesto. La app lo arma desde tus pagos programados y tú ajustas.', cta: 'Ver presupuesto', ir: 'presupuesto', arg: {} }
  const prox = pend.slice().sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))[0]
  if (prox) { const d = daysLeft(prox.vencimiento, hoy); return { clave: 'al_dia', titulo: 'Todo al día', detalle: `Lo próximo: ${prox.nombre}, ${d === 1 ? 'mañana' : `en ${d} días`} (${fmt(+prox.monto)}).`, cta: null, ir: 'programado', arg: {} } }
  return null
}

// Pagos fijos típicos de un hogar colombiano, para arrancar marcando. [clave, nombre, tipo, categoría sugerida, día por defecto]
export const PAGOS_FIJOS = [
  ['arriendo', 'Arriendo o cuota de vivienda', 'Arriendo', 'Vivienda', 5],
  ['administracion', 'Administración', 'Servicio', 'Vivienda', 10],
  ['servicios', 'Servicios públicos (luz, agua, gas)', 'Servicio', 'Servicios públicos', 15],
  ['internet', 'Internet y televisión', 'Servicio', 'Servicios públicos', 20],
  ['celular', 'Plan de celular', 'Servicio', 'Servicios públicos', 20],
  ['colegio', 'Colegio o universidad', 'Servicio', 'Educación', 5],
  ['salud', 'Medicina prepagada o EPS', 'Seguro', 'Salud', 10],
  ['tarjeta', 'Tarjeta de crédito', 'Cuota crédito', 'Otro', 25],
  ['credito', 'Cuota de crédito', 'Cuota crédito', 'Otro', 15],
  ['seguro', 'Seguro (carro, vida, hogar)', 'Seguro', 'Seguros', 1],
  ['suscripciones', 'Suscripciones (Netflix, Spotify…)', 'Suscripción', 'Entretenimiento', 1],
  ['mercado', 'Mercado quincenal', 'Otro', 'Mercado', 15],
]

// Próximo vencimiento para un día del mes a partir de hoy (si el día ya pasó este mes, el mes que viene).
export function proximoDia(dia, hoy) {
  const [y, m] = hoy.split('-').map(Number)
  const enMes = (yy, mm) => { const ult = new Date(yy, mm, 0).getDate(); return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(dia, ult)).padStart(2, '0')}` }
  const f = enMes(y, m)
  if (f >= hoy) return f
  return m === 12 ? enMes(y + 1, 1) : enMes(y, m + 1)
}

const fmt = n => '$ ' + Math.round(n).toLocaleString('es-CO')
export { addDays }
