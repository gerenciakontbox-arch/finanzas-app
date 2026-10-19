import { useState, useRef } from 'react'
import { useData, useIndices } from '../lib/data'
import { Kpi, Card, Icon, IcoText, Modal, Field, inp, sel, SaveBtn, CancelBtn, SmallBtn, PrimaryBtn, Aviso, useForm } from '../lib/ui'
import { fmtCOP, fmtDate, today, daysLeft, TIPOS_ACTIVO } from '../lib/util'
import { deudaTotal } from '../lib/finanzas'
import { parseCSV, parseMonto, parseFecha, matchOpt, toCSV, descargar, leerArchivoTexto, norm } from '../lib/csv'

const AICO = { Inmueble: 'home', Vehículo: 'car', Moto: 'bike', Equipo: 'laptop', Otro: 'package' }
const PICO = { Impuesto: 'receipt', Seguro: 'shield', Mantenimiento: 'wrench', 'Cuota crédito': 'card', Servicio: 'wifi', Suscripción: 'refresh', Otro: 'pin' }
const ORDENES = [['nombre', 'Nombre (A–Z)'], ['entidad', 'Entidad'], ['valor', 'Valor'], ['fecha', 'Fecha de compra'], ['tipo', 'Tipo']]
const ordenar = (list, ix, clave, desc) => {
  const k = {
    nombre: a => (a.nombre || '').toLocaleLowerCase('es'), tipo: a => (a.tipo || '').toLocaleLowerCase('es'),
    entidad: a => ((ix.ent[a.entidad_id]?.nombre || '') + '|' + (a.nombre || '')).toLocaleLowerCase('es'),
    valor: a => +a.valor_estimado || 0, fecha: a => a.fecha_adquisicion || '',
  }[clave]
  const arr = [...list].sort((x, y) => { const a = k(x), b = k(y); return typeof a === 'number' ? a - b : String(a).localeCompare(String(b), 'es') })
  return desc ? arr.reverse() : arr
}

