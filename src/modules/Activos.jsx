import { useState, useRef } from 'react'
import { useData, useIndices } from '../lib/data'
import { useAuth } from '../lib/auth'
import MoverA from './MoverA'
import { Kpi, Card, Icon, IcoText, Modal, Field, inp, sel, SaveBtn, CancelBtn, SmallBtn, PrimaryBtn, Aviso, useForm, T } from '../lib/ui'
import { fmtCOP, fmtDate, today, daysLeft, TIPOS_ACTIVO } from '../lib/util'
import { deudaTotal, depreciacion, valorNeto } from '../lib/finanzas'
import { parseCSV, parseMonto, parseFecha, matchOpt, toCSV, descargar, leerArchivoTexto, norm } from '../lib/csv'

const AICO = { Inmueble: 'home', Vehículo: 'car', Moto: 'bike', Equipo: 'laptop', Otro: 'package' }
const PICO = { Impuesto: 'receipt', Seguro: 'shield', Mantenimiento: 'wrench', 'Cuota crédito': 'card', Servicio: 'wifi', Suscripción: 'refresh', Otro: 'pin' }
const ORDENES = [['nombre', 'Nombre (A–Z)'], ['valor', 'Valor'], ['fecha', 'Fecha de compra'], ['tipo', 'Tipo']]
const ordenar = (list, ix, clave, desc) => {
  const k = {
    nombre: a => (a.nombre || '').toLocaleLowerCase('es'), tipo: a => (a.tipo || '').toLocaleLowerCase('es'),
    valor: a => valorNeto(a), fecha: a => a.fecha_adquisicion || '',
  }[clave]
  const arr = [...list].sort((x, y) => { const a = k(x), b = k(y); return typeof a === 'number' ? a - b : String(a).localeCompare(String(b), 'es') })
  return desc ? arr.reverse() : arr
}

