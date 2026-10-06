import { useState } from 'react'
import { useData, useIndices } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Kpi, Card, Icon, IcoText, Modal, Field, inp, sel, PBtn, SaveBtn, CancelBtn, SmallBtn, PrimaryBtn, Aviso, useForm } from '../lib/ui'
import { fmtCOP, fmtDate, today, TC } from '../lib/util'
import { indicePagadas, resumenDeuda, esCruce } from '../lib/finanzas'
import { parseMonto } from '../lib/csv'

export default function Movimientos({ goTo }) {
  const { db, insertar, borrar } = useData(); const ix = useIndices(); const { miembros } = useAuth()
  const [modal, setModal] = useState(false); const [filtro, setFiltro] = useState('todos'); const [mes, setMes] = useState(today().slice(0, 7))
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const empty = { fecha: today(), tipo: 'Salida', descripcion: '', entidad_id: db.entidades[0]?.id || null, categoria_id: db.categorias[0]?.id || null, cuenta_id: cuentasCaja[0]?.id || null, activo_id: null, presupuesto_id: null, monto: '', deuda_id: '', cuotaN: '', manejo: '', mora: '', otros: '' }
  const [form, sf, setForm] = useForm(empty)
  const catSel = ix.cat[form.categoria_id]
  const isCreditPay = form.tipo === 'Salida' && catSel?.nombre === 'Cuota crédito'
  const idx = indicePagadas(db.cuotas_pagadas)
  const creditos = db.deudas.filter(d => d.estado === 'Activo')
  const credSel = creditos.find(d => d.id === form.deuda_id); const rCred = credSel ? resumenDeuda(credSel, idx) : null
  const cuotaSel = rCred?.am.find(c => c.n === +form.cuotaN) || null
  const xM = parseMonto(form.manejo) || 0, xMo = parseMonto(form.mora) || 0, xO = parseMonto(form.otros) || 0
  const totalCred = cuotaSel ? cuotaSel.total + xM + xMo + xO : 0
  const montoNum = parseMonto(form.monto) || 0
  const canSave = form.descripcion && (isCreditPay ? !!cuotaSel : montoNum > 0)
  const nombreMiembro = uid => miembros.find(m => m.user_id === uid)?.nombre || '—'

  const save = async () => {
    if (!canSave) return
    const row = { fecha: form.fecha, tipo: form.tipo, descripcion: form.descripcion, entidad_id: form.entidad_id || null, categoria_id: form.categoria_id || null, cuenta_id: form.cuenta_id || null, activo_id: form.activo_id || null, presupuesto_id: form.presupuesto_id || null, origen: isCreditPay ? 'credito' : 'manual', monto: isCreditPay ? totalCred : montoNum }
    if (isCreditPay) { row.deuda_id = credSel.id; row.desglose = { cuota: cuotaSel.n, capital: cuotaSel.capital, interes: cuotaSel.interes, cuota_manejo: xM, mora: xMo, otros: xO, esperado: cuotaSel.total, diferencia: totalCred - cuotaSel.total } }
    const mov = await insertar('movimientos', row)
    if (isCreditPay) await insertar('cuotas_pagadas', { deuda_id: credSel.id, numero: cuotaSel.n, fecha_pago: form.fecha, monto_esperado: cuotaSel.total, monto_pagado: totalCred, movimiento_id: mov.id })
    setModal(false)
  }
  const del = async m => { if (!window.confirm('¿Eliminar este movimiento?' + (m.deuda_id || m.tc_cuenta_id ? ' Las cuotas que pagó quedarán pendientes de nuevo.' : ''))) return; await borrar('movimientos', m.id) }

  let items = db.movimientos.filter(m => m.fecha.startsWith(mes)).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado_en || '').localeCompare(a.creado_en || ''))
  if (filtro !== 'todos') items = items.filter(m => m.tipo === filtro)
  const ing = items.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + +m.monto, 0), sal = items.filter(m => m.tipo === 'Salida').reduce((a, m) => a + +m.monto, 0)
  const meses = [...new Set([today().slice(0, 7), ...db.movimientos.map(m => m.fecha.slice(0, 7))])].sort().reverse()

  const Extra = ({ m }) => {
    const d = m.desglose || {}; const extras = (d.cuota_manejo || 0) + (d.mora || 0) + (d.seguros || 0) + (d.otros || 0)
    if (m.tc_cuenta_id) return <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 3 }}><Icon name="card" size={11} style={{ marginRight: 4 }} />Factura {ix.cta[m.tc_cuenta_id]?.nombre} · {d.items?.length || 0} cuota{d.items?.length !== 1 ? 's' : ''}{extras > 0 && <span style={{ color: '#d97706' }}> · extras {fmtCOP(extras)}</span>}{d.diferencia ? <span style={{ color: d.diferencia > 0 ? '#dc2626' : '#059669' }}> · dif. {d.diferencia > 0 ? '+' : ''}{fmtCOP(d.diferencia)}</span> : null}</div>
    if (m.deuda_id) return <div style={{ fontSize: 10, color: '#059669', marginTop: 3 }}><Icon name="check" size={11} style={{ marginRight: 4 }} />{ix.deu[m.deuda_id]?.nombre} · cuota {d.cuota} · capital {fmtCOP(d.capital)} · interés {fmtCOP(d.interes)}{extras > 0 && <span style={{ color: '#d97706' }}> · extras {fmtCOP(extras)}</span>}</div>
    if (m.programado_id) return <div style={{ fontSize: 10, color: '#0891b2', marginTop: 3 }}><Icon name="calendar" size={11} style={{ marginRight: 4 }} />Desde programado</div>
    return null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...sel, fontWeight: 700, textTransform: 'capitalize' }}>{meses.map(m => <option key={m} value={m}>{new Date(m + '-01T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}</option>)}</select>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}><Kpi label="Ingresos" value={fmtCOP(ing)} color="#059669" /><Kpi label="Salidas" value={fmtCOP(sal)} color="#dc2626" /><Kpi label="Neto" value={fmtCOP(ing - sal)} color={ing - sal >= 0 ? '#7c3aed' : '#dc2626'} /></div>
      {db.cuentas.some(c => c.tipo === TC) && <div onClick={() => goTo('deudas')} style={{ cursor: 'pointer' }}><Aviso tipo="info">Las compras con tarjeta se registran dentro de la tarjeta (Deudas). Aquí solo entra el pago de la factura.</Aviso></div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}><PBtn active={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</PBtn><PBtn active={filtro === 'Ingreso'} onClick={() => setFiltro('Ingreso')}>Ingresos</PBtn><PBtn active={filtro === 'Salida'} onClick={() => setFiltro('Salida')}>Salidas</PBtn></div>
        <PrimaryBtn onClick={() => { setForm(empty); setModal(true) }}><Icon name="plus" size={18} sw={2.2} /></PrimaryBtn>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && <Card style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 30 }}>Sin movimientos.</Card>}
        {items.map(m => { const cruce = esCruce(m, ix); const rubro = ix.pre[m.presupuesto_id]; return (
          <div key={m.id} style={{ background: cruce ? '#fffbeb' : '#fff', borderRadius: 14, padding: '12px 14px', border: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion}</div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{ix.ent[m.entidad_id]?.nombre || '—'} · {ix.cat[m.categoria_id]?.nombre || '—'} · {fmtDate(m.fecha)} · {ix.cta[m.cuenta_id]?.nombre || '—'}</div>
                {rubro && <div style={{ fontSize: 10, color: '#7c3aed', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="arrow-right" size={10} />{rubro.concepto}</div>}
                {cruce && <div style={{ fontSize: 10, color: '#d97706', marginTop: 1 }}><IcoText name="alert" size={11} gap={4}>Cruce hogar/empresa</IcoText></div>}
                <Extra m={m} />
                <div style={{ fontSize: 9, color: '#b4b2a9', marginTop: 3 }}>Registró {nombreMiembro(m.creado_por)}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontWeight: 800, fontSize: 14, color: m.tipo === 'Ingreso' ? '#059669' : '#dc2626' }}>{m.tipo === 'Ingreso' ? '+' : '-'}{fmtCOP(m.monto)}</div><span style={{ background: m.tipo === 'Ingreso' ? '#d1fae5' : '#fee2e2', color: m.tipo === 'Ingreso' ? '#065f46' : '#991b1b', padding: '1px 7px', borderRadius: 8, fontSize: 10, fontWeight: 700 }}>{m.tipo}</span></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}><SmallBtn onClick={() => del(m)} bg="#fee2e2" color="#dc2626"><Icon name="trash" size={12} />Eliminar</SmallBtn></div>
          </div>) })}
      </div>

      {modal && <Modal title="Registrar movimiento" onClose={() => setModal(false)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Fecha"><input type="date" value={form.fecha} onChange={e => sf('fecha', e.target.value)} style={inp} /></Field>
          <Field label="Tipo"><select value={form.tipo} onChange={e => sf('tipo', e.target.value)} style={sel}><option>Salida</option><option>Ingreso</option></select></Field>
          <Field label="Descripción" full><input value={form.descripcion} onChange={e => sf('descripcion', e.target.value)} style={inp} placeholder="Ej. Mercado Éxito, Cuota vehicular…" /></Field>
          <Field label="Entidad"><select value={form.entidad_id || ''} onChange={e => sf('entidad_id', e.target.value || null)} style={sel}>{db.entidades.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          <Field label="Categoría"><select value={form.categoria_id || ''} onChange={e => { sf('categoria_id', e.target.value || null); sf('deuda_id', ''); sf('cuotaN', '') }} style={sel}>{db.categorias.filter(c => c.nombre !== 'Pago tarjeta crédito').map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          <Field label="Cuenta (de donde sale/entra)"><select value={form.cuenta_id || ''} onChange={e => sf('cuenta_id', e.target.value || null)} style={sel}>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          <Field label="Activo"><select value={form.activo_id || ''} onChange={e => sf('activo_id', e.target.value || null)} style={sel}><option value="">— Ninguno —</option>{db.activos.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          {!isCreditPay && <Field label="Monto (COP)" full><input type="number" inputMode="numeric" value={form.monto} onChange={e => sf('monto', e.target.value)} style={inp} /></Field>}
          {isCreditPay && <div style={{ gridColumn: '1/-1', background: '#f0fdf4', borderRadius: 12, padding: '12px 14px', border: '1px solid #bbf7d0' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#065f46', marginBottom: 10 }}><IcoText name="landmark">Pago de crédito — conciliación</IcoText></div>
            <Field label="Crédito"><select value={form.deuda_id} onChange={e => { sf('deuda_id', e.target.value); sf('cuotaN', '') }} style={sel}><option value="">— Selecciona —</option>{creditos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></Field>
            {rCred && rCred.am.filter(c => !c.pago).length > 0 && <div style={{ marginTop: 10 }}><Field label="Cuota a pagar"><select value={form.cuotaN} onChange={e => sf('cuotaN', e.target.value)} style={sel}><option value="">— Selecciona —</option>{rCred.am.filter(c => !c.pago).slice(0, 12).map(c => <option key={c.n} value={c.n}>Cuota {c.n} · {fmtDate(c.fecha)} · {fmtCOP(c.total)}</option>)}</select></Field></div>}
            {cuotaSel && <div style={{ marginTop: 12, background: '#fff', borderRadius: 10, padding: 12, border: '1px solid #d1fae5' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}><span style={{ color: '#6b7280' }}>Capital</span><b>{fmtCOP(cuotaSel.capital)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '2px solid #7c3aed', marginBottom: 8 }}><span style={{ color: '#6b7280' }}>Interés</span><b>{fmtCOP(cuotaSel.interes)}</b></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                <Field label="Cuota manejo"><input type="number" inputMode="numeric" value={form.manejo} onChange={e => sf('manejo', e.target.value)} style={inp} placeholder="0" /></Field>
                <Field label="Mora"><input type="number" inputMode="numeric" value={form.mora} onChange={e => sf('mora', e.target.value)} style={inp} placeholder="0" /></Field>
                <Field label="Otros"><input type="number" inputMode="numeric" value={form.otros} onChange={e => sf('otros', e.target.value)} style={inp} placeholder="0" /></Field>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #059669', paddingTop: 8 }}><span style={{ fontWeight: 800, fontSize: 14 }}>TOTAL A PAGAR</span><span style={{ fontWeight: 800, fontSize: 14, color: '#059669' }}>{fmtCOP(totalCred)}</span></div>
            </div>}
          </div>}
          <Field label="Vincular a rubro del presupuesto" full><select value={form.presupuesto_id || ''} onChange={e => sf('presupuesto_id', e.target.value || null)} style={sel}><option value="">— Sin vincular —</option>{db.presupuesto.filter(p => p.periodo === form.fecha.slice(0, 7) + '-01').map(p => <option key={p.id} value={p.id}>{p.concepto}</option>)}</select></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(false)} /><SaveBtn onClick={save} disabled={!canSave}>{isCreditPay ? 'Registrar pago' : 'Registrar'}</SaveBtn></div>
      </Modal>}
    </div>
  )
}
