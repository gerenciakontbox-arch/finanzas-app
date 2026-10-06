import { useState, useRef } from 'react'
import { useData } from '../lib/data'
import { useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Card, Icon, IcoText, Modal, Field, inp, sel, PBtn, SaveBtn, CancelBtn, SmallBtn, Aviso, useForm } from '../lib/ui'
import { fmtCOP, fmtDate, today, addMonths, TIPOS_CTA, TC, GRUPOS, primeroDelMes } from '../lib/util'
import { toCSV, descargar } from '../lib/csv'

export default function Config() {
  const [sec, setSec] = useState('hogar')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ background: 'linear-gradient(135deg,#374151,#1f2937)', borderRadius: 16, padding: '18px 20px', color: '#fff' }}><div style={{ fontSize: 17, fontWeight: 800 }}><IcoText name="sliders" size={18} gap={8}>Configuración</IcoText></div></div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <PBtn active={sec === 'hogar'} onClick={() => setSec('hogar')}><IcoText name="home" size={13}>Hogar</IcoText></PBtn>
        <PBtn active={sec === 'entidades'} onClick={() => setSec('entidades')}><IcoText name="user" size={13}>Entidades</IcoText></PBtn>
        <PBtn active={sec === 'cuentas'} onClick={() => setSec('cuentas')}><IcoText name="landmark" size={13}>Cuentas</IcoText></PBtn>
        <PBtn active={sec === 'categorias'} onClick={() => setSec('categorias')}><IcoText name="tag" size={13}>Categorías</IcoText></PBtn>
        <PBtn active={sec === 'datos'} onClick={() => setSec('datos')}><IcoText name="file" size={13}>Datos</IcoText></PBtn>
      </div>
      {sec === 'hogar' && <Hogar />}{sec === 'entidades' && <Entidades />}{sec === 'cuentas' && <Cuentas />}{sec === 'categorias' && <Categorias />}{sec === 'datos' && <Datos />}
    </div>
  )
}

function Hogar() {
  const { hogar, hogares, miembros, miembroActual, esDueño, regenerarCodigo, cambiarHogar, salir, user, recargar } = useAuth()
  const { actualizar } = useData()
  const [nombre, setNombre] = useState(hogar.nombre); const [msg, setMsg] = useState('')
  const copiar = async () => { try { await navigator.clipboard.writeText(hogar.codigo_invitacion); setMsg('Código copiado.') } catch { setMsg(hogar.codigo_invitacion) } }
  const compartir = async () => { const txt = `Únete a "${hogar.nombre}" en Finanzas Integradas. Entra a ${window.location.origin}, inicia sesión con tu correo y usa el código ${hogar.codigo_invitacion}`; if (navigator.share) { try { await navigator.share({ text: txt }) } catch { } } else copiar() }
  const expulsar = async m => { if (!window.confirm(`¿Quitar a ${m.nombre} del hogar? Lo que registró se conserva.`)) return; await supabase.from('miembros').delete().eq('hogar_id', hogar.id).eq('user_id', m.user_id); await recargar() }
  const renombrar = async () => { if (!nombre.trim()) return; await supabase.from('hogares').update({ nombre: nombre.trim() }).eq('id', hogar.id); await recargar(); setMsg('Nombre actualizado.') }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10 }}>Este hogar</div>
        <div style={{ display: 'flex', gap: 8 }}><input value={nombre} onChange={e => setNombre(e.target.value)} disabled={!esDueño} style={{ ...inp, flex: 1 }} />{esDueño && <SmallBtn onClick={renombrar} bg="#ede9fe" color="#7c3aed">Guardar</SmallBtn>}</div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Sesión: {user.email} · {esDueño ? 'dueño' : 'miembro'} · <button onClick={salir} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 11, padding: 0 }}>cerrar sesión</button></div>
        {hogares.length > 1 && <div style={{ marginTop: 10 }}><Field label="Cambiar de hogar"><select value={hogar.id} onChange={e => cambiarHogar(e.target.value)} style={sel}>{hogares.map(h => <option key={h.id} value={h.id}>{h.nombre}</option>)}</select></Field></div>}
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 6 }}>Invitar a tu familia</div>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>Quien entre con este código verá y podrá registrar todo lo del hogar. Cada registro guarda quién lo hizo.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f5f3ff', borderRadius: 12, padding: '12px 14px' }}><div style={{ flex: 1, fontFamily: 'monospace', fontSize: 22, fontWeight: 800, letterSpacing: '0.2em', color: '#4c1d95' }}>{hogar.codigo_invitacion}</div><SmallBtn onClick={copiar} bg="#fff" color="#7c3aed">Copiar</SmallBtn><SmallBtn onClick={compartir} bg="#7c3aed" color="#fff">Compartir</SmallBtn></div>
        {esDueño && <button onClick={async () => { if (window.confirm('El código actual dejará de funcionar. ¿Generar uno nuevo?')) { await regenerarCodigo(); setMsg('Código regenerado.') } }} style={{ marginTop: 8, background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer', padding: 0 }}>Regenerar código</button>}
        {msg && <div style={{ marginTop: 8 }}><Aviso tipo="ok">{msg}</Aviso></div>}
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10 }}>Miembros ({miembros.length})</div>
        {miembros.map(m => <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#6d28d9)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>{m.nombre.slice(0, 2).toUpperCase()}</div><div><div style={{ fontSize: 13, fontWeight: 600 }}>{m.nombre}{m.user_id === user.id ? ' (tú)' : ''}</div><div style={{ fontSize: 10, color: '#6b7280' }}>{m.rol} · desde {fmtDate(m.unido_en?.slice(0, 10))}</div></div></div>
          {esDueño && m.user_id !== user.id && <SmallBtn onClick={() => expulsar(m)} bg="#fee2e2" color="#dc2626">Quitar</SmallBtn>}
        </div>)}
      </Card>
    </div>
  )
}

