// Prueba unitaria: normalización de lo que devuelve el modelo (caso Nu y caso Falabella) y conciliación con compras existentes.
import { normalizar } from '../netlify/functions/extracto-leer-background.mjs'
import { conciliar, huella } from '../src/lib/extracto.js'
import { tachar } from '../src/lib/tachar.js'
const ok = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) process.exitCode = 1 }

// Lo que el modelo devolvería para el extracto Nu de octubre 2026 (valores tomados del PDF real)
const nu = normalizar({ banco: 'Nu', periodo_inicio: '2026-09-11', periodo_fin: '2026-10-11', fecha_corte: '2026-10-12', fecha_limite: '2026-11-03', cupo: 400000, utilizado: '284.221,95', disponible: 115778.05, pago_total: 249561.95, pago_minimo: 60749.09, intereses: 4558.36, mora: 115.85, cuota_manejo: 0, seguro: null, abonos: 258.8,
  compras: [
    { fecha: '2026-09-12', descripcion: 'Apple.Com Bill', monto_cop: 29900, moneda_original: 'COP', cuotas_total: 1, cuota_actual: 1, tasa: 2.12, tasa_tipo: 'MV', valor_cuota_mes: 29900, saldo_pendiente: 0 },
    { fecha: '2026-04-23', descripcion: 'Claude.Ai Subscription', monto_cop: 71377.6, moneda_original: 'COP', cuotas_total: 24, cuota_actual: 6, tasa: 1.97, tasa_tipo: 'MV', valor_cuota_mes: 4175.98, saldo_pendiente: 53533.18 },
    { fecha: '2024-12-06', descripcion: 'Openai *Chatgpt Subscr', monto_cop: 88491.2, moneda_original: 'COP', cuotas_total: 24, cuota_actual: 23, tasa: 1.96, tasa_tipo: 'MV', valor_cuota_mes: 2736.76, saldo_pendiente: 2586.61 },
  ], otros: [{ fecha: '2026-10-08', descripcion: 'Gracias por tu pago', tipo: 'pago', monto: 34355.12 }], advertencias: [] })
ok('Nu: estado leído (corte, límite, pago total, utilizado con coma decimal)', nu.estado.fecha_corte === '2026-10-12' && nu.estado.fecha_limite === '2026-11-03' && nu.estado.pago_total === 249561.95 && nu.estado.utilizado === 284221.95)
ok('Nu: 3 compras, cuotas previas = cuota actual − 1 (6 de 24 → 5 previas)', nu.compras.length === 3 && nu.compras[1].cuotas_previas === 5 && nu.compras[1].cuotas === 24 && nu.compras[0].cuotas_previas === 0)
ok('Nu: tasa M.V. se conserva', nu.compras[1].tasa_mensual === 1.97)
ok('Nu: pagos van en otros, no en compras', nu.otros.length === 1 && nu.otros[0].tipo === 'pago')

// Falabella: tasa E.A. → mensual; compra en USD con valor en pesos; "4 de 1" incoherente
const fa = normalizar({ banco: 'Banco Falabella', fecha_corte: '2026-10-14', fecha_limite: '2026-10-31', cupo: 4000000, utilizado: 4014522.44, pago_total: 4014522.44, pago_minimo: 1542890.69, intereses: 68712.5, cuota_manejo: 31990, seguro: 4990, mora: 1739.1, abonos: 692891.45,
  compras: [
    { fecha: '2024-07-30', descripcion: 'COLCHONES SPRING 247 CCO EM', monto_cop: 992982, moneda_original: 'COP', cuotas_total: 36, cuota_actual: 27, tasa: 28.58, tasa_tipo: 'EA', valor_cuota_mes: 16814.37, saldo_pendiente: 151329.39 },
    { fecha: '2026-05-27', descripcion: 'CLAUDE.AI SUBSCRIPTION 548', monto_cop: 307723.01, moneda_original: 'USD', monto_original: 84.43, cuotas_total: 24, cuota_actual: 5, tasa: 28.15, tasa_tipo: 'EA', valor_cuota_mes: 12821.79, saldo_pendiente: 243614.06 },
    { fecha: '2026-06-20', descripcion: 'ADIDAS OUTLET CL 5 55 00 LC', monto_cop: 500000, moneda_original: 'COP', cuotas_total: 1, cuota_actual: 1, tasa: 28.58, tasa_tipo: 'EA', valor_cuota_mes: 83333.33, saldo_pendiente: 166666.68, nota: 'El extracto dice "4 de 1" (cambio de cuotas)' },
  ], otros: [{ fecha: '2026-10-05', descripcion: 'PAGO TARJETA CMR', tipo: 'pago', monto: 492891.45 }, { fecha: '2026-10-14', descripcion: 'COBRO CUOTA MANEJO', tipo: 'cuota_manejo', monto: 31990 }], advertencias: [] })
