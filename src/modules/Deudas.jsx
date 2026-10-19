import { useState } from 'react'
import { useData, useIndices } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Kpi, Card, Icon, IcoText, Modal, Field, inp, sel, SaveBtn, CancelBtn, SmallBtn, PrimaryBtn, Aviso, useForm } from '../lib/ui'
import MoverA from './MoverA'
import { fmtCOP, fmtDate, today, cfFija, TC, TIPOS_DEUDA } from '../lib/util'
import { indicePagadas, resumenDeuda, resumenTarjeta } from '../lib/finanzas'
import { parseMonto } from '../lib/csv'

export default function Deudas({ goTo }) {
  const { db, all, insertar, actualizar, borrar, rpc, nombreCuenta, duenoCuenta, nombreMiembro } = useData(); const ix = useIndices(); const { esPersonal, userId, espacio } = useAuth()
  const [mover, setMover] = useState(null)
  const [open, setOpen] = useState(null); const [modal, setModal] = useState(null); const [showAll, setShowAll] = useState({})
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const emptyD = { nombre: '', acreedor: '', tipo: 'Consumo', activo_id: null, cuenta_pago_id: cuentasCaja[0]?.id || null, capital_inicial: '', tasa_mensual: '', total_cuotas: '', fecha_primera_cuota: today(), estado: 'Activo', notas: '' }
  const [form, sf, setForm] = useForm(emptyD)
  const idx = indicePagadas(db.cuotas_pagadas)
  // Tarjetas visibles en este espacio: propias (personal) o habilitadas por miembros; sus compras se filtran por espacio
  const tarjetas = db.cuentas.filter(c => c.tipo === TC).map(c => resumenTarjeta(c, db.tc_cargos, idx))
  const creditos = db.deudas.map(d => resumenDeuda(d, idx))
  const totalCred = creditos.filter(d => d.estado === 'Activo').reduce((a, d) => a + d.capitalPendiente, 0)
  const totalTC = tarjetas.reduce((a, r) => a + r.saldo, 0)
  const cargaMes = creditos.filter(d => d.estado === 'Activo').reduce((a, d) => a + d.cf, 0) + tarjetas.reduce((a, r) => a + r.proximaFactura, 0)
  const cfEst = form.capital_inicial && form.total_cuotas ? Math.round(cfFija(parseMonto(form.capital_inicial) || 0, parseFloat(form.tasa_mensual) || 0, parseInt(form.total_cuotas) || 1)) : 0

  const saveD = async () => {
    if (!form.nombre || !form.capital_inicial || !form.total_cuotas) return
    const row = { nombre: form.nombre, notas: form.notas, tipo: form.tipo, activo_id: form.activo_id || null, cuenta_pago_id: form.cuenta_pago_id || null, capital_inicial: parseMonto(form.capital_inicial), tasa_mensual: parseFloat(form.tasa_mensual) || 0, total_cuotas: parseInt(form.total_cuotas), fecha_primera_cuota: form.fecha_primera_cuota, estado: form.estado }
    try { modal === 'add' ? await insertar('deudas', row) : await actualizar('deudas', modal.id, row); setModal(null) } catch (e) { alert(e.message) }
  }
  const pagarC = async (d, c) => { try { await rpc('pagar_cuota_credito', { p_deuda: d.id, p_numero: c.n, p_fecha: today(), p_cuenta: d.cuenta_pago_id, p_capital: c.capital, p_interes: c.interes, p_extras: {} }) } catch (e) { alert(e.message) } }
  const anularC = async c => { if (!window.confirm('¿Anular el pago de esta cuota? Se eliminará también el movimiento de caja.')) return; if (c.pago.movimiento_id) await borrar('movimientos', c.pago.movimiento_id); await borrar('cuotas_pagadas', c.pago.id) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}><Kpi icon="landmark" value={fmtCOP(totalCred)} label="Créditos" color="#dc2626" /><Kpi icon="card" value={fmtCOP(totalTC)} label="Tarjetas" color="#7c3aed" /><Kpi icon="calendar" value={fmtCOP(cargaMes)} label="Carga mes" color="#d97706" /></div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}><div style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>Tarjetas de crédito ({tarjetas.length})</div>{esPersonal && <SmallBtn onClick={() => goTo('config')} bg="#f1f5f9" color="#475569"><Icon name="plus" size={12} />Nueva en Config</SmallBtn>}</div>
      {tarjetas.length === 0 && <Card style={{ textAlign: 'center', color: '#9ca3af', fontSize: 12, border: '1px dashed #e5e7eb' }}>{esPersonal ? 'Crea una cuenta tipo "Tarjeta crédito" en Config y aparecerá aquí.' : 'Ningún miembro ha habilitado una tarjeta en este espacio. Cada quien lo hace desde su espacio personal (Config → Cuentas).'}</Card>}
      {tarjetas.map(r => <Tarjeta key={r.cuenta.id} r={r} esDueno={duenoCuenta(r.cuenta) === userId || r.cuenta.espacio_id === espacio.id} onMover={setMover} />)}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}><div style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>Créditos ({creditos.length})</div><PrimaryBtn onClick={() => { setForm(emptyD); setModal('add') }} style={{ padding: '8px 14px', fontSize: 13 }}><Icon name="plus" size={13} />Nuevo</PrimaryBtn></div>
      {creditos.map(r => { const isOpen = open === r.id; const vT = showAll[r.id]; const rows = vT ? r.am : r.am.slice(Math.max(0, r.pagadas - 1), r.pagadas + 4); return (
        <div key={r.id} style={{ background: '#fff', borderRadius: 16, border: '1px solid #fecaca', overflow: 'hidden', opacity: r.estado === 'Activo' ? 1 : 0.7 }}>
          <div onClick={() => setOpen(isOpen ? null : r.id)} style={{ padding: '14px 16px', cursor: 'pointer', background: r.estado === 'Activo' ? 'linear-gradient(135deg,#7f1d1d,#b91c1c)' : 'linear-gradient(135deg,#374151,#6b7280)', color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 10, opacity: 0.75, letterSpacing: '0.1em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={r.tipo === 'Vehicular' ? 'car' : r.tipo === 'Hipotecario' ? 'home' : 'banknote'} size={12} />Crédito {r.tipo.toLowerCase()}{r.estado !== 'Activo' ? ' · cancelado' : ''}</div>
                <div style={{ fontWeight: 800, fontSize: 16, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</div>
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{r.tasa_mensual}% m.v. · {r.total_cuotas} cuotas{r.activo_id ? ` · ${ix.act[r.activo_id]?.nombre}` : ''}</div>
              </div>
              <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
              <div><div style={{ fontSize: 9, opacity: 0.75, textTransform: 'uppercase' }}>Saldo capital</div><div style={{ fontWeight: 800, fontSize: 14 }}>{fmtCOP(r.capitalPendiente)}</div></div>
              <div><div style={{ fontSize: 9, opacity: 0.75, textTransform: 'uppercase' }}>Próxima cuota</div><div style={{ fontWeight: 800, fontSize: 14, color: '#fcd34d' }}>{r.proxima ? fmtCOP(r.proxima.total) : '—'}</div>{r.proxima && <div style={{ fontSize: 9, opacity: 0.8 }}>{r.proxima.fecha < today() ? 'Vencida · ' : ''}{fmtDate(r.proxima.fecha)} · N° {r.proxima.n}</div>}</div>
              <div><div style={{ fontSize: 9, opacity: 0.75, textTransform: 'uppercase' }}>Cuota fija</div><div style={{ fontWeight: 800, fontSize: 14 }}>{fmtCOP(r.cf)}</div><div style={{ fontSize: 9, opacity: 0.8 }}>{ix.cta[r.cuenta_pago_id] ? nombreCuenta(ix.cta[r.cuenta_pago_id]) : 'sin cuenta'}</div></div>
            </div>
            <div style={{ marginTop: 10 }}><div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 99, height: 6 }}><div style={{ height: 6, borderRadius: 99, background: '#86efac', width: `${r.pct}%` }} /></div><div style={{ fontSize: 9, opacity: 0.8, marginTop: 3 }}>{r.pct}% amortizado · {r.pagadas}/{r.total_cuotas} cuotas pagadas · capital pagado {fmtCOP(r.capitalPagado)}</div></div>
          </div>
          {r.estado === 'Activo' && r.proxima && !isOpen && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '8px 12px', background: '#fff' }}><SmallBtn onClick={() => setOpen(r.id)} bg="#f1f5f9" color="#475569">Ver tabla</SmallBtn><SmallBtn onClick={() => { if (window.confirm(`¿Registrar el pago de la cuota ${r.proxima.n} por ${fmtCOP(r.proxima.total)} desde ${ix.cta[r.cuenta_pago_id] ? nombreCuenta(ix.cta[r.cuenta_pago_id]) : 'la cuenta de pago'}?`)) pagarC(r, r.proxima) }} bg="#dc2626" color="#fff"><Icon name="check" size={12} />Pagar cuota {r.proxima.n}</SmallBtn></div>}
          {isOpen && <div style={{ borderTop: '1px solid #f0f0f0' }}>
            <div style={{ padding: '8px 12px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontWeight: 700, fontSize: 12, color: '#374151' }}>Tabla de amortización</div>
              <div style={{ display: 'flex', gap: 6 }}><SmallBtn onClick={() => setShowAll(p => ({ ...p, [r.id]: !vT }))} bg="#f9fafb" color="#6b7280">{vT ? 'Menos' : 'Todas'}</SmallBtn><SmallBtn onClick={() => setMover({ tabla: 'deudas', id: r.id, nombre: r.nombre })} bg="#f1f5f9" color="#475569"><Icon name="arrow-right" size={12} />Mover</SmallBtn><SmallBtn onClick={() => { setForm({ ...r, capital_inicial: String(r.capital_inicial), tasa_mensual: String(r.tasa_mensual), total_cuotas: String(r.total_cuotas) }); setModal(r) }} bg="#ede9fe" color="#7c3aed"><Icon name="pencil" size={13} /></SmallBtn><SmallBtn onClick={async () => { if (window.confirm('¿Eliminar este crédito y su historial de cuotas?')) await borrar('deudas', r.id) }} bg="#fee2e2" color="#dc2626"><Icon name="trash" size={13} /></SmallBtn></div></div>
            <div style={{ overflowX: 'auto', padding: '0 8px 12px' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 380 }}>
              <thead><tr style={{ background: '#f9fafb' }}>{['N°', 'Fecha', 'Capital', 'Interés', 'Esperado', 'Pagado', 'Estado', ''].map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>{rows.map(c => { const venc = !c.pago && c.fecha < today(); const pr = c.pago?.monto_pagado; const dif = pr != null ? +pr - c.total : null; return (
                <tr key={c.n} style={{ borderBottom: '1px solid #f9fafb', background: c.pago ? '#f0fdf4' : venc ? '#fff5f5' : '' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: '#7c3aed' }}>{c.n}</td><td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtDate(c.fecha)}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtCOP(c.capital)}</td><td style={{ padding: '6px 8px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtCOP(c.interes)}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtCOP(c.total)}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{pr != null ? <span style={{ fontWeight: 700, color: dif > 0 ? '#dc2626' : dif < 0 ? '#059669' : '#374151' }}>{fmtCOP(pr)}</span> : <span style={{ color: '#d1d5db' }}>—</span>}</td>
                  <td style={{ padding: '6px 8px' }}>{c.pago ? <span style={{ background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700 }}>✓ {fmtDate(c.pago.fecha_pago)}</span> : venc ? <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700 }}>Vencida</span> : <span style={{ background: '#f1f5f9', color: '#64748b', padding: '1px 6px', borderRadius: 8, fontSize: 9 }}>Pend.</span>}</td>
                  <td style={{ padding: '6px 8px' }}>{!c.pago ? <button onClick={() => pagarC(r, c)} style={{ fontSize: 9, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 7px', cursor: 'pointer', fontWeight: 700 }}>Pagar</button> : <button onClick={() => anularC(c)} style={{ fontSize: 9, background: '#f1f5f9', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 6px', cursor: 'pointer' }}>Anular</button>}</td>
                </tr>) })}
              {!vT && r.am.length > rows.length && <tr><td colSpan={8} style={{ padding: 8, textAlign: 'center', color: '#9ca3af', fontSize: 10 }}>…{r.am.length - rows.length} más</td></tr>}</tbody>
            </table></div>
          </div>}
        </div>) })}

      {modal && <Modal title={modal === 'add' ? 'Nuevo crédito' : 'Editar crédito'} onClose={() => setModal(null)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Nombre" full><input value={form.nombre} onChange={e => sf('nombre', e.target.value)} style={inp} /></Field>
          <Field label="Tipo"><select value={form.tipo} onChange={e => sf('tipo', e.target.value)} style={sel}>{TIPOS_DEUDA.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Capital inicial"><input type="number" inputMode="numeric" value={form.capital_inicial} onChange={e => sf('capital_inicial', e.target.value)} style={inp} /></Field>
          <Field label="Tasa mensual (%)"><input type="number" inputMode="decimal" step="0.01" value={form.tasa_mensual} onChange={e => sf('tasa_mensual', e.target.value)} style={inp} /></Field>
          <Field label="Total cuotas"><input type="number" inputMode="numeric" value={form.total_cuotas} onChange={e => sf('total_cuotas', e.target.value)} style={inp} /></Field>
          <Field label="Primera cuota"><input type="date" value={form.fecha_primera_cuota} onChange={e => sf('fecha_primera_cuota', e.target.value)} style={inp} /></Field>
          <Field label="Cuenta de pago"><select value={form.cuenta_pago_id || ''} onChange={e => sf('cuenta_pago_id', e.target.value || null)} style={sel}>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{nombreCuenta(x)}</option>)}</select></Field>
          <Field label="Activo asociado"><select value={form.activo_id || ''} onChange={e => sf('activo_id', e.target.value || null)} style={sel}><option value="">— Ninguno —</option>{db.activos.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          <Field label="Estado"><select value={form.estado} onChange={e => sf('estado', e.target.value)} style={sel}><option>Activo</option><option>Cancelado</option></select></Field>
          <Field label="Notas" full><input value={form.notas || ''} onChange={e => sf('notas', e.target.value)} style={inp} /></Field>
        </div>
        {cfEst > 0 && <div style={{ background: '#f5f3ff', borderRadius: 10, padding: '10px 14px', marginTop: 12, display: 'flex', gap: 20 }}><div><div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase' }}>Cuota fija est.</div><div style={{ fontWeight: 800, fontSize: 15, color: '#7c3aed' }}>{fmtCOP(cfEst)}</div></div><div><div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase' }}>Total a pagar</div><div style={{ fontWeight: 800, fontSize: 15, color: '#dc2626' }}>{fmtCOP(cfEst * (parseInt(form.total_cuotas) || 0))}</div></div></div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={saveD}>Guardar</SaveBtn></div>
      </Modal>}
      {mover && <MoverA item={mover} onClose={() => setMover(null)} />}
    </div>
  )
}

function Tarjeta({ r, esDueno, onMover }) {
  const { db, all, insertar, actualizar, borrar, rpc, nombreCuenta, espacioDe, duenoCuenta, nombreMiembro } = useData(); const ix = useIndices(); const { esPersonal, espacio } = useAuth()
  const [open, setOpen] = useState(false); const [cargoOpen, setCargoOpen] = useState(null); const [modal, setModal] = useState(null)
  // Para la factura: todas las compras de esta tarjeta en todos mis espacios (solo el dueño la paga)
  const idxAll = indicePagadas(all.cuotas_pagadas); const rAll = resumenTarjeta(r.cuenta, all.tc_cargos, idxAll)
  const [form, sf, setForm] = useForm({})
  const tc = r.cuenta; const corte = tc.dia_corte || 15; const tasaDefault = +tc.tasa_mensual || 0
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const primeraCuota = f => { const d = new Date(f + 'T12:00:00'); const y = d.getFullYear(), m = d.getMonth(); const dc = Math.min(corte, 28); const corteMes = new Date(y, m, dc, 12); const base = d <= corteMes ? corteMes : new Date(y, m + 1, dc, 12); return new Date(base.getFullYear(), base.getMonth() + 1, dc, 12).toISOString().slice(0, 10) }
  const emptyC = { fecha: today(), descripcion: '', monto: '', cuotas: '1', tasa_mensual: String(tasaDefault), categoria_id: db.categorias.find(c => c.activa !== false)?.id || null, activo_id: null, primera_cuota: primeraCuota(today()) }
  const montoC = parseMonto(form.monto) || 0, cuotasC = parseInt(form.cuotas) || 0, tasaC = parseFloat(form.tasa_mensual) || 0
  const cfC = montoC && cuotasC ? Math.round(cfFija(montoC, tasaC, cuotasC)) : 0
  const saveCompra = async () => {
    if (!form.descripcion || montoC <= 0 || cuotasC < 1) return
    const row = { cuenta_id: tc.id, fecha: form.fecha, descripcion: form.descripcion, monto: montoC, cuotas: cuotasC, tasa_mensual: tasaC, categoria_id: form.categoria_id || null, activo_id: form.activo_id || null, primera_cuota: form.primera_cuota }
    try { modal === 'compra' ? await insertar('tc_cargos', row) : await actualizar('tc_cargos', form.id, row); setModal(null) } catch (e) { alert(e.message) }
  }
  // Factura
  const openFactura = () => { const incl = {}, ext = {}; rAll.activos.forEach(c => { incl[c.id] = true; ext[c.id] = String(c.next.total) }); setForm({ fecha: today(), cuenta_pago_id: cuentasCaja[0]?.id || null, incl, ext, manejo: '', mora: '', seguros: '', otros: '', presupuesto_id: '' }); setModal('factura') }
  const inclList = rAll.activos.filter(c => form.incl?.[c.id]); const esperado = inclList.reduce((a, c) => a + c.next.total, 0); const extracto = inclList.reduce((a, c) => a + (parseMonto(form.ext?.[c.id]) || 0), 0)
  const fM = parseMonto(form.manejo) || 0, fMo = parseMonto(form.mora) || 0, fS = parseMonto(form.seguros) || 0, fO = parseMonto(form.otros) || 0; const extras = fM + fMo + fS + fO; const totalPagar = extracto + extras; const dif = extracto - esperado
  const saveFactura = async () => {
    if (!inclList.length && !extras) return
    const items = inclList.map(c => ({ cargo_id: c.id, descripcion: c.descripcion, n: c.next.n, de: c.cuotas, esperado: c.next.total, pagado: parseMonto(form.ext[c.id]) || 0, capital: c.next.capital, interes: c.next.interes }))
    try { await rpc('pagar_factura_tc', { p_tc: tc.id, p_fecha: form.fecha, p_cuenta_pago: form.cuenta_pago_id, p_items: items, p_extras: { cuota_manejo: fM, mora: fMo, seguros: fS, otros: fO }, p_presupuesto_id: form.presupuesto_id || null }); setModal(null) } catch (e) { alert(e.message) }
  }
  const anularCuota = async x => { if (!window.confirm('¿Anular esta cuota? (El movimiento de la factura no se borra)')) return; await borrar('cuotas_pagadas', x.pago.id) }
  const usoPct = r.cupo > 0 ? Math.min(100, Math.round(rAll.saldo / r.cupo * 100)) : 0

  return (
    <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #e9d5ff', overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{ padding: '14px 16px', cursor: 'pointer', background: 'linear-gradient(135deg,#1e1b4b,#4c1d95)', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div><div style={{ fontSize: 10, opacity: 0.7, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Tarjeta de crédito{!esDueno ? ` · de ${nombreMiembro(duenoCuenta(tc))}` : ''}</div><div style={{ fontWeight: 800, fontSize: 15, marginTop: 2 }}>{tc.nombre}</div><div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{tc.banco || ''}{tc.ultimos4 ? ` •••• ${tc.ultimos4}` : ''} · corte día {corte}{!esPersonal ? ` · compras de ${espacio.nombre}` : ''}</div></div>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
          <div><div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase' }}>{esPersonal ? 'Saldo total' : 'Saldo de este espacio'}</div><div style={{ fontWeight: 800, fontSize: 14 }}>{fmtCOP(esPersonal ? rAll.saldo : r.saldo)}</div>{esPersonal && rAll.saldo !== r.saldo && <div style={{ fontSize: 9, opacity: 0.7 }}>personal {fmtCOP(r.saldo)}</div>}</div>
          <div><div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase' }}>Próxima factura</div><div style={{ fontWeight: 800, fontSize: 14, color: '#fcd34d' }}>{fmtCOP(esPersonal ? rAll.proximaFactura : r.proximaFactura)}</div>{(esPersonal ? rAll : r).proximaFecha && <div style={{ fontSize: 9, opacity: 0.7 }}>{fmtDate((esPersonal ? rAll : r).proximaFecha)}</div>}</div>
          {esDueno ? <div><div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase' }}>Cupo disponible</div><div style={{ fontWeight: 800, fontSize: 14, color: rAll.disponible < 0 ? '#fca5a5' : '#86efac' }}>{fmtCOP(rAll.disponible)}</div></div> : <div><div style={{ fontSize: 9, opacity: 0.7, textTransform: 'uppercase' }}>Compras aquí</div><div style={{ fontWeight: 800, fontSize: 14 }}>{r.activos.length}</div></div>}
        </div>
        {esDueno && r.cupo > 0 && <div style={{ marginTop: 10 }}><div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 99, height: 6 }}><div style={{ height: 6, borderRadius: 99, background: usoPct > 80 ? '#f87171' : usoPct > 50 ? '#fbbf24' : '#4ade80', width: `${usoPct}%` }} /></div><div style={{ fontSize: 9, opacity: 0.75, marginTop: 3 }}>{usoPct}% del cupo ({fmtCOP(r.cupo)}) · {rAll.activos.length} compra{rAll.activos.length !== 1 ? 's' : ''} activa{rAll.activos.length !== 1 ? 's' : ''}{rAll.activos.length !== r.activos.length ? ` (${r.activos.length} en este espacio)` : ''}</div></div>}
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderBottom: open ? '1px solid #f0f0f0' : 'none' }}>
        <button onClick={() => { setForm(emptyC); setModal('compra') }} style={{ flex: 1, background: '#ede9fe', color: '#6d28d9', border: 'none', borderRadius: 10, padding: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer' }}><IcoText name="cart" size={14}>Registrar compra</IcoText></button>
        {esPersonal && esDueno ? <button onClick={openFactura} disabled={!rAll.activos.length} style={{ flex: 1, background: rAll.activos.length ? '#7c3aed' : '#e5e7eb', color: rAll.activos.length ? '#fff' : '#9ca3af', border: 'none', borderRadius: 10, padding: 10, fontWeight: 700, fontSize: 13, cursor: rAll.activos.length ? 'pointer' : 'not-allowed' }}><IcoText name="banknote" size={14}>Pagar factura</IcoText></button> : <div style={{ flex: 1, fontSize: 10, color: '#6b7280', display: 'flex', alignItems: 'center', padding: '0 6px' }}>{esDueno ? 'La factura se paga desde tu espacio personal.' : `La factura la paga ${nombreMiembro(duenoCuenta(tc))} desde su espacio personal.`}</div>}
      </div>
      {open && <div style={{ padding: '4px 0 12px' }}>
        <div style={{ padding: '8px 14px 6px', fontWeight: 700, fontSize: 12, color: '#374151' }}>Compras ({r.cargos.length})</div>
        {r.cargos.length === 0 && <div style={{ padding: '10px 14px', color: '#9ca3af', fontSize: 12 }}>Sin compras en este espacio. No afectan la caja hasta que se pague la factura.</div>}
        {[...r.cargos].sort((a, b) => (a.liquidado ? 1 : 0) - (b.liquidado ? 1 : 0) || b.fecha.localeCompare(a.fecha)).map(c => { const isO = cargoOpen === c.id; const pct = Math.round(c.pagadas / c.cuotas * 100); return (
          <div key={c.id} style={{ margin: '0 10px 8px', borderRadius: 12, border: '1px solid #f0f0f0', background: c.liquidado ? '#f9fafb' : '#fff', overflow: 'hidden' }}>
            <div onClick={() => setCargoOpen(isO ? null : c.id)} style={{ padding: '10px 12px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13, color: c.liquidado ? '#9ca3af' : '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descripcion}</div><div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{fmtDate(c.fecha)} · {ix.cat[c.categoria_id]?.nombre || '—'} · {c.cuotas} cuota{c.cuotas > 1 ? 's' : ''} {+c.tasa_mensual > 0 ? `al ${c.tasa_mensual}%` : 'sin interés'} · registró {nombreMiembro(c.creado_por)}</div></div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontWeight: 800, fontSize: 13 }}>{fmtCOP(c.monto)}</div>{c.liquidado ? <span style={{ background: '#d1fae5', color: '#065f46', padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700 }}>Liquidada</span> : <div style={{ fontSize: 10, color: '#dc2626' }}>Debe {fmtCOP(c.saldo)}</div>}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}><div style={{ flex: 1, background: '#e5e7eb', borderRadius: 99, height: 5 }}><div style={{ height: 5, borderRadius: 99, background: 'linear-gradient(90deg,#7c3aed,#06b6d4)', width: `${pct}%` }} /></div><span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700 }}>{c.pagadas}/{c.cuotas}</span>{c.next && <span style={{ fontSize: 10, color: '#6b7280' }}>· próx. {fmtCOP(c.next.total)} el {fmtDate(c.next.fecha)}</span>}</div>
            </div>
            {isO && <div style={{ borderTop: '1px solid #f0f0f0', padding: '8px 8px 10px' }}>
              <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 340 }}>
                <thead><tr style={{ background: '#f9fafb' }}>{['N°', 'Fecha', 'Capital', 'Interés', 'Esperado', 'Pagado', 'Estado'].map(h => <th key={h} style={{ padding: '5px 7px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
                <tbody>{c.am.map(x => { const venc = !x.pago && x.fecha < today(); const pr = x.pago?.monto_pagado; const d = pr != null ? +pr - x.total : null; return (
                  <tr key={x.n} style={{ borderBottom: '1px solid #f9fafb', background: x.pago ? '#f0fdf4' : venc ? '#fff5f5' : '' }}>
                    <td style={{ padding: '5px 7px', fontWeight: 700, color: '#7c3aed' }}>{x.n}</td><td style={{ padding: '5px 7px', whiteSpace: 'nowrap' }}>{fmtDate(x.fecha)}</td><td style={{ padding: '5px 7px', whiteSpace: 'nowrap' }}>{fmtCOP(x.capital)}</td><td style={{ padding: '5px 7px', color: '#9ca3af', whiteSpace: 'nowrap' }}>{fmtCOP(x.interes)}</td><td style={{ padding: '5px 7px', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtCOP(x.total)}</td>
                    <td style={{ padding: '5px 7px', whiteSpace: 'nowrap' }}>{pr != null ? <span style={{ fontWeight: 700, color: d > 0 ? '#dc2626' : d < 0 ? '#059669' : '#374151' }}>{fmtCOP(pr)}</span> : <span style={{ color: '#d1d5db' }}>—</span>}</td>
                    <td style={{ padding: '5px 7px' }}>{x.pago ? <button onClick={() => anularCuota(x)} style={{ fontSize: 9, background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 700 }}>✓ {fmtDate(x.pago.fecha_pago)}</button> : venc ? <span style={{ background: '#fee2e2', color: '#991b1b', padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700 }}>Vencida</span> : <span style={{ background: '#f1f5f9', color: '#64748b', padding: '1px 6px', borderRadius: 8, fontSize: 9 }}>Pend.</span>}</td>
                  </tr>) })}</tbody></table></div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}><SmallBtn onClick={() => onMover({ tabla: 'tc_cargos', id: c.id, nombre: c.descripcion })} bg="#f1f5f9" color="#475569"><Icon name="arrow-right" size={12} />Mover</SmallBtn><SmallBtn onClick={() => { setForm({ ...c, monto: String(c.monto), cuotas: String(c.cuotas), tasa_mensual: String(c.tasa_mensual) }); setModal('editCargo') }} bg="#ede9fe" color="#7c3aed"><Icon name="pencil" size={12} />Editar</SmallBtn><SmallBtn onClick={async () => { if (window.confirm('¿Eliminar esta compra y sus cuotas?')) await borrar('tc_cargos', c.id) }} bg="#fee2e2" color="#dc2626"><Icon name="trash" size={12} />Eliminar</SmallBtn></div>
            </div>}
          </div>) })}
      </div>}

      {(modal === 'compra' || modal === 'editCargo') && <Modal title={modal === 'compra' ? `Compra con ${tc.nombre}` : 'Editar compra'} onClose={() => setModal(null)}>
        <div style={{ marginBottom: 14 }}><Aviso tipo="info">Esta compra NO afecta la caja. Se convierte en cuotas dentro de la tarjeta{!esPersonal ? ` y queda como gasto de ${espacio.nombre}; al pagar la factura, su porción será aporte de ${nombreMiembro(duenoCuenta(tc))}` : ' y la pagas con la factura mensual'}.</Aviso></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Descripción" full><input value={form.descripcion || ''} onChange={e => sf('descripcion', e.target.value)} style={inp} placeholder="Ej. Televisor, Mercado Éxito…" /></Field>
          <Field label="Fecha compra"><input type="date" value={form.fecha || ''} onChange={e => { sf('fecha', e.target.value); if (modal === 'compra') sf('primera_cuota', primeraCuota(e.target.value)) }} style={inp} /></Field>
          <Field label="Monto (COP)"><input type="number" inputMode="numeric" value={form.monto || ''} onChange={e => sf('monto', e.target.value)} style={inp} /></Field>
          <Field label="N° cuotas *"><input type="number" inputMode="numeric" min="1" max="60" value={form.cuotas || ''} onChange={e => sf('cuotas', e.target.value)} style={{ ...inp, borderColor: !cuotasC ? '#f59e0b' : '#e5e7eb' }} /></Field>
          <Field label="Tasa mensual (%)"><input type="number" inputMode="decimal" step="0.01" value={form.tasa_mensual ?? ''} onChange={e => sf('tasa_mensual', e.target.value)} style={inp} /></Field>
          <Field label="Categoría"><select value={form.categoria_id || ''} onChange={e => sf('categoria_id', e.target.value || null)} style={sel}>{db.categorias.filter(c => c.activa !== false && !['Pago tarjeta crédito', 'Cuota crédito'].includes(c.nombre)).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          <Field label="Activo"><select value={form.activo_id || ''} onChange={e => sf('activo_id', e.target.value || null)} style={sel}><option value="">— Ninguno —</option>{db.activos.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></Field>
          <Field label="Primera cuota"><input type="date" value={form.primera_cuota || ''} onChange={e => sf('primera_cuota', e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{[1, 3, 6, 12, 24].map(n => <button key={n} onClick={() => sf('cuotas', String(n))} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: '1px solid', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: cuotasC === n ? '#7c3aed' : '#fff', color: cuotasC === n ? '#fff' : '#6b7280', borderColor: cuotasC === n ? '#7c3aed' : '#e5e7eb' }}>{n}</button>)}<button onClick={() => sf('tasa_mensual', '0')} style={{ flex: 1.4, padding: '6px 0', borderRadius: 8, border: '1px solid', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: tasaC === 0 && form.tasa_mensual !== '' ? '#059669' : '#fff', color: tasaC === 0 && form.tasa_mensual !== '' ? '#fff' : '#6b7280', borderColor: tasaC === 0 && form.tasa_mensual !== '' ? '#059669' : '#e5e7eb' }}>0% interés</button></div>
        {cfC > 0 && <div style={{ marginTop: 12, background: '#ede9fe', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, textTransform: 'uppercase' }}>Cuota mensual · {cuotasC}</div><div style={{ fontSize: 10, color: '#6b7280' }}>Total {fmtCOP(cfC * cuotasC)}{tasaC > 0 ? ` · intereses ${fmtCOP(cfC * cuotasC - montoC)}` : ''}</div></div><div style={{ fontWeight: 800, fontSize: 16, color: '#7c3aed' }}>{fmtCOP(cfC)}</div></div>}
        {esDueno && montoC > rAll.disponible && r.cupo > 0 && modal === 'compra' && <div style={{ marginTop: 8 }}><Aviso tipo="warn">Esta compra supera el cupo disponible ({fmtCOP(rAll.disponible)}).</Aviso></div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={saveCompra} disabled={!form.descripcion || montoC <= 0 || cuotasC < 1}>{modal === 'compra' ? 'Registrar compra' : 'Guardar'}</SaveBtn></div>
      </Modal>}

      {modal === 'factura' && <Modal title={`Pagar factura · ${tc.nombre}`} onClose={() => setModal(null)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Field label="Fecha de pago"><input type="date" value={form.fecha} onChange={e => sf('fecha', e.target.value)} style={inp} /></Field>
          <Field label="Cuenta desde la que pagas"><select value={form.cuenta_pago_id || ''} onChange={e => sf('cuenta_pago_id', e.target.value)} style={sel}>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{nombreCuenta(x)}</option>)}</select></Field>
        </div>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#374151', marginBottom: 6 }}>Cuotas del extracto — ajusta cada valor al del banco</div>
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
          {rAll.activos.map((c, i) => { const on = !!form.incl?.[c.id]; const v = parseMonto(form.ext?.[c.id]) || 0; const d = v - c.next.total; const esp = espacioDe(c.espacio_id); return (
            <div key={c.id} style={{ padding: '10px 12px', borderBottom: i < rAll.activos.length - 1 ? '1px solid #f0f0f0' : 'none', background: on ? '#fff' : '#f9fafb', opacity: on ? 1 : 0.6, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={on} onChange={e => setForm(f => ({ ...f, incl: { ...f.incl, [c.id]: e.target.checked } }))} style={{ width: 18, height: 18, accentColor: '#7c3aed' }} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descripcion}{esp && esp.tipo !== 'personal' && <span style={{ marginLeft: 6, fontSize: 9, background: '#ecfdf5', color: '#047857', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>{esp.nombre}</span>}</div><div style={{ fontSize: 10, color: '#6b7280' }}>Cuota {c.next.n}/{c.cuotas} · cap {fmtCOP(c.next.capital)} + int {fmtCOP(c.next.interes)} = <b>{fmtCOP(c.next.total)}</b></div></div>
              <div style={{ width: 118 }}><input type="number" inputMode="numeric" value={form.ext?.[c.id] ?? ''} disabled={!on} onChange={e => setForm(f => ({ ...f, ext: { ...f.ext, [c.id]: e.target.value } }))} style={{ ...inp, padding: '7px 8px', fontSize: 13, textAlign: 'right', fontWeight: 700, borderColor: d !== 0 && on ? (d > 0 ? '#fca5a5' : '#86efac') : '#e5e7eb' }} />{on && d !== 0 && <div style={{ fontSize: 9, textAlign: 'right', color: d > 0 ? '#dc2626' : '#059669', marginTop: 2 }}>{d > 0 ? '+' : ''}{fmtCOP(d)}</div>}</div>
            </div>) })}
        </div>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#374151', marginBottom: 6 }}>Cargos adicionales del extracto</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <Field label="Cuota de manejo"><input type="number" inputMode="numeric" value={form.manejo} onChange={e => sf('manejo', e.target.value)} style={inp} placeholder="0" /></Field>
          <Field label="Interés de mora"><input type="number" inputMode="numeric" value={form.mora} onChange={e => sf('mora', e.target.value)} style={inp} placeholder="0" /></Field>
          <Field label="Seguros"><input type="number" inputMode="numeric" value={form.seguros} onChange={e => sf('seguros', e.target.value)} style={inp} placeholder="0" /></Field>
          <Field label="Otros"><input type="number" inputMode="numeric" value={form.otros} onChange={e => sf('otros', e.target.value)} style={inp} placeholder="0" /></Field>
        </div>
        <div style={{ background: '#f5f3ff', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: '#6b7280' }}>Esperado ({inclList.length} cuota{inclList.length !== 1 ? 's' : ''})</span><b>{fmtCOP(esperado)}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: '#6b7280' }}>Según extracto</span><b>{fmtCOP(extracto)}</b></div>
          {dif !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: dif > 0 ? '#dc2626' : '#059669' }}><span>Diferencia en cuotas</span><b>{dif > 0 ? '+' : ''}{fmtCOP(dif)}</b></div>}
          {extras > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#d97706' }}><span>Cargos adicionales</span><b>+{fmtCOP(extras)}</b></div>}
          {(() => { const comp = inclList.filter(c => c.espacio_id !== tc.espacio_id).reduce((a, c) => a + (parseMonto(form.ext?.[c.id]) || 0), 0); return comp > 0 ? <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: '#047857' }}><span>De espacios compartidos (queda como aporte tuyo)</span><b>{fmtCOP(comp)}</b></div> : null })()}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #7c3aed', marginTop: 6, paddingTop: 8 }}><span style={{ fontWeight: 800, fontSize: 14 }}>TOTAL A PAGAR</span><span style={{ fontWeight: 800, fontSize: 16, color: '#7c3aed' }}>{fmtCOP(totalPagar)}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={saveFactura} disabled={!inclList.length && !extras}>Registrar pago {fmtCOP(totalPagar)}</SaveBtn></div>
      </Modal>}
    </div>
  )
}