function Entidades() {
  const { db, insertar, actualizar, borrar } = useData()
  const [nuevo, setNuevo] = useState(''); const [tipo, setTipo] = useState('persona')
  const add = async () => { const v = nuevo.trim(); if (!v) return; try { await insertar('entidades', { nombre: v, tipo }); setNuevo('') } catch (e) { alert(e.message.includes('unique') ? 'Ya existe una entidad con ese nombre.' : e.message) } }
  return (
    <Card>
      <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>Quién consume o recibe cada movimiento. Marca "empresa" para detectar cruces hogar/empresa.</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}><input value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Nueva entidad…" style={{ ...inp, flex: 1 }} /><select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...sel, width: 110 }}><option value="persona">Persona</option><option value="empresa">Empresa</option><option value="grupo">Grupo</option></select><button onClick={add} style={{ background: '#374151', color: '#fff', border: 'none', borderRadius: 10, padding: '0 14px', cursor: 'pointer' }}><Icon name="plus" size={16} /></button></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>{db.entidades.map(e => <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '6px 10px' }}><div style={{ width: 26, height: 26, borderRadius: '50%', background: e.tipo === 'empresa' ? '#0891b2' : e.tipo === 'grupo' ? '#059669' : '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 10 }}>{e.nombre.slice(0, 2).toUpperCase()}</div><span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{e.nombre}</span><select value={e.tipo} onChange={ev => actualizar('entidades', e.id, { tipo: ev.target.value })} style={{ fontSize: 10, border: 'none', background: 'transparent', color: '#9ca3af' }}><option value="persona">persona</option><option value="empresa">empresa</option><option value="grupo">grupo</option></select><button onClick={async () => { if (window.confirm(`¿Eliminar "${e.nombre}"? Los registros que la usan quedarán sin entidad.`)) await borrar('entidades', e.id) }} style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>×</button></div>)}</div>
    </Card>
  )
}

