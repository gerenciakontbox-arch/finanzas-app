// Etiquetas por espacio (nombres libres: "Mateo", "Familia", "Carro"…) para separar movimientos, rubros y programados
// por persona o por tema. Sin reparto de montos: un ítem con varias etiquetas cuenta completo en cada una.
import { useState } from 'react'
import { useData, useIndices } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Card, Icon, Aviso, inp, T } from '../lib/ui'

export const COLORES = ['#4B1D9E', '#138A5B', '#0F6E8C', '#9A5B00', '#B42318', '#6E6E73']

// Chip de una etiqueta: borde y texto del color; "activa" la rellena.
export function Chip({ e, activa = true, onClick, small, quitar }) {
  const c = e.color || T.morado
  return (
    <span onClick={onClick} data-etiqueta={e.nombre} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: small ? '2px 8px' : '5px 11px', borderRadius: 99, fontSize: small ? 10 : 12, fontWeight: 700, border: `1.5px solid ${c}`, background: activa ? c : '#fff', color: activa ? '#fff' : c, cursor: onClick ? 'pointer' : 'default', whiteSpace: 'nowrap', lineHeight: 1.3, fontFamily: 'inherit' }}>
      {e.nombre}{quitar && <span onClick={ev => { ev.stopPropagation(); quitar() }} style={{ opacity: 0.8, marginLeft: 2 }}>×</span>}
    </span>
  )
}

// Chips de solo lectura para una lista de ids (en listas de movimientos, rubros, programados).
export function ChipsDe({ ids, small = true }) {
  const ix = useIndices(); if (!ids?.length || !ix) return null
  const es = ids.map(id => ix.eti[id]).filter(Boolean); if (!es.length) return null
  return <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>{es.map(e => <Chip key={e.id} e={e} small={small} />)}</div>
}

// Selector múltiple para formularios: toca para marcar; "+ nueva" crea una etiqueta al vuelo.
export function EtiquetaPicker({ value = [], onChange, label = 'Etiquetas' }) {
  const { db, insertar } = useData()
  const [nueva, setNueva] = useState(null); const [msg, setMsg] = useState('')
  const toggle = id => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  const crear = async () => {
    const v = (nueva || '').trim(); if (!v) { setNueva(null); return }
    try { const e = await insertar('etiquetas', { nombre: v, color: COLORES[db.etiquetas.length % COLORES.length] }); onChange([...value, e.id]); setNueva(null); setMsg('') } catch (e) { setMsg(/unique|duplicate/i.test(e.message) ? 'Ya existe una etiqueta con ese nombre.' : e.message) }
  }
  return (
    <div style={{ gridColumn: '1/-1' }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: T.gris, marginBottom: 6 }}>{label}</label>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {db.etiquetas.map(e => <Chip key={e.id} e={e} activa={value.includes(e.id)} onClick={() => toggle(e.id)} />)}
        {nueva === null
          ? <button type="button" onClick={() => setNueva('')} style={{ background: 'none', border: `1.5px dashed ${T.divisor}`, borderRadius: 99, padding: '5px 11px', fontSize: 12, fontWeight: 700, color: T.gris, cursor: 'pointer', fontFamily: 'inherit' }}>+ nueva</button>
          : <input autoFocus value={nueva} onChange={e => setNueva(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); crear() } if (e.key === 'Escape') setNueva(null) }} onBlur={crear} placeholder="Nombre y Enter" style={{ ...inp, width: 150, padding: '5px 10px', fontSize: 12 }} />}
      </div>
      {msg && <div style={{ fontSize: 11, color: T.rojo, fontWeight: 700, marginTop: 4 }}>{msg}</div>}
    </div>
  )
}

