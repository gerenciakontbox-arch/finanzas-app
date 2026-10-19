import { useData, useIndices } from '../lib/data'
import { Kpi, Card, Badge, IcoText, Icon, BarChartCJ, PieChartCJ } from '../lib/ui'
import { fmtCOP, fmtDate, today, addDays, daysLeft, GRUPOS, TC, primeroDelMes } from '../lib/util'
import { deudaTotal, presupuestoConEjecucion, resumenTarjeta, indicePagadas, aportesPorEspacio, aportesPorMiembro, aportesPlanificados } from '../lib/finanzas'
import { useAuth } from '../lib/auth'

const ECLS = { Planificado: '#f1f5f9|#64748b', Programado: '#dbeafe|#1e40af', Pagado: '#d1fae5|#065f46', Cancelado: '#fee2e2|#991b1b' }
const PICO = { Impuesto: 'receipt', Seguro: 'shield', Mantenimiento: 'wrench', 'Cuota crédito': 'card', Servicio: 'wifi', Suscripción: 'refresh', Nómina: 'user', Honorarios: 'dollar', Arriendo: 'home', Otro: 'pin' }

export default function Dashboard({ goTo }) {
  const { db, all, espacioDe, duenoCuenta, nombreMiembro, saldoCuenta } = useData(); const ix = useIndices(); const { espacio, esPersonal, personal, userId, compartidos, miembros } = useAuth()
  const periodo = primeroDelMes()
  const pce = presupuestoConEjecucion(db, periodo)
  const totalP = pce.reduce((a, p) => a + p.monto, 0), totalE = pce.reduce((a, p) => a + p.ejecutado, 0)
  const mes = today().slice(0, 7)
  const movMes = db.movimientos.filter(m => m.fecha.startsWith(mes))
  const ing = movMes.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + +m.monto, 0)
  const sal = movMes.filter(m => m.tipo === 'Salida').reduce((a, m) => a + +m.monto, 0)
  const aportesMes = esPersonal ? aportesPorEspacio(all, personal?.id, mes) : {}
  const totAportes = Object.values(aportesMes).reduce((a, x) => a + x.aportes, 0), totRecibidos = Object.values(aportesMes).reduce((a, x) => a + x.recibidos, 0)
  const planAportes = esPersonal ? aportesPlanificados(all, periodo, userId, personal?.id) : {}
  const porMiembro = !esPersonal ? aportesPorMiembro(all, espacio.id, mes, duenoCuenta) : {}
  const porMiembroTotal = !esPersonal ? aportesPorMiembro(all, espacio.id, null, duenoCuenta) : {}
  const efectivoTotal = db.cuentasPropias.filter(c => c.tipo !== TC).reduce((a, c) => a + saldoCuenta(c), 0)
  const deuda = deudaTotal(db)
  const t = today(), t7 = addDays(t, 7)
  const proxP = pce.filter(p => !['Pagado', 'Cancelado'].includes(p.estado) && p.fecha_tentativa >= t && p.fecha_tentativa <= t7).sort((a, b) => a.fecha_tentativa.localeCompare(b.fecha_tentativa))
  const proxProg = db.programado.filter(p => p.estado === 'Pendiente' && p.vencimiento <= t7).sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))
  const idx = indicePagadas(db.cuotas_pagadas)
  const tcs = db.cuentas.filter(c => c.tipo === TC).map(c => resumenTarjeta(c, db.tc_cargos, idx)).filter(r => r.proximaFactura > 0)
  const byGrupo = GRUPOS.map(g => { const it = pce.filter(p => ix.cat[p.categoria_id]?.grupo === g); return { name: g.length > 12 ? g.slice(0, 11) + '…' : g, p: it.reduce((a, x) => a + x.monto, 0), e: it.reduce((a, x) => a + x.ejecutado, 0) } }).filter(x => x.p > 0)
  const byCat = {}; movMes.filter(m => m.tipo === 'Salida').forEach(m => { const n = ix.cat[m.categoria_id]?.nombre || 'Sin categoría'; byCat[n] = (byCat[n] || 0) + +m.monto })
  const topCat = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const ingresosPend = db.programado.filter(p => p.flujo === 'ingreso' && p.estado === 'Pendiente' && p.vencimiento.startsWith(mes)).reduce((a, p) => a + +p.monto, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Kpi icon="list" value={fmtCOP(totalP)} sub="Este mes" label="Presupuestado" grad="linear-gradient(135deg,#7c3aed,#6d28d9)" />
        <Kpi icon="list-check" value={fmtCOP(totalE)} sub={`${totalP > 0 ? Math.round(totalE / totalP * 100) : 0}% del plan`} label="Ejecutado" grad="linear-gradient(135deg,#0891b2,#0e7490)" />
        <Kpi icon="dollar" value={fmtCOP(ing + totRecibidos - sal - totAportes)} sub={esPersonal ? `Ing ${fmtCOP(ing + totRecibidos)} · aportes ${fmtCOP(totAportes)}` : `Ing ${fmtCOP(ing)}${ingresosPend ? ` · por cobrar ${fmtCOP(ingresosPend)}` : ''}`} label="Flujo neto del mes" grad="linear-gradient(135deg,#059669,#047857)" />
        <Kpi icon="card" value={fmtCOP(deuda.total)} sub={`Créditos ${fmtCOP(deuda.cred)} · TC ${fmtCOP(deuda.tcs)}`} label="Deuda pendiente" grad="linear-gradient(135deg,#dc2626,#b91c1c)" />
      </div>
      {(esPersonal ? db.cuentasPropias.some(c => c.tipo !== TC) : db.cuentasPropias.some(c => c.tipo !== TC)) && <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 8 }}><IcoText name="landmark">{esPersonal ? 'Mis cuentas' : `Cuentas de ${espacio.nombre}`} · {fmtCOP(efectivoTotal)}</IcoText></div>
        {db.cuentasPropias.filter(c => c.tipo !== TC).map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid #f9fafb' }}><span>{c.nombre} <span style={{ color: '#9ca3af', fontSize: 10 }}>{c.tipo}</span></span><b style={{ color: saldoCuenta(c) < 0 ? '#dc2626' : '#111' }}>{fmtCOP(saldoCuenta(c))}</b></div>)}
        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6 }}>Saldo calculado con los movimientos registrados en la app.</div>
      </Card>}
      {esPersonal && compartidos.length > 0 && <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 8 }}><IcoText name="arrow-right">Mis espacios compartidos · este mes</IcoText></div>
        {compartidos.map(e => { const a = aportesMes[e.id] || { aportes: 0, recibidos: 0 }; const plan = planAportes[e.id] || 0; return <div key={e.id} style={{ padding: '8px 0', borderBottom: '1px solid #f9fafb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><b>{e.nombre}</b><span style={{ color: '#7c3aed', fontWeight: 700 }}>aporté {fmtCOP(a.aportes)}</span></div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>{plan ? `planificado ${fmtCOP(plan)} · ` : ''}{a.recibidos ? `recibí ${fmtCOP(a.recibidos)} · ` : ''}{a.ingresos ? `me pagó ${fmtCOP(a.ingresos)} · ` : ''}neto {fmtCOP(a.aportes - a.recibidos - (a.ingresos || 0))}</div>
        </div> })}
      </Card>}
      {!esPersonal && Object.keys(porMiembroTotal).length > 0 && <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 8 }}><IcoText name="user">Aportes por miembro</IcoText></div>
        {miembros.map(m => { const a = porMiembro[m.user_id] || { aportes: 0, recibidos: 0 }; const t = porMiembroTotal[m.user_id] || { aportes: 0, recibidos: 0 }; return <div key={m.user_id} style={{ padding: '8px 0', borderBottom: '1px solid #f9fafb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><b>{m.nombre}</b><span style={{ color: '#7c3aed', fontWeight: 700 }}>este mes {fmtCOP(a.aportes - a.recibidos)}</span></div>
          <div style={{ fontSize: 10, color: '#6b7280' }}>puso {fmtCOP(a.aportes)}{a.recibidos ? ` · recibió ${fmtCOP(a.recibidos)}` : ''} · acumulado neto {fmtCOP(t.aportes - t.recibidos)}</div>
        </div> })}
        <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 6 }}>Pagos hechos con cuentas personales de cada miembro. Lo pagado con cuentas propias del espacio no cuenta como aporte.</div>
      </Card>}
      {tcs.length > 0 && <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10 }}><IcoText name="card">Próximas facturas de tarjeta</IcoText></div>
        {tcs.map(r => (<div key={r.cuenta.id} onClick={() => goTo('deudas')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}>
          <div><div style={{ fontWeight: 600, fontSize: 12 }}>{r.cuenta.nombre}</div><div style={{ fontSize: 10, color: '#6b7280' }}>{r.activos.length} compra{r.activos.length !== 1 ? 's' : ''} · vence {fmtDate(r.proximaFecha)}</div></div>
          <div style={{ fontWeight: 800, fontSize: 13, color: '#dc2626' }}>{fmtCOP(r.proximaFactura)}</div>
        </div>))}
      </Card>}
      {byGrupo.length > 0 && <Card><div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 12 }}>Plan vs ejecución</div><BarChartCJ labels={byGrupo.map(x => x.name)} datasets={[{ label: 'Presupuestado', data: byGrupo.map(x => x.p), backgroundColor: '#8b5cf6', borderRadius: 4 }, { label: 'Ejecutado', data: byGrupo.map(x => x.e), backgroundColor: '#06b6d4', borderRadius: 4 }]} height={180} /></Card>}
      {topCat.length > 0 && <Card><div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 12 }}>Gastos del mes por categoría</div><PieChartCJ labels={topCat.map(x => x[0])} data={topCat.map(x => x[1])} height={200} /></Card>}
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 12 }}><IcoText name="clock">Próximos 7 días</IcoText></div>
        {proxP.length === 0 && proxProg.length === 0 && <div style={{ color: '#9ca3af', fontSize: 12 }}>Nada pendiente esta semana.</div>}
        {proxProg.map(p => { const d = daysLeft(p.vencimiento); const ing = p.flujo === 'ingreso'; return (
          <div key={p.id} onClick={() => goTo('programado')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}>
            <div><div style={{ fontWeight: 600, fontSize: 12, color: '#111' }}><IcoText name={PICO[p.tipo] || 'pin'} size={12} gap={5}>{p.nombre}</IcoText></div><div style={{ fontSize: 10, color: '#6b7280' }}>{ing ? 'Cobrar' : 'Pagar'} · {fmtDate(p.vencimiento)}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 700, fontSize: 12, color: ing ? '#059669' : '#111' }}>{ing ? '+' : ''}{fmtCOP(p.monto)}</div><span style={{ background: d < 0 ? '#fee2e2' : d <= 2 ? '#fef3c7' : '#f1f5f9', color: d < 0 ? '#991b1b' : d <= 2 ? '#92400e' : '#64748b', padding: '2px 6px', borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{d < 0 ? `Vencido ${-d}d` : d === 0 ? 'Hoy' : `${d}d`}</span></div>
          </div>) })}
        {proxP.map(p => (
          <div key={p.id} onClick={() => goTo('presupuesto')} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f9fafb', cursor: 'pointer' }}>
            <div><div style={{ fontWeight: 600, fontSize: 12, color: '#111' }}><IcoText name="list" size={12} gap={5}>{p.concepto}</IcoText></div><div style={{ fontSize: 10, color: '#6b7280' }}>{p.pagador_id && !esPersonal ? nombreMiembro(p.pagador_id) + ' · ' : ''}{fmtDate(p.fecha_tentativa)}</div></div>
            <div style={{ textAlign: 'right' }}><div style={{ fontWeight: 700, fontSize: 12 }}>{fmtCOP(p.monto)}</div><Badge val={p.estado} map={ECLS} /></div>
          </div>))}
      </Card>
    </div>
  )
}