function Cuentas() {
  const { db, insertar, actualizar, borrar } = useData()
  const empty = { nombre: '', tipo: 'Bancaria', entidad_id: db.entidades[0]?.id || null, cupo: '', tasa_mensual: '', banco: '', ultimos4: '', dia_corte: '' }
  const [form, sf, setForm] = useForm(empty); const [edit, setEdit] = useState(null)
  const build = f => ({ nombre: f.nombre.trim(), tipo: f.tipo, entidad_id: f.entidad_id || null, cupo: f.tipo === TC ? parseFloat(f.cupo) || null : null, tasa_mensual: f.tipo === TC ? parseFloat(f.tasa_mensual) || 0 : null, banco: f.tipo === TC ? f.banco || null : null, ultimos4: f.tipo === TC && /^\d{4}$/.test(f.ultimos4) ? f.ultimos4 : null, dia_corte: f.tipo === TC ? parseInt(f.dia_corte) || null : null })
  const add = async () => { if (!form.nombre.trim()) return; try { await insertar('cuentas', build(form)); setForm(empty) } catch (e) { alert(e.message) } }
  const save = async () => { try { await actualizar('cuentas', edit.id, build(edit)); setEdit(null) } catch (e) { alert(e.message) } }
  const TCF = ({ v, set }) => (<><Field label="Cupo (COP)"><input type="number" inputMode="numeric" value={v.cupo ?? ''} onChange={e => set('cupo', e.target.value)} style={inp} /></Field><Field label="Tasa mensual (%)"><input type="number" inputMode="decimal" step="0.01" value={v.tasa_mensual ?? ''} onChange={e => set('tasa_mensual', e.target.value)} style={inp} /></Field><Field label="Banco"><input value={v.banco || ''} onChange={e => set('banco', e.target.value)} style={inp} /></Field><Field label="Últimos 4"><input value={v.ultimos4 || ''} onChange={e => set('ultimos4', e.target.value)} maxLength={4} style={inp} /></Field><Field label="Día de corte"><input type="number" min={1} max={31} value={v.dia_corte ?? ''} onChange={e => set('dia_corte', e.target.value)} style={inp} /></Field></>)
  return (
    <Card>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10 }}>Agregar cuenta / método de pago</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <Field label="Nombre" full><input value={form.nombre} onChange={e => sf('nombre', e.target.value)} placeholder="Ej. Bancolombia Andrés, Visa Bancolombia" style={inp} /></Field>
        <Field label="Tipo"><select value={form.tipo} onChange={e => sf('tipo', e.target.value)} style={sel}>{TIPOS_CTA.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Entidad dueña"><select value={form.entidad_id || ''} onChange={e => sf('entidad_id', e.target.value || null)} style={sel}>{db.entidades.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        {form.tipo === TC && <TCF v={form} set={sf} />}
      </div>
      {form.tipo === TC && <div style={{ marginBottom: 10 }}><Aviso tipo="info">La tarjeta aparecerá en Deudas con su panel de compras y pago de factura.</Aviso></div>}
      <button onClick={add} style={{ width: '100%', background: '#374151', color: '#fff', border: 'none', borderRadius: 10, padding: 10, fontWeight: 700, cursor: 'pointer', fontSize: 13 }}>Agregar cuenta</button>
      <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 14, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {db.cuentas.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 10, background: '#f9fafb', border: '1px solid #f0f0f0' }}>
          <div><div style={{ fontWeight: 600, fontSize: 13 }}>{c.nombre} {c.tipo === TC && <span style={{ background: '#faf5ff', color: '#7c3aed', fontSize: 10, padding: '1px 6px', borderRadius: 6, fontWeight: 700, border: '1px solid #e9d5ff' }}>TC</span>}</div><div style={{ fontSize: 10, color: '#6b7280' }}>{c.tipo} · {db.entidades.find(e => e.id === c.entidad_id)?.nombre || '—'}{c.tipo === TC ? ` · cupo ${fmtCOP(c.cupo)} · ${c.tasa_mensual}% · corte ${c.dia_corte || '—'}` : ''}</div></div>
          <div style={{ display: 'flex', gap: 6 }}><SmallBtn onClick={() => setEdit({ ...c, cupo: c.cupo ?? '', tasa_mensual: c.tasa_mensual ?? '', dia_corte: c.dia_corte ?? '' })} bg="#ede9fe" color="#7c3aed"><Icon name="pencil" size={13} /></SmallBtn><SmallBtn onClick={async () => { if (window.confirm('¿Eliminar cuenta?' + (c.tipo === TC ? ' Se borran también sus compras.' : ''))) await borrar('cuentas', c.id) }} bg="#fee2e2" color="#dc2626"><Icon name="trash" size={13} /></SmallBtn></div>
        </div>)}
      </div>
      {edit && <Modal title="Editar cuenta" onClose={() => setEdit(null)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Nombre" full><input value={edit.nombre} onChange={e => setEdit(p => ({ ...p, nombre: e.target.value }))} style={inp} /></Field>
          <Field label="Tipo"><select value={edit.tipo} onChange={e => setEdit(p => ({ ...p, tipo: e.target.value }))} style={sel}>{TIPOS_CTA.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Entidad dueña"><select value={edit.entidad_id || ''} onChange={e => setEdit(p => ({ ...p, entidad_id: e.target.value || null }))} style={sel}>{db.entidades.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          {edit.tipo === TC && <TCF v={edit} set={(k, v) => setEdit(p => ({ ...p, [k]: v }))} />}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setEdit(null)} /><SaveBtn onClick={save}>Guardar</SaveBtn></div>
      </Modal>}
    </Card>
  )
}