/* ── Ajustes → Etiquetas: crear, renombrar, colorear, borrar ── */
export default function Etiquetas() {
  const { db, insertar, actualizar, borrar } = useData(); const { esPersonal, espacio } = useAuth()
  const [nuevo, setNuevo] = useState(''); const [color, setColor] = useState(COLORES[0]); const [msg, setMsg] = useState(''); const [edit, setEdit] = useState(null)
  const usos = id => db.movimientos.filter(m => (m.etiqueta_ids || []).includes(id)).length + db.presupuesto.filter(p => (p.etiqueta_ids || []).includes(id)).length + db.programado.filter(p => (p.etiqueta_ids || []).includes(id)).length
  const add = async () => { const v = nuevo.trim(); if (!v) return; try { await insertar('etiquetas', { nombre: v, color, orden: db.etiquetas.length }); setNuevo(''); setMsg('') } catch (e) { setMsg(/unique|duplicate/i.test(e.message) ? 'Ya existe.' : e.message) } }
  const eliminar = async e => { const n = usos(e.id); if (!window.confirm(`¿Eliminar la etiqueta "${e.nombre}"?${n ? ` Se retirará de ${n} registro${n === 1 ? '' : 's'} (los registros no se borran).` : ''}`)) return; try { await borrar('etiquetas', e.id); setMsg('') } catch (x) { setMsg(x.message) } }
  const renombrar = async e => { const v = (edit?.nombre || '').trim(); if (!v || v === e.nombre) { setEdit(null); return } try { await actualizar('etiquetas', e.id, { nombre: v }); setEdit(null); setMsg('') } catch (x) { setMsg(/unique|duplicate/i.test(x.message) ? 'Ya existe.' : x.message) } }
  return (
    <Card>
      <div style={{ fontSize: 12, color: T.gris, marginBottom: 12 }}>Etiquetas de {esPersonal ? 'tu espacio personal' : espacio.nombre}: sirven para separar gastos por persona ("Mateo", "Familia") o por tema ("Carro", "Viaje"). Un movimiento puede llevar varias; no se reparte el monto. Al mover un ítem a otro espacio, la etiqueta se crea allá con el mismo nombre.</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <input value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Nueva etiqueta…" style={{ ...inp, flex: 1 }} />
        <div style={{ display: 'flex', gap: 4 }}>{COLORES.map(c => <button key={c} onClick={() => setColor(c)} title={c} style={{ width: 22, height: 22, borderRadius: 99, background: c, border: color === c ? '3px solid #fff' : 'none', outline: color === c ? `1.5px solid ${c}` : 'none', cursor: 'pointer', padding: 0 }} />)}</div>
        <button onClick={add} aria-label="Agregar etiqueta" style={{ background: T.tinta, color: '#fff', border: 'none', borderRadius: 10, padding: '0 14px', height: 40, cursor: 'pointer' }}><Icon name="plus" size={16} /></button>
      </div>
      {db.etiquetas.length === 0 && <div style={{ fontSize: 12, color: T.grisClaro }}>Aún no hay etiquetas.</div>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {db.etiquetas.map(e => { const n = usos(e.id); return (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0', borderBottom: `1px solid ${T.divisor}` }}>
            {edit?.id === e.id
              ? <input autoFocus value={edit.nombre} onChange={ev => setEdit({ ...edit, nombre: ev.target.value })} onKeyDown={ev => { if (ev.key === 'Enter') renombrar(e); if (ev.key === 'Escape') setEdit(null) }} onBlur={() => renombrar(e)} style={{ ...inp, flex: 1, padding: '5px 10px', fontSize: 13 }} />
              : <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}><Chip e={e} /><span style={{ fontSize: 11, color: T.grisClaro }}>{n ? `${n} registro${n === 1 ? '' : 's'}` : 'sin uso'}</span></div>}
            <div style={{ display: 'flex', gap: 3 }}>{COLORES.map(c => <button key={c} onClick={() => actualizar('etiquetas', e.id, { color: c })} aria-label={`Color ${c} para ${e.nombre}`} style={{ width: 16, height: 16, borderRadius: 99, background: c, border: 'none', outline: e.color === c ? `2px solid ${T.tinta}` : 'none', outlineOffset: 1, cursor: 'pointer', padding: 0 }} />)}</div>
            <button onClick={() => setEdit({ id: e.id, nombre: e.nombre })} aria-label={`Renombrar ${e.nombre}`} style={{ background: 'none', border: 'none', color: T.morado, cursor: 'pointer', padding: 4 }}><Icon name="pencil" size={14} /></button>
            <button onClick={() => eliminar(e)} aria-label={`Eliminar etiqueta ${e.nombre}`} style={{ background: 'none', border: 'none', color: T.rojo, cursor: 'pointer', padding: 4 }}><Icon name="trash" size={14} /></button>
          </div>) })}
      </div>
      {msg && <div style={{ marginTop: 10 }}><Aviso tipo={/Ya existe/.test(msg) ? 'err' : 'warn'}>{msg}</Aviso></div>}
    </Card>
  )
}
