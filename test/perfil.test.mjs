// Prueba unitaria del cálculo de indicadores y señales (netlify/functions/_perfil.mjs) con datos sintéticos.
import { indicadores, SENALES } from '../netlify/functions/_perfil.mjs'
const hoy = '2026-10-20'; const uid = 'u1'; const pid = 'pa'
const d = {
  uid, ids: [pid, 'h'], espacios: [{ id: pid, tipo: 'personal', dueno_id: uid }, { id: 'h', tipo: 'hogar' }], personal: { id: pid },
  cat: [{ id: 'c1', nombre: 'Honorarios' }, { id: 'c2', nombre: 'Mercado' }],
  mov: [
    { espacio_id: pid, tipo: 'Ingreso', categoria_id: 'c1', fecha: '2026-09-05', monto: 8000000, cuenta_id: 'k1', origen: 'manual', creado_en: '2026-09-05T10:00:00Z' },
    { espacio_id: pid, tipo: 'Ingreso', categoria_id: 'c1', fecha: '2026-08-05', monto: 8000000, cuenta_id: 'k1', origen: 'manual', creado_en: '2026-08-05T10:00:00Z' },
    { espacio_id: pid, tipo: 'Ingreso', categoria_id: 'c1', fecha: '2026-07-05', monto: 8000000, cuenta_id: 'k1', origen: 'manual', creado_en: '2026-07-05T10:00:00Z' },
    { espacio_id: pid, tipo: 'Salida', categoria_id: 'c2', fecha: '2026-09-10', monto: 500000, cuenta_id: 'k1', origen: 'manual', creado_en: '2026-09-10T10:00:00Z', presupuesto_id: 'p9' },
    { espacio_id: pid, tipo: 'Salida', categoria_id: 'c2', fecha: '2026-09-12', monto: 300000, cuenta_id: 'k1', origen: 'manual', creado_en: '2026-09-14T10:00:00Z', presupuesto_id: 'p9' },
    { espacio_id: pid, tipo: 'Transferencia', subtipo: 'aporte', fecha: '2026-10-02', monto: 400000, cuenta_id: 'k1', origen: 'espejo' },
  ],
  pre: [{ id: 'p9', espacio_id: pid, periodo: '2026-09-01', monto: 600000 }, { id: 'p8', espacio_id: pid, periodo: '2026-08-01', monto: 600000 }, { id: 'p7', espacio_id: pid, periodo: '2026-07-01', monto: 600000 }],
  prog: [
    { espacio_id: pid, estado: 'Completado', vencimiento: '2026-09-15', completado_en: '2026-09-15', tipo: 'Servicio' },
    { espacio_id: pid, estado: 'Completado', vencimiento: '2026-08-15', completado_en: '2026-08-19', tipo: 'Servicio' },
    { espacio_id: pid, estado: 'Pendiente', vencimiento: '2026-10-10', tipo: 'Servicio' },
  ],
  deu: [{ id: 'd1', espacio_id: pid, estado: 'Activo', capital_inicial: 30000000, tasa_mensual: 1.2, total_cuotas: 36, sistema: 'fija', seguro_mensual: 0 }, { id: 'd2', espacio_id: pid, estado: 'Activo', capital_inicial: 12000000, tasa_mensual: 1.5, total_cuotas: 12, sistema: 'capital', seguro_mensual: 45000 }],
  cuo: [{ deuda_id: 'd2', capital: 1000000 }], abo: [{ deuda_id: 'd2', monto: 5000000 }],
  act: [{ id: 'a1', espacio_id: pid, tipo: 'Vehículo', valor_estimado: 60000000, valor_base: 60000000, fecha_base: '2025-10-20', vida_util_meses: 60, valor_residual: 10000000 }],
  cta: [{ id: 'k1', espacio_id: pid, tipo: 'Bancaria' }, { id: 't1', espacio_id: pid, tipo: 'Tarjeta crédito', cupo: 5000000 }],
  car: [{ id: 'g1', cuenta_id: 't1', monto: 1200000, cuotas: 12 }],
}
const i = indicadores(d, hoy)
const ok = (n, c) => { console.log(c ? 'PASS' : 'FAIL', n); if (!c) process.exitCode = 1 }
ok('ingresos promedio 3 meses = 8.000.000', i.ingresos_mes === 8000000)
ok('meses con honorarios = 3', i.meses_honorarios === 3)
ok('puntualidad 50 % y atraso promedio 2 días', i.puntualidad_pct === 50 && i.atraso_promedio_dias === 2)
ok('1 vencido', i.vencidos === 1)
ok('presupuesto: sep 133 %, ago/jul 0 % → promedio 44, desbordados 1', i.presupuesto_ejecucion_pct === 44 && i.meses_desbordados === 1)
ok('2 créditos activos; saldo = 30M + (12M − 1M − 5M) = 36M', i.creditos_activos === 2 && i.saldo_creditos === 36000000)
ok('registro mismo día 50 %', i.registro_mismo_dia_pct === 50)
ok('uso de cupo 24 %', i.tc_uso_pct === 24)
ok('patrimonio = vehículo neto 50M + cuentas 22.8M − créditos 36M − TC 1.2M', i.patrimonio_neto === 50000000 + 22800000 - 36000000 - 1200000)
ok('aportes mes promedio 200.000', i.aportes_mes === 200000)
ok('salud entre 0 y 100 con explicación', i.salud >= 0 && i.salud <= 100 && /Puntualidad/.test(i.salud_explicacion))
const s = Object.keys(SENALES).filter(k => SENALES[k](i, d, hoy))
ok('señales: honorarios_sin_empresa, creditos_multiples, activos_sin_cobertura', JSON.stringify(s) === JSON.stringify(['honorarios_sin_empresa', 'creditos_multiples', 'activos_sin_cobertura']))
d.prog.push({ espacio_id: pid, estado: 'Pendiente', vencimiento: '2027-01-01', tipo: 'Seguro', activo_id: 'a1' })
ok('con seguro programado la señal de cobertura se apaga', !SENALES.activos_sin_cobertura(i, d, hoy))
console.log('indicadores:', JSON.stringify(i))