function Categorias() {
  const { db, insertar, actualizar, borrar } = useData()
  const [nuevo, setNuevo] = useState(''); const [grupo, setGrupo] = useState('Variable')
  const add = async () => { const v = nuevo.trim(); if (!v) return; try { await insertar('categorias', { nombre: v, grupo }); setNuevo('') } catch (e) { alert(e.message.includes('unique') ? 'Ya existe.' : e.message) } }
  const GCLS = { Fijo: '#dbeafe|#1d4ed8', Variable: '#f3e8ff|#7e22ce', Provisión: '#fef3c7|#92400e', 'Amortización crédito': '#fee2e2|#991b1b', 'Depreciación activo': '#f1f5f9|#475569' }
  return (
    <Card>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}><input value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Nueva categoría…" style={{ ...inp, flex: 1 }} /><select value={grupo} onChange={e => setGrupo(e.target.value)} style={{ ...sel, width: 120 }}>{GRUPOS.map(g => <option key={g}>{g}</option>)}</select><button onClick={add} style={{ background: '#374151', color: '#fff', border: 'none', borderRadius: 10, padding: '0 14px', cursor: 'pointer' }}><Icon name="plus" size={16} /></button></div>
      {GRUPOS.map(g => { const cs = db.categorias.filter(c => c.grupo === g); if (!cs.length) return null; const [bg, cl] = GCLS[g].split('|'); return <div key={g} style={{ marginBottom: 10 }}><div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: cl, marginBottom: 6 }}>{g}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{cs.map(c => <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: bg, borderRadius: 9, padding: '5px 10px' }}><span style={{ fontSize: 12, fontWeight: 600, color: cl }}>{c.nombre}</span><select value={c.grupo} onChange={e => actualizar('categorias', c.id, { grupo: e.target.value })} style={{ fontSize: 9, border: 'none', background: 'transparent', color: cl, width: 14 }}>{GRUPOS.map(x => <option key={x}>{x}</option>)}</select><button onClick={async () => { if (window.confirm(`¿Eliminar "${c.nombre}"?`)) await borrar('categorias', c.id) }} style={{ background: 'none', border: 'none', color: cl, fontSize: 15, cursor: 'pointer', lineHeight: 1, opacity: 0.6 }}>×</button></div>)}</div></div> })}
    </Card>
  )
}