export default function Activos() {
  const { db, insertar, actualizar, borrar } = useData(); const ix = useIndices()
  const [open, setOpen] = useState(null); const [modal, setModal] = useState(null); const [importar, setImportar] = useState(false)
  const [orden, setOrden] = useState('nombre'); const [desc, setDesc] = useState(false)
  const emptyA = { nombre: '', tipo: 'Inmueble', entidad_id: db.entidades[0]?.id || null, identificador: '', valor_estimado: '', fecha_adquisicion: today(), notas: '' }
  const [form, sf, setForm] = useForm(emptyA)
  const totalP = db.activos.reduce((a, x) => a + +x.valor_estimado, 0); const deuda = deudaTotal(db)
  const save = async () => { if (!form.nombre) return; const row = { nombre: form.nombre, tipo: form.tipo, entidad_id: form.entidad_id || null, identificador: form.identificador, valor_estimado: parseMonto(form.valor_estimado) || 0, fecha_adquisicion: form.fecha_adquisicion || null, notas: form.notas }; modal === 'add' ? await insertar('activos', row) : await actualizar('activos', modal.id, row); setModal(null) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Kpi icon="landmark" value={fmtCOP(totalP)} label="Patrimonio bruto" color="#059669" /><Kpi icon="gem" value={fmtCOP(totalP - deuda.total)} label="Patrimonio neto" color="#7c3aed" /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#374151', flexShrink: 0 }}>Activos ({db.activos.length})</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
          <select aria-label="Ordenar por" value={orden} onChange={e => setOrden(e.target.value)} style={{ ...sel, padding: '7px 6px', fontSize: 12, width: 'auto', maxWidth: 130, minWidth: 0 }}>{ORDENES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button onClick={() => setDesc(d => !d)} title={desc ? 'Descendente' : 'Ascendente'} style={{ background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: 10, padding: '7px 9px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name={desc ? 'chevron-down' : 'chevron-up'} size={16} /></button>
          <button onClick={() => setImportar(true)} title="Importar CSV" style={{ background: '#fff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 10, padding: '7px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="upload" size={16} /></button>
          <PrimaryBtn onClick={() => { setForm(emptyA); setModal('add') }} title="Nuevo activo" style={{ padding: '8px 10px' }}><Icon name="plus" size={16} sw={2.2} /></PrimaryBtn>
        </div>
      </div>
      {db.activos.length === 0 && <Card style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 30 }}>Registra tus activos: inmuebles, vehículos, equipos. Puedes cargarlos desde un CSV con el botón de subir.</Card>}
      {ordenar(db.activos, ix, orden, desc).map(a => {
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
      {importar && <ImportarActivos onClose={() => setImportar(false)} />}
    </div>
  )
}

const ACSV_COLS = ['nombre', 'tipo', 'entidad', 'valor', 'fecha_compra', 'identificador', 'notas']

function ImportarActivos({ onClose }) {
  const { db, insertar, insertarVarios } = useData()
  const [parsed, setParsed] = useState(null); const [err, setErr] = useState(''); const [crear, setCrear] = useState(true); const fileRef = useRef()
  const ent0 = db.entidades[0]?.nombre || 'Familia'
  const plantilla = () => descargar('plantilla-activos.csv', toCSV([ACSV_COLS, ['Apartamento Ciudad Jardín', 'Inmueble', ent0, '380.000.000', '15/06/2019', 'Matrícula 370-123456', ''], ['Mazda 3', 'Vehículo', ent0, '62.000.000', '20/01/2022', 'ABC123', 'Comprado usado'], ['MacBook Pro', 'Equipo', ent0, '9.500.000', '05/03/2024', '', '']]))
  const leer = async file => {
    setErr('')
    try {
      const text = await leerArchivoTexto(file); const { rows, delim } = parseCSV(text)
      if (rows.length < 2) throw new Error('El archivo no tiene filas de datos.')
      const head = rows[0].map(norm)
      const alias = { nombre: ['nombre', 'activo', 'descripcion', 'detalle', 'bien'], tipo: ['tipo', 'clase', 'categoria'], entidad: ['entidad', 'propietario', 'dueño', 'dueno', 'persona'], valor: ['valor', 'valor estimado', 'valor actual', 'valor compra', 'costo', 'precio', 'monto', 'avaluo'], fecha_compra: ['fecha compra', 'fecha_compra', 'fecha de compra', 'fecha adquisicion', 'fecha de adquisicion', 'adquisicion', 'fecha'], identificador: ['identificador', 'placa', 'matricula', 'serial', 'serie', 'id'], notas: ['notas', 'nota', 'observaciones'] }
      const idx = {}; ACSV_COLS.forEach(c => { idx[c] = head.findIndex(h => alias[c].includes(h)); if (idx[c] < 0) idx[c] = head.findIndex(h => alias[c].some(a => h.includes(a))) })
      if (idx.nombre < 0 || idx.valor < 0) throw new Error(`No encontré las columnas obligatorias "nombre" y "valor". Encabezados: ${rows[0].join(' | ')}`)
      const get = (r, c) => idx[c] >= 0 ? String(r[idx[c]] ?? '').trim() : ''
      const nuevos = { ent: new Set() }
      const items = rows.slice(1).filter(r => r.some(v => String(v ?? '').trim())).map((r, i) => {
        const w = [], e = []
        const nombre = get(r, 'nombre'); if (!nombre) e.push('Sin nombre')
        const valor = parseMonto(get(r, 'valor')); if (isNaN(valor) || valor < 0) e.push('Valor inválido')
        const tipoRaw = get(r, 'tipo'); let tipo = matchOpt(tipoRaw, TIPOS_ACTIVO); if (!tipo) { const n = norm(tipoRaw); tipo = /carro|auto|camioneta|vehic/.test(n) ? 'Vehículo' : /moto/.test(n) ? 'Moto' : /casa|apto|apartamento|lote|finca|local|inmueble|oficina/.test(n) ? 'Inmueble' : /comput|laptop|celular|telefono|tv|equipo|pc|tablet/.test(n) ? 'Equipo' : 'Otro'; if (tipoRaw) w.push(`Tipo "${tipoRaw}" → ${tipo}`); else w.push('Sin tipo → ' + tipo) }
        const entRaw = get(r, 'entidad'); let ent = matchOpt(entRaw, db.entidades, x => x.nombre); if (!ent) { if (entRaw) { nuevos.ent.add(entRaw); w.push(`Entidad nueva: ${entRaw}`) } else { ent = db.entidades[0]; w.push(`Sin entidad → ${ent?.nombre || '—'}`) } }
        const fRaw = get(r, 'fecha_compra'); let fecha = parseFecha(fRaw); if (!fecha && fRaw) w.push(`Fecha "${fRaw}" no reconocida; queda vacía`)
        const dup = db.activos.some(a => norm(a.nombre) === norm(nombre)); if (dup) w.push('Ya existe un activo con este nombre; se creará otro')
        return { n: i + 2, nombre, valor, tipo, ent, entRaw, fecha, identificador: get(r, 'identificador'), notas: get(r, 'notas'), w, e }
      })
      if (!items.length) throw new Error('El archivo no tiene filas de datos.')
      setParsed({ items, delim, nuevos: { ent: [...nuevos.ent] } })
    } catch (ex) { setErr(ex.message || String(ex)) }
  }
  const validos = parsed ? parsed.items.filter(x => !x.e.length) : []
  const confirmar = async () => {
    const mapE = Object.fromEntries(db.entidades.map(x => [norm(x.nombre), x.id]))
    if (crear) for (const n of parsed.nuevos.ent) { const r = await insertar('entidades', { nombre: n, tipo: 'persona' }); mapE[norm(n)] = r.id }
    await insertarVarios('activos', validos.map(x => ({ nombre: x.nombre, tipo: x.tipo, entidad_id: x.ent?.id || mapE[norm(x.entRaw)] || null, identificador: x.identificador || null, valor_estimado: x.valor, fecha_adquisicion: x.fecha || null, notas: x.notas || null })))
    onClose()
  }
  const total = validos.reduce((a, x) => a + x.valor, 0)
  return (
    <Modal title="Importar activos" onClose={onClose}>
      {!parsed ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Aviso tipo="info">CSV con columnas <b>nombre</b> y <b>valor</b> (obligatorias) y opcionales <code>tipo, entidad, fecha_compra, identificador, notas</code>. Tipos: {TIPOS_ACTIVO.join(', ')} (también entiende "carro", "apto", "laptop"…). Acepta <code>1.200.000</code> y fechas <code>DD/MM/AAAA</code>.</Aviso>
        <button onClick={plantilla} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, border: '1px solid #d1d5db', borderRadius: 12, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}><Icon name="download" size={16} />Descargar plantilla CSV</button>
        <div onClick={() => fileRef.current.click()} style={{ border: '2px dashed #c4b5fd', borderRadius: 14, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: '#faf5ff' }}>
          <div style={{ color: '#7c3aed', marginBottom: 8 }}><Icon name="upload" size={30} sw={1.5} /></div><div style={{ fontWeight: 700, fontSize: 14, color: '#4c1d95' }}>Toca para elegir el archivo</div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) leer(f); e.target.value = '' }} />
        </div>
        {err && <Aviso tipo="err">{err}</Aviso>}
      </div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}><Kpi value={validos.length} label="Válidos" color="#059669" /><Kpi value={validos.filter(x => x.w.length).length} label="Con avisos" color="#d97706" /><Kpi value={parsed.items.length - validos.length} label="Con errores" color="#dc2626" /></div>
        {parsed.nuevos.ent.length > 0 && <Aviso tipo="warn"><label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={crear} onChange={e => setCrear(e.target.checked)} /><span>Crear entidades que no existen: {parsed.nuevos.ent.join(', ')}</span></label></Aviso>}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
          {parsed.items.map(x => <div key={x.n} style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', background: x.e.length ? '#fff5f5' : x.w.length ? '#fffbeb' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: x.e.length ? '#991b1b' : '#111' }}><span style={{ color: '#9ca3af', fontWeight: 500 }}>#{x.n} </span>{x.nombre || '(sin nombre)'}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>{x.tipo} · {x.ent?.nombre || x.entRaw || '—'}{x.fecha ? ` · ${fmtDate(x.fecha)}` : ''}{x.identificador ? ` · ${x.identificador}` : ''}</div>
              {x.e.map((m, i) => <div key={i} style={{ fontSize: 10, color: '#dc2626' }}>✕ {m}</div>)}{x.w.map((m, i) => <div key={i} style={{ fontSize: 10, color: '#b45309' }}>· {m}</div>)}</div>
              <div style={{ fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap', color: '#059669' }}>{isNaN(x.valor) ? '—' : fmtCOP(x.valor)}</div></div>
          </div>)}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right' }}>Total a importar: <b>{fmtCOP(total)}</b></div>
        <div style={{ display: 'flex', gap: 10 }}><CancelBtn onClick={() => setParsed(null)} /><SaveBtn onClick={confirmar} disabled={!validos.length}>Importar {validos.length}</SaveBtn></div>
      </div>}
    </Modal>
  )
}
