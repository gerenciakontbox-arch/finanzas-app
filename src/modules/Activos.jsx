import { useState } from 'react'
import { useData, useIndices } from '../lib/data'
import { Kpi, Card, Icon, IcoText, Modal, Field, inp, sel, SaveBtn, CancelBtn, SmallBtn, PrimaryBtn, useForm } from '../lib/ui'
import { fmtCOP, fmtDate, today, daysLeft, TIPOS_ACTIVO } from '../lib/util'
import { deudaTotal } from '../lib/finanzas'
import { parseMonto } from '../lib/csv'

const AICO = { Inmueble: 'home', Vehículo: 'car', Moto: 'bike', Equipo: 'laptop', Otro: 'package' }
const PICO = { Impuesto: 'receipt', Seguro: 'shield', Mantenimiento: 'wrench', 'Cuota crédito': 'card', Servicio: 'wifi', Suscripción: 'refresh', Otro: 'pin' }

export default function Activos() {
  const { db, insertar, actualizar, borrar } = useData(); const ix = useIndices()
  const [open, setOpen] = useState(null); const [modal, setModal] = useState(null)
  const emptyA = { nombre: '', tipo: 'Inmueble', entidad_id: db.entidades[0]?.id || null, identificador: '', valor_estimado: '', fecha_adquisicion: today(), notas: '' }
  const [form, sf, setForm] = useForm(emptyA)
  const totalP = db.activos.reduce((a, x) => a + +x.valor_estimado, 0); const deuda = deudaTotal(db)
  const save = async () => { if (!form.nombre) return; const row = { nombre: form.nombre, tipo: form.tipo, entidad_id: form.entidad_id || null, identificador: form.identificador, valor_estimado: parseMonto(form.valor_estimado) || 0, fecha_adquisicion: form.fecha_adquisicion || null, notas: form.notas }; modal === 'add' ? await insertar('activos', row) : await actualizar('activos', modal.id, row); setModal(null) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Kpi icon="landmark" value={fmtCOP(totalP)} label="Patrimonio bruto" color="#059669" /><Kpi icon="gem" value={fmtCOP(totalP - deuda.total)} label="Patrimonio neto" color="#7c3aed" /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ fontWeight: 700, fontSize: 14, color: '#374151' }}>Activos ({db.activos.length})</div><PrimaryBtn onClick={() => { setForm(emptyA); setModal('add') }} style={{ padding: '8px 14px', fontSize: 13 }}><Icon name="plus" size={13} />Nuevo</PrimaryBtn></div>
      {db.activos.map(a => {
        const isOpen = open === a.id
        const gastos = db.movimientos.filter(m => m.activo_id === a.id && m.tipo === 'Salida').sort((x, y) => y.fecha.localeCompare(x.fecha))
        const prog = db.programado.filter(p => p.activo_id === a.id && p.estado === 'Pendiente').sort((x, y) => x.vencimiento.localeCompare(y.vencimiento))
        const tc = db.tc_cargos.filter(c => c.activo_id === a.id); const deudas = db.deudas.filter(d => d.activo_id === a.id && d.estado === 'Activo')
        const totalGastos = gastos.reduce((s, m) => s + +m.monto, 0)
        return (
          <div key={a.id} style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
            <div onClick={() => setOpen(isOpen ? null : a.id)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: isOpen ? '#f0fdf4' : '#fff' }}>
              <div style={{ background: 'linear-gradient(135deg,#059669,#047857)', borderRadius: 12, padding: '10px 12px', color: '#fff', flexShrink: 0 }}><Icon name={AICO[a.tipo] || 'package'} size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</div><div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{ix.ent[a.entidad_id]?.nombre || '—'} · {a.tipo}{a.identificador ? ` · ${a.identificador}` : ''}</div></div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontWeight: 800, fontSize: 14, color: '#059669' }}>{fmtCOP(a.valor_estimado)}</div><div style={{ color: '#9ca3af', marginTop: 4 }}><Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} /></div></div>
            </div>
            {isOpen && <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                {[['Gastos históricos', fmtCOP(totalGastos)], ['Obligaciones', prog.length], ['Créditos', deudas.length]].map(([l, v]) => <div key={l} style={{ background: '#f9fafb', borderRadius: 10, padding: '8px 10px' }}><div style={{ fontSize: 9, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div><div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div></div>)}
              </div>
              {prog.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontWeight: 700, fontSize: 12, color: '#374151', marginBottom: 8 }}><IcoText name="calendar">Obligaciones programadas</IcoText></div>{prog.map(p => { const d = daysLeft(p.vencimiento); return <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}><div><div style={{ fontSize: 12, fontWeight: 600 }}><IcoText name={PICO[p.tipo] || 'pin'} size={12} gap={5}>{p.nombre}</IcoText></div><div style={{ fontSize: 10, color: '#6b7280' }}>{p.periodicidad} · {fmtDate(p.vencimiento)}</div></div><div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, fontWeight: 700 }}>{fmtCOP(p.monto)}</div><span style={{ background: d < 0 ? '#fee2e2' : d <= 15 ? '#fef3c7' : '#f0fdf4', color: d < 0 ? '#991b1b' : d <= 15 ? '#92400e' : '#065f46', padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 600 }}>{d < 0 ? 'Vencido' : d === 0 ? 'Hoy' : `${d}d`}</span></div></div> })}</div>}
              {tc.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontWeight: 700, fontSize: 12, color: '#374151', marginBottom: 8 }}><IcoText name="card">Compras con tarjeta</IcoText></div>{tc.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}><span>{c.descripcion} <span style={{ fontSize: 10, color: '#9ca3af' }}>{fmtDate(c.fecha)} · {ix.cta[c.cuenta_id]?.nombre}</span></span><b style={{ color: '#7c3aed' }}>{fmtCOP(c.monto)}</b></div>)}</div>}
              {gastos.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontWeight: 700, fontSize: 12, color: '#374151', marginBottom: 8 }}><IcoText name="trending-down">Últimos gastos</IcoText></div>{gastos.slice(0, 5).map(m => <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f3f4f6', fontSize: 12 }}><span>{m.descripcion} <span style={{ fontSize: 10, color: '#9ca3af' }}>{fmtDate(m.fecha)}</span></span><b style={{ color: '#dc2626' }}>-{fmtCOP(m.monto)}</b></div>)}</div>}
              {a.notas && <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>{a.notas}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><SmallBtn onClick={() => { setForm({ ...a, valor_estimado: String(a.valor_estimado) }); setModal(a) }} bg="#ede9fe" color="#7c3aed"><Icon name="pencil" size={12} />Editar</SmallBtn><SmallBtn onClick={async () => { if (window.confirm('¿Eliminar activo?')) await borrar('activos', a.id) }} bg="#fee2e2" color="#dc2626"><Icon name="trash" size={12} />Eliminar</SmallBtn></div>
            </div>}
          </div>)
      })}
      {modal && <Modal title={modal === 'add' ? 'Nuevo activo' : 'Editar activo'} onClose={() => setModal(null)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Nombre" full><input value={form.nombre} onChange={e => sf('nombre', e.target.value)} style={inp} /></Field>
          <Field label="Tipo"><select value={form.tipo} onChange={e => sf('tipo', e.target.value)} style={sel}>{TIPOS_ACTIVO.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Entidad propietaria"><select value={form.entidad_id || ''} onChange={e => sf('entidad_id', e.target.value || null)} style={sel}>{db.entidades.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          <Field label="Identificador"><input value={form.identificador || ''} onChange={e => sf('identificador', e.target.value)} style={inp} placeholder="Placa, matrícula…" /></Field>
          <Field label="Valor estimado (COP)"><input type="number" inputMode="numeric" value={form.valor_estimado} onChange={e => sf('valor_estimado', e.target.value)} style={inp} /></Field>
          <Field label="Fecha adquisición"><input type="date" value={form.fecha_adquisicion || ''} onChange={e => sf('fecha_adquisicion', e.target.value)} style={inp} /></Field>
          <Field label="Notas" full><input value={form.notas || ''} onChange={e => sf('notas', e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={save}>Guardar</SaveBtn></div>
      </Modal>}
    </div>
  )
}