/* ── Datos: exportar, importar respaldo local (versión anterior) ── */
function Datos() {
  const { db, insertar, insertarVarios } = useData(); const { hogar } = useAuth()
  const [msg, setMsg] = useState(''); const [busy, setBusy] = useState(false); const ref = useRef()
  const exportar = () => { const data = { app: 'finanzas-integradas', version: 2, hogar: hogar.nombre, exportadoEn: new Date().toISOString(), tablas: db }; descargar(`respaldo-${hogar.nombre.replace(/\s+/g, '-')}-${today()}.json`, JSON.stringify(data, null, 2), 'application/json'); setMsg('Respaldo descargado.') }
  const exportarCSV = () => {
    const nom = (t, id) => db[t].find(x => x.id === id)?.nombre || ''
    descargar(`movimientos-${today()}.csv`, toCSV([['fecha', 'tipo', 'descripcion', 'entidad', 'categoria', 'cuenta', 'monto', 'origen'], ...db.movimientos.map(m => [fmtDate(m.fecha), m.tipo, m.descripcion, nom('entidades', m.entidad_id), nom('categorias', m.categoria_id), nom('cuentas', m.cuenta_id), m.monto, m.origen])]))
    setTimeout(() => descargar(`presupuesto-${today()}.csv`, toCSV([['periodo', 'concepto', 'entidad', 'categoria', 'monto', 'fecha', 'estado', 'cuenta', 'notas'], ...db.presupuesto.map(p => [fmtDate(p.periodo), p.concepto, nom('entidades', p.entidad_id), nom('categorias', p.categoria_id), p.monto, fmtDate(p.fecha_tentativa), p.estado, nom('cuentas', p.cuenta_id), p.notas || ''])])), 400)
    setMsg('Descargados 2 CSV.')
  }
  // Importa el respaldo JSON de la versión anterior (localStorage) o datos aún en este navegador
  const importarLegacy = async data => {
    const T = data.tablas || data
    const n = (T.presupuesto || []).length + (T.movimientos || []).length + (T.deudas || []).length
    if (!window.confirm(`Se importarán ${n} registros al hogar "${hogar.nombre}". Las entidades, cuentas y categorías que no existan se crearán. ¿Continuar?`)) return
    setBusy(true)
    try {
      const mapE = {}, mapC = {}, mapK = {}, mapA = {}, mapP = {}, mapD = {}, mapTC = {}
      for (const e of db.entidades) mapE[e.nombre] = e.id; for (const c of db.categorias) mapC[c.nombre] = c.id; for (const k of db.cuentas) mapK[k.nombre] = k.id
      const ent = async nm => { if (!nm) return null; if (!mapE[nm]) mapE[nm] = (await insertar('entidades', { nombre: nm, tipo: nm === 'Familia' ? 'grupo' : nm === 'Kontbox' ? 'empresa' : 'persona' })).id; return mapE[nm] }
      const cat = async nm => { if (!nm) return null; if (!mapC[nm]) mapC[nm] = (await insertar('categorias', { nombre: nm, grupo: 'Variable' })).id; return mapC[nm] }
      for (const nm of T.entidades || []) await ent(nm)
      for (const nm of T.categorias || []) await cat(nm)
      for (const k of T.cuentas || []) { if (!mapK[k.nombre]) mapK[k.nombre] = (await insertar('cuentas', { nombre: k.nombre, tipo: k.tipo || 'Bancaria', entidad_id: await ent(k.entidad), cupo: k.cupo || null, tasa_mensual: k.tasaMensual ?? null, banco: k.banco || null, ultimos4: /^\d{4}$/.test(k.ultimos4 || '') ? k.ultimos4 : null, dia_corte: k.fechaCorte || null })).id; if (k.tipo === TC) mapTC[k.id] = mapK[k.nombre] }
      for (const a of T.activos || []) mapA[a.id] = (await insertar('activos', { nombre: a.nombre, tipo: a.tipo, entidad_id: await ent(a.entidad), identificador: a.identificador, valor_estimado: a.valorEstimado || 0, fecha_adquisicion: a.fechaAdquisicion || null, notas: a.notas })).id
      for (const p of T.presupuesto || []) mapP[p.id] = (await insertar('presupuesto', { periodo: (p.fecha || today()).slice(0, 7) + '-01', concepto: p.concepto, entidad_id: await ent(p.entidad), categoria_id: await cat(p.cat), cuenta_id: mapK[p.cuenta] || null, monto: p.monto, fecha_tentativa: p.fecha || null, estado: p.estado || 'Planificado', notas: p.notas })).id
      for (const d of T.deudas || []) {
        if (d.tipo === TC && d.cargos) { const ctaId = mapTC[d.cuentaId] || mapK[d.nombre]; if (!ctaId) continue; for (const c of d.cargos) { const r = await insertar('tc_cargos', { cuenta_id: ctaId, fecha: c.fecha, descripcion: c.desc, monto: c.monto, cuotas: c.cuotas, tasa_mensual: c.tasa || 0, categoria_id: await cat(c.cat), entidad_id: await ent(c.entidad), activo_id: mapA[c.activoId] || null, primera_cuota: c.primeraCuota || addMonths(c.fecha, 1) }); mapD['c' + c.id] = { cargo_id: r.id } } }
        else if (d.tipo !== TC) { const r = await insertar('deudas', { nombre: d.nombre, tipo: d.tipo, entidad_id: await ent(d.entidad), cuenta_pago_id: mapK[d.cuenta] || null, capital_inicial: d.capitalInicial, tasa_mensual: d.tasaMensual || 0, total_cuotas: d.totalCuotas, fecha_primera_cuota: d.fechaInicio, estado: d.estado === 'Cancelado' ? 'Cancelado' : 'Activo', notas: d.notas }); mapD[String(d.id)] = { deuda_id: r.id } }
      }
      const cps = Object.entries(T.cuotasPagadas || {}).map(([k, v]) => { const i = k.lastIndexOf('-'); const ref = mapD[k.slice(0, i)]; return ref ? { ...ref, numero: +k.slice(i + 1), fecha_pago: v.fechaPago || today(), monto_pagado: v.montoPagado ?? null } : null }).filter(Boolean)
      if (cps.length) await insertarVarios('cuotas_pagadas', cps)
      for (const p of T.programado || []) await insertar('programado', { flujo: 'salida', tipo: TIPOS_OK(p.tipo), nombre: p.nombre, entidad_id: await ent(p.entidad), activo_id: mapA[p.activoId] || null, cuenta_id: mapK[p.cuenta] || null, monto: p.monto, periodicidad: p.periodicidad || 'Mensual', vencimiento: p.proximoVenc, estado: p.estado === 'Activo' ? 'Pendiente' : 'Omitido', notas: p.notas })
      const movs = (T.movimientos || []).map(m => ({ fecha: m.fecha, tipo: m.tipo, descripcion: m.desc, monto: m.monto, entidad_id: mapE[m.entidad] || null, categoria_id: mapC[m.cat] || null, cuenta_id: mapK[m.cuenta] || null, activo_id: mapA[m.activoId] || null, presupuesto_id: mapP[m.presupuestoId] || null, deuda_id: mapD[String(m.creditoPagoId)]?.deuda_id || null, tc_cuenta_id: m.tcPagoId ? (mapTC[m.tcPagoId] || null) : null, origen: 'importacion', desglose: m.desgloseCapital != null ? { capital: m.desgloseCapital, interes: m.desgloseInteres, cuota_manejo: m.desgloseCuotaManejo || 0, mora: m.desgloseMora || 0, otros: m.desgloseOtros || 0, diferencia: m.diferenciaConciliacion || 0 } : {} }))
      if (movs.length) await insertarVarios('movimientos', movs)
      setMsg(`Importación completa: ${movs.length} movimientos, ${(T.presupuesto || []).length} rubros, ${(T.deudas || []).length} deudas.`)
    } catch (e) { setMsg('Error: ' + (e.message || e)) } finally { setBusy(false) }
  }
  const TIPOS_OK = t => ['Impuesto', 'Seguro', 'Mantenimiento', 'Cuota crédito', 'Servicio', 'Suscripción'].includes(t) ? t : 'Otro'
  const hayLocal = typeof localStorage !== 'undefined' && localStorage.getItem('fin_m2')
  const importarLocal = () => { const T = {}; const K = { fin_p2: 'presupuesto', fin_m2: 'movimientos', fin_d1: 'deudas', fin_cp1: 'cuotasPagadas', fin_a1: 'activos', fin_pg1: 'programado', fin_ent1: 'entidades', fin_cta1: 'cuentas', fin_cat1: 'categorias' }; Object.entries(K).forEach(([k, n]) => { try { T[n] = JSON.parse(localStorage.getItem(k)) } catch { } }); importarLegacy({ tablas: T }) }
  const leerJSON = f => { const fr = new FileReader(); fr.onload = () => { try { importarLegacy(JSON.parse(fr.result)) } catch (e) { setMsg('Archivo inválido: ' + e.message) } }; fr.readAsText(f) }
  const stats = ['presupuesto', 'movimientos', 'deudas', 'tc_cargos', 'programado', 'activos'].map(t => [t, db[t].length])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 10 }}>Datos del hogar</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>{stats.map(([t, n]) => <div key={t} style={{ background: '#f9fafb', borderRadius: 10, padding: '8px 10px' }}><div style={{ fontWeight: 800, fontSize: 15 }}>{n}</div><div style={{ fontSize: 10, color: '#6b7280' }}>{t.replace('_', ' ')}</div></div>)}</div>
        <button onClick={exportar} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 8 }}><Icon name="download" size={16} />Descargar respaldo (JSON)</button>
        <button onClick={exportarCSV} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 11, background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}><Icon name="file" size={16} />Exportar movimientos y presupuesto (CSV)</button>
        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>Tus datos ya viven en la nube y se comparten entre tus dispositivos y los miembros del hogar. El respaldo es opcional.</div>
      </Card>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#374151', marginBottom: 6 }}>Traer datos de la versión anterior</div>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 12, lineHeight: 1.5 }}>Si usaste la app antes (datos en el navegador) o tienes un respaldo JSON, impórtalo aquí. Se agrega a lo que ya hay; no reemplaza.</div>
        {hayLocal && <button onClick={importarLocal} disabled={busy} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 11, background: '#f0fdf4', color: '#065f46', border: '1px solid #bbf7d0', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600, marginBottom: 8 }}><Icon name="upload" size={16} />Importar datos guardados en este navegador</button>}
        <button onClick={() => ref.current.click()} disabled={busy} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 11, background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}><Icon name="upload" size={16} />{busy ? 'Importando…' : 'Elegir respaldo JSON…'}</button>
        <input ref={ref} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) leerJSON(f); e.target.value = '' }} />
      </Card>
      {msg && <Aviso tipo={msg.startsWith('Error') ? 'err' : 'ok'}>{msg}</Aviso>}
    </div>
  )
}
