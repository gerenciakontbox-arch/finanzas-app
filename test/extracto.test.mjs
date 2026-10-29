// Prueba unitaria: normalización de lo que devuelve el modelo (caso Nu y caso Falabella) y conciliación con compras existentes.
import { normalizar, extraerJson } from '../netlify/functions/extracto-leer-background.mjs'
import { conciliar, huella, planDesdeBanco } from '../src/lib/extracto.js'
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

// ── Plan según el banco (extracto Falabella de octubre 2026, datos reales) ──
// "4 de 1" tras un cambio de cuotas: la cuota del mes 83.333,33 y el saldo pendiente 166.666,68 dicen que son 6 cuotas
const adidas = planDesdeBanco({ monto: 500000, cuotas: 1, cuota_actual: 4, valor_cuota_mes: 83333.33, saldo_pendiente: 166666.68 })
ok('Falabella "4 de 1": 6 cuotas, 3 previas, capital 500.000, con nota', adidas.cuotas === 6 && adidas.cuotas_previas === 3 && adidas.capital === 500000 && /6 cuotas/.test(adidas.plan_nota))
// COLCHONES: el extracto imprime 992.982 (con intereses) pero factura 16.814,37 × 36 = 605.317 de capital
const colch = planDesdeBanco({ monto: 992982, cuotas: 36, cuota_actual: 27, valor_cuota_mes: 16814.37, saldo_pendiente: 151329.39 })
ok('Falabella: capital financiado = cuota × cuotas (605.317), 36 cuotas, 26 previas', Math.round(colch.capital) === 605317 && colch.cuotas === 36 && colch.cuotas_previas === 26 && /capital financiado/.test(colch.plan_nota))
// Compra de una cuota: nada cambia
const payu = planDesdeBanco({ monto: 516800, cuotas: 1, cuota_actual: 1, valor_cuota_mes: 516800, saldo_pendiente: 0 })
ok('Una cuota: sin cambios ni nota', payu.cuotas === 1 && payu.capital === 516800 && !payu.plan_nota)
// Nu: la "cuota" que lee el modelo trae interés (4.175,98) → no cuadra con el saldo; monto/cuotas (2.974,07) sí → plan intacto
const nuC = planDesdeBanco({ monto: 71377.6, cuotas: 24, cuota_actual: 6, valor_cuota_mes: 4175.98, saldo_pendiente: 53533.18 })
ok('Nu: cuota con interés no engaña al plan (24 cuotas, capital 71.377,6)', nuC.cuotas === 24 && nuC.capital === 71377.6 && !nuC.plan_nota)
// Sin saldo pendiente no se infiere nada
const sinDato = planDesdeBanco({ monto: 100000, cuotas: 3, cuota_actual: 2 })
ok('Sin saldo pendiente: se respeta lo impreso', sinDato.cuotas === 3 && sinDato.capital === 100000)
// Conciliación: la compra ya existe con tasa y 1 cuota (cargada antes de la corrección) → ajuste de plazo, capital y tasa
const ajusteAd = conciliar([{ fecha: '2026-06-20', descripcion: 'ADIDAS OUTLET CL 5 55 00 LC', monto: 500000, cuotas: 1, cuota_actual: 4, valor_cuota_mes: 83333.33, saldo_pendiente: 166666.68 }], [{ id: 'x', fecha: '2026-06-20', descripcion: 'ADIDAS OUTLET CL 5 55 00 LC', monto: 500000, cuotas: 1, cuotas_previas: 0, tasa_mensual: 2.088, ref_extracto: huella({ fecha: '2026-06-20', descripcion: 'ADIDAS OUTLET CL 5 55 00 LC', monto: 500000 }) }], {})[0]
ok('Recargar el extracto corrige la compra mal cargada: ajuste a 6 cuotas, 3 previas, sin tasa', ajusteAd.estado === 'ajuste' && ajusteAd.cuotas === 6 && ajusteAd.nuevasPrevias === 3 && ajusteAd.incluir)
// Suma de cuotas del mes con el plan corregido = consumos facturados del banco (1.435.459,09), sin ADIDAS a 500.000
const filas = [[992982,36,27,16814.37,151329.39],[730000,36,25,20277.78,223055.58],[1004000,36,25,27888.89,306777.79],[336078,6,5,56013,56013],[713940,8,5,89242.5,267727.5],[307723.01,24,5,12821.79,243614.06],[274407,5,5,54881.4,0],[500000,1,4,83333.33,166666.68],[138626,4,4,34656.5,0],[342497.64,24,4,14270.73,285414.72],[231290.41,24,4,9637.10,192742.01],[326860.02,24,3,13619.16,286002.54],[318860.16,24,2,13285.84,292288.48],[28600,1,1,28600,0],[516800,1,1,516800,0],[4760,1,1,4760,0],[33400,1,1,33400,0],[253600,1,1,253600,0],[18786.75,1,1,18786.75,0],[45595.95,1,1,45595.95,0],[87174,1,1,87174,0]]
const suma = filas.map(([monto, cuotas, cuota_actual, valor_cuota_mes, saldo_pendiente]) => planDesdeBanco({ monto, cuotas, cuota_actual, valor_cuota_mes, saldo_pendiente })).reduce((a, c) => a + c.capital / c.cuotas, 0)
ok('Extracto Falabella completo: Σ capital/cuotas = 1.435.459 (consumos facturados del banco)', Math.abs(suma - 1435459.09) < 2)

// ── Respaldo de parseo: JSON con comentarios, comas finales, "..." y números con formato colombiano ──
const roto = 'Aquí va: {"banco":"Nu", // comentario\n "compras":[ {"fecha":"2026-01-01","descripcion":"a","monto_cop": 1.004.000,00, "cuotas_total": 3,}, {"fecha":"2026-01-02","descripcion":"b","monto_cop": 500}\n ...\n ], "otros":[], "advertencias":[],}'
const rep = extraerJson(roto)
ok('extraerJson repara comentarios, comas finales, "..." y 1.004.000,00', rep.compras.length === 2 && rep.compras[0].monto_cop === 1004000 && rep.banco === 'Nu')
let irreparable = false; try { extraerJson('{"compras":[ {"a":1} {"b":2 ]}') } catch (e) { irreparable = /mal formados/.test(e.message) }
ok('extraerJson: lo irreparable da un error claro', irreparable)
// "4 de 1" llega tal cual a normalizar: cuota_actual 4 se conserva para que planDesdeBanco lo corrija
const inc = normalizar({ compras: [{ fecha: '2026-06-20', descripcion: 'ADIDAS', monto_cop: 500000, cuotas_total: 1, cuota_actual: 4, valor_cuota_mes: 83333.33, saldo_pendiente: 166666.68 }] })
ok('normalizar conserva "4 de 1" (cuota_actual 4, previas 0) y conciliar lo vuelve 6 cuotas', inc.compras[0].cuota_actual === 4 && inc.compras[0].cuotas_previas === 0 && conciliar(inc.compras, [], {})[0].cuotas === 6)