export default function Activos() {
  const { db, insertar, actualizar, borrar, nombreMiembro } = useData(); const ix = useIndices(); const { espacios, espacio } = useAuth()
  const [mover, setMover] = useState(null)
  const [open, setOpen] = useState(null); const [modal, setModal] = useState(null); const [importar, setImportar] = useState(false)
  const [orden, setOrden] = useState('nombre'); const [desc, setDesc] = useState(false)
  const emptyA = { nombre: '', tipo: 'Inmueble', identificador: '', valor_estimado: '', fecha_adquisicion: today(), notas: '', deprecia: false, vida_anios: '5', valor_residual: '', valor_base: '', fecha_base: '' }
  const DEPRECIABLE = ['Vehículo', 'Moto', 'Equipo', 'Otro']
  const [form, sf, setForm] = useForm(emptyA)
  const totalP = db.activos.reduce((a, x) => a + valorNeto(x), 0); const totalBruto = db.activos.reduce((a, x) => a + +x.valor_estimado, 0); const deuda = deudaTotal(db)
  const save = async () => {
    if (!form.nombre) return
    const dep = form.deprecia && DEPRECIABLE.includes(form.tipo)
    const row = { nombre: form.nombre, tipo: form.tipo, identificador: form.identificador, valor_estimado: parseMonto(form.valor_estimado) || 0, fecha_adquisicion: form.fecha_adquisicion || null, notas: form.notas,
      vida_util_meses: dep ? (parseInt(form.vida_anios) || 5) * 12 : null, valor_residual: dep ? (parseMonto(form.valor_residual) || 0) : 0, valor_base: dep ? (parseMonto(form.valor_base) || parseMonto(form.valor_estimado) || 0) : null, fecha_base: dep ? (form.fecha_base || form.fecha_adquisicion || today()) : null }
    try { modal === 'add' ? await insertar('activos', row) : await actualizar('activos', modal.id, row); setModal(null) } catch (e) { alert(e.message) }
  }
  const abrirEdicion = a => { setForm({ ...a, valor_estimado: String(a.valor_estimado), deprecia: !!a.vida_util_meses, vida_anios: String(Math.round((a.vida_util_meses || 60) / 12)), valor_residual: a.valor_residual ? String(a.valor_residual) : '', valor_base: a.valor_base ? String(a.valor_base) : '', fecha_base: a.fecha_base || '' }); setModal(a) }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}><Kpi icon="landmark" value={fmtCOP(totalP)} label="Activos (valor neto)" sub={totalBruto !== totalP ? `depreciación acumulada ${fmtCOP(totalBruto - totalP)}` : null} color={T.verde} /><Kpi icon="gem" value={fmtCOP(totalP - deuda.total)} label="Patrimonio neto" sub={`menos deudas ${fmtCOP(deuda.total)}`} color={T.morado} /></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#1B1B1F', flexShrink: 0 }}>Activos ({db.activos.length})</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
          <select aria-label="Ordenar por" value={orden} onChange={e => setOrden(e.target.value)} style={{ ...sel, padding: '7px 6px', fontSize: 12, width: 'auto', maxWidth: 130, minWidth: 0 }}>{ORDENES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button onClick={() => setDesc(d => !d)} title={desc ? 'Descendente' : 'Ascendente'} style={{ background: '#fff', color: '#1B1B1F', border: '1.5px solid #EBE9F1', borderRadius: 20, padding: '7px 9px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name={desc ? 'chevron-down' : 'chevron-up'} size={16} /></button>
          <button onClick={() => setImportar(true)} title="Importar CSV" style={{ background: '#fff', color: '#4B1D9E', border: '1.5px solid #EBE9F1', borderRadius: 20, padding: '7px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="upload" size={16} /></button>
          <PrimaryBtn onClick={() => { setForm(emptyA); setModal('add') }} title="Nuevo activo" style={{ padding: '8px 10px' }}><Icon name="plus" size={16} sw={2.2} /></PrimaryBtn>
        </div>
      </div>
      {db.activos.length === 0 && <Card style={{ textAlign: 'center', color: '#9A9AA0', fontSize: 13, padding: 30 }}>Registra tus activos: inmuebles, vehículos, equipos. Puedes cargarlos desde un CSV con el botón de subir.</Card>}
      {ordenar(db.activos, ix, orden, desc).map(a => {
        const isOpen = open === a.id
        const gastos = db.movimientos.filter(m => m.activo_id === a.id && m.tipo === 'Salida').sort((x, y) => y.fecha.localeCompare(x.fecha))
        const prog = db.programado.filter(p => p.activo_id === a.id && p.estado === 'Pendiente').sort((x, y) => x.vencimiento.localeCompare(y.vencimiento))
        const tc = db.tc_cargos.filter(c => c.activo_id === a.id); const deudas = db.deudas.filter(d => d.activo_id === a.id && d.estado === 'Activo')
        const totalGastos = gastos.reduce((s, m) => s + +m.monto, 0); const dep = depreciacion(a)
        return (
          <div key={a.id} style={{ background: '#fff', borderRadius: 16, border: '1px solid #EBE9F1', overflow: 'hidden' }}>
            <div onClick={() => setOpen(isOpen ? null : a.id)} style={{ padding: '14px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, background: isOpen ? '#E7F5EE' : '#fff' }}>
              <div style={{ background: '#138A5B', borderRadius: 12, padding: '10px 12px', color: '#fff', flexShrink: 0 }}><Icon name={AICO[a.tipo] || 'package'} size={20} /></div>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13, color: '#1B1B1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</div><div style={{ fontSize: 11, color: '#6E6E73', marginTop: 2 }}>{a.tipo}{a.identificador ? ` · ${a.identificador}` : ''}{a.fecha_adquisicion ? ` · ${fmtDate(a.fecha_adquisicion)}` : ''}</div></div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontWeight: 800, fontSize: 14, color: T.verde }}>{fmtCOP(valorNeto(a))}</div>{dep && <div style={{ fontSize: 10, color: T.gris }}>{dep.pct}% depreciado</div>}<div style={{ color: '#9A9AA0', marginTop: 2 }}><Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={16} /></div></div>
            </div>
            {isOpen && <div style={{ borderTop: '1px solid #EBE9F1', padding: '12px 16px' }}>
              {dep && <div style={{ background: '#fff', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span style={{ color: T.gris }}>Valor base {a.fecha_base ? `(${fmtDate(a.fecha_base)})` : ''}</span><b>{fmtCOP(dep.base)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}><span style={{ color: T.gris }}>Depreciación {fmtCOP(dep.mensual)}/mes · {dep.meses} de {dep.vida} meses</span><b style={{ color: T.rojo }}>− {fmtCOP(dep.acumulada)}</b></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4, paddingTop: 4, borderTop: `1px solid ${T.divisor}` }}><span style={{ color: T.gris }}>Valor neto{dep.residual ? ` · residual ${fmtCOP(dep.residual)}` : ''}</span><b style={{ color: T.verde }}>{fmtCOP(dep.neto)}</b></div>
                <div style={{ marginTop: 8, height: 6, borderRadius: 3, background: T.superficie, overflow: 'hidden' }}><div style={{ width: `${dep.pct}%`, height: '100%', background: T.morado }} /></div>
              </div>}
              {!dep && a.tipo !== 'Inmueble' && <div style={{ fontSize: 11, color: T.gris, marginBottom: 10 }}>Este activo no deprecia. Actívalo en Editar si quieres ver su valor neto en el tiempo.</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 12 }}>
                {[['Gastos históricos', fmtCOP(totalGastos)], ['Obligaciones', prog.length], ['Créditos', deudas.length]].map(([l, v]) => <div key={l} style={{ background: '#fff', borderRadius: 12, padding: '8px 10px' }}><div style={{ fontSize: 9, color: '#9A9AA0', fontWeight: 700 }}>{l}</div><div style={{ fontSize: 13, fontWeight: 700 }}>{v}</div></div>)}
              </div>
              {prog.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontWeight: 700, fontSize: 12, color: '#1B1B1F', marginBottom: 8 }}><IcoText name="calendar">Obligaciones programadas</IcoText></div>{prog.map(p => { const d = daysLeft(p.vencimiento); return <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #F3F1F8' }}><div><div style={{ fontSize: 12, fontWeight: 600 }}><IcoText name={PICO[p.tipo] || 'pin'} size={12} gap={5}>{p.nombre}</IcoText></div><div style={{ fontSize: 10, color: '#6E6E73' }}>{p.periodicidad} · {fmtDate(p.vencimiento)}</div></div><div style={{ textAlign: 'right' }}><div style={{ fontSize: 12, fontWeight: 700 }}>{fmtCOP(p.monto)}</div><span style={{ background: d < 0 ? '#FBEAE7' : d <= 15 ? '#FBF0DA' : '#E7F5EE', color: d < 0 ? '#B42318' : d <= 15 ? '#9A5B00' : '#0F6B47', padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 600 }}>{d < 0 ? 'Vencido' : d === 0 ? 'Hoy' : `${d}d`}</span></div></div> })}</div>}
              {tc.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontWeight: 700, fontSize: 12, color: '#1B1B1F', marginBottom: 8 }}><IcoText name="card">Compras con tarjeta</IcoText></div>{tc.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F3F1F8', fontSize: 12 }}><span>{c.descripcion} <span style={{ fontSize: 10, color: '#9A9AA0' }}>{fmtDate(c.fecha)} · {ix.cta[c.cuenta_id]?.nombre}</span></span><b style={{ color: '#4B1D9E' }}>{fmtCOP(c.monto)}</b></div>)}</div>}
              {gastos.length > 0 && <div style={{ marginBottom: 12 }}><div style={{ fontWeight: 700, fontSize: 12, color: '#1B1B1F', marginBottom: 8 }}><IcoText name="trending-down">Últimos gastos</IcoText></div>{gastos.slice(0, 5).map(m => <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F3F1F8', fontSize: 12 }}><span>{m.descripcion} <span style={{ fontSize: 10, color: '#9A9AA0' }}>{fmtDate(m.fecha)}</span></span><b style={{ color: '#B42318' }}>-{fmtCOP(m.monto)}</b></div>)}</div>}
              {a.notas && <div style={{ fontSize: 11, color: '#6E6E73', marginBottom: 10 }}>{a.notas}</div>}
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>{espacios.length > 1 && <SmallBtn onClick={() => setMover({ tabla: 'activos', id: a.id, nombre: a.nombre })} bg="#F3F1F8" color="#6E6E73"><Icon name="arrow-right" size={12} />Mover a…</SmallBtn>}<SmallBtn onClick={() => { abrirEdicion(a) }} bg="#F3F1F8" color="#4B1D9E"><Icon name="pencil" size={12} />Editar</SmallBtn><SmallBtn onClick={async () => { if (window.confirm('¿Eliminar activo?')) await borrar('activos', a.id) }} bg="#FBEAE7" color="#B42318"><Icon name="trash" size={12} />Eliminar</SmallBtn></div>
            </div>}
          </div>)
      })}
      {modal && <Modal title={modal === 'add' ? 'Nuevo activo' : 'Editar activo'} onClose={() => setModal(null)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Nombre" full><input value={form.nombre} onChange={e => sf('nombre', e.target.value)} style={inp} /></Field>
          <Field label="Tipo"><select value={form.tipo} onChange={e => sf('tipo', e.target.value)} style={sel}>{TIPOS_ACTIVO.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Identificador"><input value={form.identificador || ''} onChange={e => sf('identificador', e.target.value)} style={inp} placeholder="Placa, matrícula…" /></Field>
          <Field label="Valor estimado (COP)"><input type="number" inputMode="numeric" value={form.valor_estimado} onChange={e => sf('valor_estimado', e.target.value)} style={inp} /></Field>
          <Field label="Fecha adquisición"><input type="date" value={form.fecha_adquisicion || ''} onChange={e => sf('fecha_adquisicion', e.target.value)} style={inp} /></Field>
          <Field label="Notas" full><input value={form.notas || ''} onChange={e => sf('notas', e.target.value)} style={inp} /></Field>
          {DEPRECIABLE.includes(form.tipo) && <div style={{ gridColumn: '1/-1', background: T.superficie, borderRadius: 12, padding: '12px 14px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}><input type="checkbox" checked={!!form.deprecia} onChange={e => sf('deprecia', e.target.checked)} style={{ width: 18, height: 18 }} /><span style={{ fontWeight: 700, fontSize: 13 }}>Deprecia (lineal mensual)</span></label>
            {form.deprecia && <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                <Field label="Vida útil"><select value={form.vida_anios} onChange={e => sf('vida_anios', e.target.value)} style={{ ...sel, background: '#fff' }}>{[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n} años</option>)}</select></Field>
                <Field label="Valor residual (COP)"><input type="number" inputMode="numeric" value={form.valor_residual || ''} onChange={e => sf('valor_residual', e.target.value)} style={{ ...inp, background: '#fff' }} placeholder="0" /></Field>
                <Field label="Valor base (COP)"><input type="number" inputMode="numeric" value={form.valor_base || ''} onChange={e => sf('valor_base', e.target.value)} style={{ ...inp, background: '#fff' }} placeholder={form.valor_estimado || 'igual al valor estimado'} /></Field>
                <Field label="Deprecia desde"><input type="date" value={form.fecha_base || ''} onChange={e => sf('fecha_base', e.target.value)} style={{ ...inp, background: '#fff' }} /></Field>
              </div>
              <div style={{ fontSize: 11, color: T.gris, marginTop: 10, lineHeight: 1.5 }}>Activo comprado antes de usar la app: pon como <b>valor base</b> su valor de mercado hoy, como <b>deprecia desde</b> la fecha de hoy y como <b>vida útil</b> los años que le quedan. Es una remedición, no una depreciación acelerada: desde aquí deprecia lineal hasta el residual.</div>
            </>}
          </div>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={save}>Guardar</SaveBtn></div>
      </Modal>}
      {importar && <ImportarActivos onClose={() => setImportar(false)} />}
      {mover && <MoverA item={mover} onClose={() => setMover(null)} />}
    </div>
  )
}

const ACSV_COLS = ['nombre', 'tipo', 'valor', 'fecha_compra', 'identificador', 'notas', 'vida_util', 'residual']

function ImportarActivos({ onClose }) {
  const { db, insertarVarios } = useData()
  const [parsed, setParsed] = useState(null); const [err, setErr] = useState(''); const fileRef = useRef()
  const plantilla = () => descargar('plantilla-activos.csv', toCSV([ACSV_COLS, ['Apartamento Ciudad Jardín', 'Inmueble', '380.000.000', '15/06/2019', 'Matrícula 370-123456', ''], ['Mazda 3', 'Vehículo', '62.000.000', '20/01/2022', 'ABC123', 'Comprado usado'], ['MacBook Pro', 'Equipo', '9.500.000', '05/03/2024', '', '']]))
  const leer = async file => {
    setErr('')
    try {
      const text = await leerArchivoTexto(file); const { rows, delim } = parseCSV(text)
      if (rows.length < 2) throw new Error('El archivo no tiene filas de datos.')
      const head = rows[0].map(norm)
      const alias = { nombre: ['nombre', 'activo', 'descripcion', 'detalle', 'bien'], tipo: ['tipo', 'clase', 'categoria'], valor: ['valor', 'valor estimado', 'valor actual', 'valor compra', 'costo', 'precio', 'monto', 'avaluo'], fecha_compra: ['fecha compra', 'fecha_compra', 'fecha de compra', 'fecha adquisicion', 'fecha de adquisicion', 'adquisicion', 'fecha'], vida_util: ['vida util', 'vida_util', 'vida util anios', 'anios', 'años', 'vida'], residual: ['residual', 'valor residual', 'salvamento'], identificador: ['identificador', 'placa', 'matricula', 'serial', 'serie', 'id'], notas: ['notas', 'nota', 'observaciones'] }
      const idx = {}; ACSV_COLS.forEach(c => { idx[c] = head.findIndex(h => alias[c].includes(h)); if (idx[c] < 0) idx[c] = head.findIndex(h => alias[c].some(a => h.includes(a))) })
      if (idx.nombre < 0 || idx.valor < 0) throw new Error(`No encontré las columnas obligatorias "nombre" y "valor". Encabezados: ${rows[0].join(' | ')}`)
      const get = (r, c) => idx[c] >= 0 ? String(r[idx[c]] ?? '').trim() : ''
      const items = rows.slice(1).filter(r => r.some(v => String(v ?? '').trim())).map((r, i) => {
        const w = [], e = []
        const nombre = get(r, 'nombre'); if (!nombre) e.push('Sin nombre')
        const valor = parseMonto(get(r, 'valor')); if (isNaN(valor) || valor < 0) e.push('Valor inválido')
        const tipoRaw = get(r, 'tipo'); let tipo = matchOpt(tipoRaw, TIPOS_ACTIVO); if (!tipo) { const n = norm(tipoRaw); tipo = /carro|auto|camioneta|vehic/.test(n) ? 'Vehículo' : /moto/.test(n) ? 'Moto' : /casa|apto|apartamento|lote|finca|local|inmueble|oficina/.test(n) ? 'Inmueble' : /comput|laptop|celular|telefono|tv|equipo|pc|tablet/.test(n) ? 'Equipo' : 'Otro'; if (tipoRaw) w.push(`Tipo "${tipoRaw}" → ${tipo}`); else w.push('Sin tipo → ' + tipo) }
        const fRaw = get(r, 'fecha_compra'); let fecha = parseFecha(fRaw); if (!fecha && fRaw) w.push(`Fecha "${fRaw}" no reconocida; queda vacía`)
        const dup = db.activos.some(a => norm(a.nombre) === norm(nombre)); if (dup) w.push('Ya existe un activo con este nombre; se creará otro')
        let vida = parseInt(get(r, 'vida_util')) || null; if (vida && tipo === 'Inmueble') { w.push('Inmueble no deprecia; se ignora la vida útil'); vida = null } else if (vida && (vida < 2 || vida > 10)) { w.push(`Vida útil ${vida} fuera de 2–10 años; se ignora`); vida = null }
        const residual = vida ? (parseMonto(get(r, 'residual')) || 0) : 0
        return { n: i + 2, nombre, valor, tipo, fecha, identificador: get(r, 'identificador'), notas: get(r, 'notas'), vida, residual, w, e }
      })
      if (!items.length) throw new Error('El archivo no tiene filas de datos.')
      setParsed({ items, delim })
    } catch (ex) { setErr(ex.message || String(ex)) }
  }
  const validos = parsed ? parsed.items.filter(x => !x.e.length) : []
  const confirmar = async () => {
    await insertarVarios('activos', validos.map(x => ({ nombre: x.nombre, tipo: x.tipo, identificador: x.identificador || null, valor_estimado: x.valor, fecha_adquisicion: x.fecha || null, notas: x.notas || null, vida_util_meses: x.vida ? x.vida * 12 : null, valor_residual: x.residual || 0, valor_base: x.vida ? x.valor : null, fecha_base: x.vida ? (x.fecha || today()) : null })))
    onClose()
  }
  const total = validos.reduce((a, x) => a + x.valor, 0)
  return (
    <Modal title="Importar activos" onClose={onClose}>
      {!parsed ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Aviso tipo="info">CSV con columnas <b>nombre</b> y <b>valor</b> (obligatorias) y opcionales <code>tipo, fecha_compra, identificador, notas, vida_util</code> (años, 2–10; no aplica a inmuebles) y <code>residual</code>. Tipos: {TIPOS_ACTIVO.join(', ')} (también entiende "carro", "apto", "laptop"…). Acepta <code>1.200.000</code> y fechas <code>DD/MM/AAAA</code>.</Aviso>
        <button onClick={plantilla} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, border: '1px solid #D9D2EA', borderRadius: 12, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1B1B1F' }}><Icon name="download" size={16} />Descargar plantilla CSV</button>
        <div onClick={() => fileRef.current.click()} style={{ border: '2px dashed #D9D2EA', borderRadius: 14, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: '#F3F1F8' }}>
          <div style={{ color: '#4B1D9E', marginBottom: 8 }}><Icon name="upload" size={30} sw={1.5} /></div><div style={{ fontWeight: 700, fontSize: 14, color: '#36146F' }}>Toca para elegir el archivo</div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) leer(f); e.target.value = '' }} />
        </div>
        {err && <Aviso tipo="err">{err}</Aviso>}
      </div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}><Kpi value={validos.length} label="Válidos" color="#138A5B" /><Kpi value={validos.filter(x => x.w.length).length} label="Con avisos" color="#9A5B00" /><Kpi value={parsed.items.length - validos.length} label="Con errores" color="#B42318" /></div>
        <div style={{ border: '1px solid #EBE9F1', borderRadius: 12, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
          {parsed.items.map(x => <div key={x.n} style={{ padding: '8px 10px', borderBottom: '1px solid #F3F1F8', background: x.e.length ? '#fff5f5' : x.w.length ? '#FBF0DA' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: x.e.length ? '#B42318' : '#1B1B1F' }}><span style={{ color: '#9A9AA0', fontWeight: 500 }}>#{x.n} </span>{x.nombre || '(sin nombre)'}</div>
              <div style={{ fontSize: 10, color: '#6E6E73' }}>{x.tipo}{x.fecha ? ` · ${fmtDate(x.fecha)}` : ''}{x.identificador ? ` · ${x.identificador}` : ''}</div>
              {x.e.map((m, i) => <div key={i} style={{ fontSize: 10, color: '#B42318' }}>✕ {m}</div>)}{x.w.map((m, i) => <div key={i} style={{ fontSize: 10, color: '#9A5B00' }}>· {m}</div>)}</div>
              <div style={{ fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap', color: '#138A5B' }}>{isNaN(x.valor) ? '—' : fmtCOP(x.valor)}</div></div>
          </div>)}
        </div>
        <div style={{ fontSize: 11, color: '#6E6E73', textAlign: 'right' }}>Total a importar: <b>{fmtCOP(total)}</b></div>
        <div style={{ display: 'flex', gap: 10 }}><CancelBtn onClick={() => setParsed(null)} /><SaveBtn onClick={confirmar} disabled={!validos.length}>Importar {validos.length}</SaveBtn></div>
      </div>}
    </Modal>
  )
}
