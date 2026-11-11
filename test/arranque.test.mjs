// Arranque progresivo: nivel, pestañas visibles, siguiente paso y próximo vencimiento. Decisión: hábito = pagar lo programado.
import { nivelArranque, tabsVisibles, siguientePaso, proximoDia, presupuestoVisible } from '../src/lib/arranque.js'
let fallos = 0; const ok = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fallos++ }
const hoy = '2026-11-10'
const cta = { id: 'c1', nombre: 'Bancolombia', tipo: 'Bancaria', saldo_inicial: null }
const prog = (n, venc, extra = {}) => ({ id: 'p' + n, nombre: 'Pago ' + n, estado: 'Pendiente', vencimiento: venc, monto: 100000, ...extra })
const pago = (f) => ({ fecha: f, origen: 'programado', tipo: 'Salida', monto: 100000 })

ok('nivel 0 sin cuentas → pide crear cuenta', nivelArranque({ cuentas: [], programado: [], movimientos: [] }, hoy) === 0 && siguientePaso({ cuentas: [], programado: [], movimientos: [] }, hoy).clave === 'cuenta')
ok('nivel 1 con cuenta y sin programados → pagos fijos', siguientePaso({ cuentas: [cta], programado: [], movimientos: [] }, hoy).clave === 'pagos_fijos')
ok('nivel 2: programado vencido → "se venció"', siguientePaso({ cuentas: [cta], programado: [prog(1, '2026-11-08')], movimientos: [] }, hoy).clave === 'vencidos')
ok('vence hoy → "hoy vence"', siguientePaso({ cuentas: [cta], programado: [prog(1, '2026-11-10')], movimientos: [] }, hoy).clave === 'hoy')
const db3 = { cuentas: [cta], programado: [prog(1, '2026-11-20')], movimientos: [pago('2026-11-09')] }
ok('nivel 3 tras el primer pago → se abre Movimientos', nivelArranque(db3, hoy) === 3 && JSON.stringify(tabsVisibles(3, false)) === '["dashboard","movimientos","plan","config"]')
ok('nivel <3: solo Inicio, Plan y Ajustes; presupuesto oculto', JSON.stringify(tabsVisibles(2, false)) === '["dashboard","plan","config"]' && !presupuestoVisible(3, false))
ok('modo completo abre todo sin importar el nivel', tabsVisibles(0, true).length === 6 && presupuestoVisible(0, true))
ok('al día: anuncia lo próximo sin botón', siguientePaso(db3, hoy).clave === 'al_dia' && /Pago 1/.test(siguientePaso(db3, hoy).detalle))
const db3b = { ...db3, movimientos: [pago('2026-11-01'), pago('2026-11-05'), pago('2026-11-09')] }
ok('3 pagos y cuenta sin saldo → pide el saldo', siguientePaso(db3b, hoy).clave === 'saldo')
const db4 = { cuentas: [{ ...cta, saldo_inicial: 1000000 }], programado: [prog(1, '2026-11-20', { nombre: 'Tarjeta Nu' }), prog(2, '2026-11-25'), prog(3, '2026-11-28')], movimientos: [pago('2026-11-01'), pago('2026-11-09')] }
ok('una semana pagando → nivel 4, todo visible', nivelArranque(db4, hoy) === 4 && tabsVisibles(4, false).length === 6)
ok('programado "Tarjeta" sin tarjeta creada → sugiere crearla', siguientePaso(db4, hoy).clave === 'tarjeta')
const db5 = { ...db4, cuentas: [...db4.cuentas, { id: 't', nombre: 'Nu', tipo: 'Tarjeta crédito' }], presupuesto: [] }
ok('nivel 4 con 3 programados y sin presupuesto → sugiere armarlo', siguientePaso(db5, hoy).clave === 'presupuesto')
ok('proximoDia: día 15 desde el 10 → este mes; día 5 → el mes que viene; día 31 en febrero → 28', proximoDia(15, hoy) === '2026-11-15' && proximoDia(5, hoy) === '2026-12-05' && proximoDia(31, '2027-02-10') === '2027-02-28' && proximoDia(3, '2026-12-20') === '2027-01-03')
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK'); process.exit(fallos ? 1 : 0)
