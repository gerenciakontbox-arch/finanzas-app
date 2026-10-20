import { useData, useIndices } from '../lib/data'
import { Icon, T, BarChartCJ, PieChartCJ } from '../lib/ui'
import { fmtCOP, fmtDate, today, addDays, daysLeft, GRUPOS, TC, primeroDelMes } from '../lib/util'
import { deudaTotal, presupuestoConEjecucion, resumenTarjeta, indicePagadas, aportesPorEspacio, aportesPorMiembro, aportesPlanificados } from '../lib/finanzas'
import { useAuth } from '../lib/auth'
import { TIPO_ICON } from '../App'
import { OfertaInicio } from './Privacidad'

const MES_LARGO = d => d.toLocaleDateString('es-CO', { month: 'long' })

const Seccion = ({ titulo, extra, children, style }) => (
  <section style={{ padding: '24px 20px 0', ...style }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.tinta }}>{titulo}</h2>{extra && <span style={{ fontSize: 13, fontWeight: 700, color: T.gris }}>{extra}</span>}</div>
    {children}
  </section>
)
const Fila = ({ onClick, titulo, sub, subColor, monto, montoColor, apagado }) => (
  <div onClick={onClick} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12, alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${T.divisor}`, cursor: onClick ? 'pointer' : 'default' }}>
    <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, color: apagado ? T.gris : T.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</div>{sub && <div style={{ fontSize: 12, color: subColor || T.gris, fontWeight: subColor ? 700 : 500, marginTop: 2 }}>{sub}</div>}</div>
    <div style={{ fontSize: 15, fontWeight: 800, color: montoColor || (apagado ? T.gris : T.tinta), fontVariantNumeric: 'tabular-nums' }}>{monto}</div>
  </div>
)
const FilaEspacio = ({ onClick, icono, oscuro, titulo, sub }) => (
  <div onClick={onClick} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', gap: 12, alignItems: 'center', background: T.superficie, borderRadius: 16, padding: '12px 14px', cursor: onClick ? 'pointer' : 'default' }}>
    <div style={{ width: 44, height: 44, borderRadius: 12, background: oscuro ? T.tinta : T.morado, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icono} size={22} sw={2} /></div>
    <div style={{ minWidth: 0 }}><div style={{ fontSize: 15, fontWeight: 700, color: T.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</div><div style={{ fontSize: 12, color: T.gris, marginTop: 2 }}>{sub}</div></div>
    {onClick && <Icon name="chevron-right" size={18} sw={2.2} style={{ color: T.gris }} />}
  </div>
)

export default function Dashboard({ goTo }) {
  const { db, all, duenoCuenta, nombreMiembro, saldoCuenta } = useData(); const ix = useIndices(); const { espacio, esPersonal, personal, userId, compartidos, miembros, cambiarEspacio } = useAuth()
  const periodo = primeroDelMes()
  const pce = presupuestoConEjecucion(db, periodo)
  const totalP = pce.reduce((a, p) => a + p.monto, 0), totalE = pce.reduce((a, p) => a + p.ejecutado, 0)
  const mes = today().slice(0, 7); const mesNombre = MES_LARGO(new Date())
  const movMes = db.movimientos.filter(m => m.fecha.startsWith(mes))
  const ing = movMes.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + +m.monto, 0)
  const sal = movMes.filter(m => m.tipo === 'Salida').reduce((a, m) => a + +m.monto, 0)
  const aportesMes = esPersonal ? aportesPorEspacio(all, personal?.id, mes) : {}
  const totAportes = Object.values(aportesMes).reduce((a, x) => a + x.aportes, 0), totRecibidos = Object.values(aportesMes).reduce((a, x) => a + x.recibidos, 0)
  const planAportes = esPersonal ? aportesPlanificados(all, periodo, userId, personal?.id) : {}
  const porMiembro = !esPersonal ? aportesPorMiembro(all, espacio.id, mes, duenoCuenta) : {}
  const porMiembroTotal = !esPersonal ? aportesPorMiembro(all, espacio.id, null, duenoCuenta) : {}
  const cuentasCaja = db.cuentasPropias.filter(c => c.tipo !== TC)
  const disponible = cuentasCaja.reduce((a, c) => a + saldoCuenta(c), 0)
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
  const nPend = proxP.length + proxProg.length
  const estadoVenc = d => d < 0 ? [`Vencido hace ${-d} día${-d === 1 ? '' : 's'}`, T.rojo] : d === 0 ? ['Vence hoy', T.ambar] : d <= 2 ? [`Vence en ${d} día${d === 1 ? '' : 's'}`, T.ambar] : [null, null]
  const pill = (primario, onClick, children) => <button onClick={onClick} style={{ flex: 1, height: 44, borderRadius: 22, border: primario ? 'none' : '1.5px solid rgba(255,255,255,0.55)', background: primario ? '#fff' : 'transparent', color: primario ? T.morado : '#fff', fontSize: 14, fontWeight: primario ? 800 : 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{children}</button>

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Hero: continúa la banda morada de la cabecera */}
      <div style={{ background: T.morado, color: '#fff', padding: '26px 20px 28px' }}>
        <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>{cuentasCaja.length ? 'Disponible' : esPersonal ? 'Salió en ' + mesNombre : 'Gastado en ' + mesNombre}</div>
        <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.05, marginTop: 2, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{fmtCOP(cuentasCaja.length ? disponible : sal)}</div>
        {deuda.total > 0 && <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>Deuda pendiente {fmtCOP(deuda.total)}</div>}
        <div style={{ marginTop: 20, display: 'flex', gap: 10 }}>
          {pill(true, () => goTo('movimientos', { nuevo: true }), <><Icon name="plus" size={16} sw={3} />Anotar gasto</>)}
          {esPersonal ? pill(false, () => goTo('movimientos', { filtro: 'Aportes' }), 'Mis aportes') : pill(false, () => goTo('presupuesto'), 'Presupuesto')}
        </div>
      </div>

      <div style={{ padding: '22px 20px 0', display: 'flex', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: T.gris }}>Entró en {mesNombre}</div><div style={{ fontSize: 20, fontWeight: 800, color: T.verde, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>+ {fmtCOP(ing + totRecibidos).replace('$', '').trim()}</div>{!esPersonal && ingresosPend > 0 && <div style={{ fontSize: 11, color: T.gris, marginTop: 2 }}>por cobrar {fmtCOP(ingresosPend)}</div>}</div>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: T.gris }}>Salió en {mesNombre}</div><div style={{ fontSize: 20, fontWeight: 800, color: T.tinta, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>− {fmtCOP(sal + totAportes).replace('$', '').trim()}</div>{esPersonal && totAportes > 0 && <div style={{ fontSize: 11, color: T.gris, marginTop: 2 }}>incluye aportes {fmtCOP(totAportes)}</div>}</div>
      </div>

      <OfertaInicio goTo={goTo} />
      {totalP > 0 && <Seccion titulo="Presupuesto del mes" extra={`${Math.round(totalE / totalP * 100)}% ejecutado`}>
        <div style={{ marginTop: 10, height: 8, borderRadius: 4, background: T.superficie, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, totalE / totalP * 100)}%`, height: '100%', background: totalE > totalP ? T.rojo : T.morado }} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: T.gris }}><span>Ejecutado <b style={{ color: T.tinta }}>{fmtCOP(totalE)}</b></span><span>de <b style={{ color: T.tinta }}>{fmtCOP(totalP)}</b></span></div>
      </Seccion>}

      {cuentasCaja.length > 0 && <Seccion titulo={esPersonal ? 'Mis cuentas' : `Cuentas de ${espacio.nombre}`}>
        <div style={{ marginTop: 6 }}>{cuentasCaja.map(c => <Fila key={c.id} titulo={c.nombre} sub={c.tipo} monto={fmtCOP(saldoCuenta(c))} montoColor={saldoCuenta(c) < 0 ? T.rojo : undefined} />)}</div>
        <div style={{ fontSize: 11, color: T.grisClaro, marginTop: 8 }}>Saldo calculado con lo registrado en la app.</div>
      </Seccion>}

      {esPersonal && compartidos.length > 0 && <Seccion titulo="Mis espacios">
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {compartidos.map(e => { const a = aportesMes[e.id] || { aportes: 0, recibidos: 0, ingresos: 0 }; const plan = planAportes[e.id] || 0
            const partes = []
            if (a.aportes || plan) partes.push(`Aporté ${fmtCOP(a.aportes)}${plan ? ` de ${fmtCOP(plan)} planificados` : ''}`)
            if (a.ingresos) partes.push(`Me pagó ${fmtCOP(a.ingresos)}`)
            if (a.recibidos) partes.push(`Recibí ${fmtCOP(a.recibidos)}`)
            return <FilaEspacio key={e.id} onClick={() => cambiarEspacio(e.id)} icono={TIPO_ICON[e.tipo]} oscuro={e.tipo === 'empresa'} titulo={e.nombre} sub={partes.join(' · ') || `Sin movimientos en ${mesNombre}`} /> })}
        </div>
      </Seccion>}

      {!esPersonal && Object.keys(porMiembroTotal).length > 0 && <Seccion titulo="Aportes por miembro" extra={mesNombre}>
        <div style={{ marginTop: 6 }}>{miembros.map(m => { const a = porMiembro[m.user_id] || { aportes: 0, recibidos: 0 }; const tt = porMiembroTotal[m.user_id] || { aportes: 0, recibidos: 0 }; return <Fila key={m.user_id} titulo={m.nombre} sub={`${a.recibidos ? `recibió ${fmtCOP(a.recibidos)} · ` : ''}acumulado ${fmtCOP(tt.aportes - tt.recibidos)}`} monto={fmtCOP(a.aportes - a.recibidos)} montoColor={T.morado} /> })}</div>
        <div style={{ fontSize: 11, color: T.grisClaro, marginTop: 8 }}>Cuenta lo pagado con cuentas personales de cada miembro. Lo pagado con cuentas del espacio no es aporte.</div>
      </Seccion>}

      {tcs.length > 0 && <Seccion titulo="Tarjetas" extra={`${tcs.length} factura${tcs.length !== 1 ? 's' : ''}`}>
        <div style={{ marginTop: 6 }}>{tcs.map(r => <Fila key={r.cuenta.id} onClick={() => goTo('deudas')} titulo={r.cuenta.nombre} sub={`${r.activos.length} compra${r.activos.length !== 1 ? 's' : ''} · vence ${fmtDate(r.proximaFecha)}`} monto={fmtCOP(r.proximaFactura)} />)}</div>
      </Seccion>}

      <Seccion titulo="Esta semana" extra={nPend ? `${nPend} pago${nPend !== 1 ? 's' : ''}` : null}>
        <div style={{ marginTop: 6 }}>
          {nPend === 0 && <div style={{ color: T.gris, fontSize: 13, padding: '14px 0' }}>Nada pendiente en los próximos 7 días.</div>}
          {proxProg.map(p => { const d = daysLeft(p.vencimiento); const esIng = p.flujo === 'ingreso'; const [est, col] = estadoVenc(d); return <Fila key={p.id} onClick={() => goTo('programado')} titulo={p.nombre} sub={est || `${esIng ? 'Cobrar' : 'Pagar'} · ${fmtDate(p.vencimiento)}`} subColor={col} monto={(esIng ? '+ ' : '') + fmtCOP(p.monto)} montoColor={esIng ? T.verde : undefined} /> })}
          {proxP.map(p => <Fila key={p.id} onClick={() => goTo('presupuesto')} titulo={p.concepto} sub={`${p.pagador_id && !esPersonal ? nombreMiembro(p.pagador_id) + ' · ' : ''}${p.estado === 'Programado' ? 'Programado · ' : ''}${fmtDate(p.fecha_tentativa)}`} monto={fmtCOP(p.monto)} />)}
        </div>
      </Seccion>

      {byGrupo.length > 0 && <Seccion titulo="Plan vs ejecución"><div style={{ marginTop: 12 }}><BarChartCJ labels={byGrupo.map(x => x.name)} datasets={[{ label: 'Presupuestado', data: byGrupo.map(x => x.p), backgroundColor: '#D9D2EA', borderRadius: 4 }, { label: 'Ejecutado', data: byGrupo.map(x => x.e), backgroundColor: T.morado, borderRadius: 4 }]} height={180} /></div></Seccion>}
      {topCat.length > 0 && <Seccion titulo={`Gastos de ${mesNombre} por categoría`} style={{ paddingBottom: 8 }}><div style={{ marginTop: 12 }}><PieChartCJ labels={topCat.map(x => x[0])} data={topCat.map(x => x[1])} height={200} /></div></Seccion>}
    </div>
  )
}