ok('Falabella: E.A. 28,15 % → 2,088 % mensual', fa.compras[1].tasa_mensual === 2.088)
ok('Falabella: compra en USD usa el valor en pesos y conserva el original', fa.compras[1].monto === 307723.01 && fa.compras[1].monto_original === 84.43 && fa.compras[1].moneda_original === 'USD')
ok('Falabella: 27 de 36 → 26 cuotas previas', fa.compras[0].cuotas_previas === 26)
ok('Falabella: advertencia automática cuando los saldos no cuadran con lo utilizado', fa.advertencias.some(a => /difiere del total utilizado/.test(a)))

// Conciliación: primera carga → todo nuevo; segunda carga → existentes; cuotas desfasadas → ajuste
const primera = conciliar(nu.compras, [], {})
ok('Primera carga: todas nuevas e incluidas', primera.every(f => f.estado === 'nueva' && f.incluir))
const existentes = nu.compras.map((c, i) => ({ id: 'c' + i, fecha: c.fecha, descripcion: c.descripcion, monto: c.monto, cuotas: c.cuotas, cuotas_previas: c.cuotas_previas, ref_extracto: huella(c) }))
const segunda = conciliar(nu.compras, existentes, {})
ok('Segunda carga del mismo extracto: todas existentes, nada que aplicar', segunda.every(f => f.estado === 'existente' && !f.incluir))
// un mes después: Claude.Ai va en 7 de 24 y la app registró 1 pago (5 previas + 1 pagada = 6 ✓); ChatGPT va en 24 de 24 pero la app no registró pago (22 previas) → ajuste
const siguiente = normalizar({ fecha_corte: '2026-11-12', compras: [
  { fecha: '2026-04-23', descripcion: 'CLAUDE.AI SUBSCRIPTION', monto_cop: 71377.6, cuotas_total: 24, cuota_actual: 7 },
  { fecha: '2024-12-06', descripcion: 'Openai *Chatgpt Subscr', monto_cop: 88491.2, cuotas_total: 24, cuota_actual: 24 },
  { fecha: '2026-10-20', descripcion: 'Rappi', monto_cop: 45000, cuotas_total: 1, cuota_actual: 1 } ] })
const tercera = conciliar(siguiente.compras, existentes, { c1: 1 })
ok('Mes siguiente: Claude al día (existente, aunque cambie mayúsculas), ChatGPT con ajuste de 22 → 23 previas, Rappi nueva', tercera[0].estado === 'existente' && tercera[1].estado === 'ajuste' && tercera[1].nuevasPrevias === 23 && tercera[2].estado === 'nueva')

// Tachado
const t = tachar('Andres Felipe Quijano\nCC 1143954712\nCr 36 5b1 04, Cali\n• • • • 1399\nayuda@nu.com.co\n12 SEP 2026 Apple.Com Bill $29.900,00\nADIDAS OUTLET CL 5 55 00 LC', ['Andres Felipe Quijano'])
ok('Tachado: nombre, cédula, dirección, tarjeta y correo fuera; la compra y el comercio con dirección se conservan', !/Quijano|1143954712|Cr 36|1399|ayuda@/.test(t) && /Apple\.Com Bill \$29\.900,00/.test(t) && /ADIDAS OUTLET CL 5 55 00 LC/.test(t))
