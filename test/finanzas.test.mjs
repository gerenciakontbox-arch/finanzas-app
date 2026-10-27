// Pruebas de cálculo: remedición de saldo, costo financiero y etiquetas.
import { amortizacion } from '../src/lib/util.js'
import { costoFinanciero, gastosPorCategoria, porEtiqueta, resumenDeuda, indicePagadas } from '../src/lib/finanzas.js'
let fallos = 0; const ok = (n, c) => { console.log((c ? 'PASS' : 'FAIL') + '  ' + n); if (!c) fallos++ }
const cerca = (a, b, t = 1) => Math.abs(a - b) <= t

// 12 cuotas de 12 M al 1,5 %: cuota fija ≈ 1.100.098
const base = amortizacion({ capital: 12000000, tasa: 1.5, n: 12, fechaInicio: '2026-01-15' })
ok('amortización base: 12 cuotas y saldo final 0', base.length === 12 && base[11].saldo === 0)
// Tras la cuota 2 el banco dice que el saldo es 10.480.000 (la app calculaba 10.150.000): se remide en las 10 restantes
const rem = amortizacion({ capital: 12000000, tasa: 1.5, n: 12, fechaInicio: '2026-01-15', ajustes: [{ saldo_real: 10480000, despues_de_cuota: 2 }] })
ok('remedición mantiene 12 cuotas', rem.length === 12)
ok('cuotas 1-2 no cambian', rem[0].total === base[0].total && rem[1].total === base[1].total)
ok('cuota 3 parte del saldo real', cerca(rem[2].interes, Math.round(10480000 * 0.015)))
ok('cuota 3 sube respecto a la calculada', rem[2].total > base[2].total)
ok('saldo final 0 tras remedir', rem[11].saldo === 0)
ok('suma de capital 3-12 = saldo real', cerca(rem.slice(2).reduce((a, c) => a + c.capital, 0), 10480000, 12))
// Sistema capital: abono constante = saldo real / restantes
const remC = amortizacion({ capital: 12000000, tasa: 1.5, n: 12, fechaInicio: '2026-01-15', sistema: 'capital', ajustes: [{ saldo_real: 9000000, despues_de_cuota: 2 }] })
ok('capital: abono fijo pasa a 900.000', remC[2].capital === 900000 && remC[11].saldo === 0)
// Ajuste a 0 cancela el crédito en la práctica
const rem0 = amortizacion({ capital: 12000000, tasa: 1.5, n: 12, fechaInicio: '2026-01-15', ajustes: [{ saldo_real: 0, despues_de_cuota: 2 }] })
ok('saldo real 0 → no quedan cuotas', rem0.length === 2)

// resumenDeuda con ajuste: pct sobre base real
const d = { id: 'd1', capital_inicial: 12000000, tasa_mensual: 1.5, total_cuotas: 12, fecha_primera_cuota: '2026-01-15', sistema: 'fija', cuotas_previas: 2 }
const r = resumenDeuda(d, indicePagadas([]), [], [{ deuda_id: 'd1', saldo_real: 10480000, despues_de_cuota: 2, fecha: '2026-02-20' }])
ok('resumenDeuda: saldo pendiente = saldo real', cerca(r.capitalPendiente, 10480000, 12) && r.ultimoAjuste?.saldo_real === 10480000)

// Costo financiero del mes
const movs = [
  { tipo: 'Salida', deuda_id: 'd1', monto: 1115000, desglose: { capital: 920000, interes: 180000, seguro: 0, mora: 12000, otros: 3000 } },
  { tipo: 'Salida', deuda_id: 'd1', monto: 900000, desglose: { capital: 930000, interes: 170000, seguro: 0, parcial: -200000 } },
  { tipo: 'Salida', tc_cuenta_id: 't1', monto: 500000, desglose: { capital: 450000, interes: 30000, extras: { cuota_manejo: 20000 } } },
  { tipo: 'Salida', monto: 300000, categoria_id: 'mercado', etiqueta_ids: ['fam'] },
  { tipo: 'Salida', monto: 90000, categoria_id: 'ropa', etiqueta_ids: ['mateo', 'fam'] },
  { tipo: 'Ingreso', monto: 5000000, categoria_id: 'salario' },
]
const cf = costoFinanciero(movs)
ok('capital pagado 2.300.000', cf.capital === 2300000)
ok('costo financiero = interés+mora+otros+manejo', cf.costo === 180000 + 170000 + 12000 + 3000 + 30000 + 20000)
ok('total cuadra con la caja', cf.total === 1115000 + 900000 + 500000)
const g = gastosPorCategoria(movs, { mercado: { nombre: 'Mercado' }, ropa: { nombre: 'Ropa' } })
ok('informe por categoría: capital fuera, costo financiero aparte', g['Costo financiero'] === (1115000 - 920000) + (900000 - 930000 > 0 ? 0 : 0) + (500000 - 450000) && g.Mercado === 300000 && !('Cuota crédito' in g))
const et = porEtiqueta(movs, [{ id: 'fam', nombre: 'Familia' }, { id: 'mateo', nombre: 'Mateo' }, { id: 'x', nombre: 'Sin uso' }])
ok('por etiqueta: Familia 390.000, Mateo 90.000, sin uso no aparece', et.length === 2 && et[0].salidas === 390000 && et[1].salidas === 90000)

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo OK'); process.exit(fallos ? 1 : 0)
