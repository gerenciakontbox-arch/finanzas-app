import { useState, useRef } from 'react'
import { useData, useIndices } from '../lib/data'
import { Kpi, Card, Badge, Icon, IcoText, Modal, Field, inp, sel, PBtn, SaveBtn, CancelBtn, SmallBtn, PrimaryBtn, Aviso, useForm } from '../lib/ui'
import { fmtCOP, fmtDate, today, addDays, addMonths, primeroDelMes, ESTADOS_P, GRUPOS } from '../lib/util'
import { presupuestoConEjecucion, aportesPlanificados, aportesPorEspacio } from '../lib/finanzas'
import { useAuth } from '../lib/auth'
import { parseCSV, parseMonto, parseFecha, matchOpt, toCSV, descargar, leerArchivoTexto, norm } from '../lib/csv'

const ECLS = { Planificado: '#f1f5f9|#64748b', Programado: '#dbeafe|#1e40af', Pagado: '#d1fae5|#065f46', Cancelado: '#fee2e2|#991b1b' }
const GCLS = { Fijo: '#dbeafe|#1d4ed8', Variable: '#f3e8ff|#7e22ce', Provisión: '#fef3c7|#92400e', 'Amortización crédito': '#fee2e2|#991b1b', 'Depreciación activo': '#f1f5f9|#475569' }
const CSV_COLS = ['concepto', 'pagador', 'categoria', 'monto', 'fecha', 'estado', 'cuenta', 'notas']
const mesLabel = p => new Date(p + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

export default function Presupuesto() {
  const { db, all, insertar, actualizar, borrar, insertarVarios, nombreCuenta, nombreMiembro, espacioDe } = useData(); const ix = useIndices()
  const { esPersonal, miembros, userId, personal, espacio } = useAuth()
  const [periodo, setPeriodo] = useState(primeroDelMes())
  const [vista, setVista] = useState('todos'); const [modal, setModal] = useState(null); const [search, setSearch] = useState(''); const [importar, setImportar] = useState(false); const [copiar, setCopiar] = useState(false)
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== 'Tarjeta crédito')
  const empty = { concepto: '', pagador_id: esPersonal ? null : userId, categoria_id: db.categorias.find(c => c.activa !== false)?.id || null, activo_id: null, cuenta_id: cuentasCaja[0]?.id || null, monto: '', fecha_tentativa: today(), estado: 'Planificado', notas: '' }
  const [form, sf, setForm] = useForm(empty)
  const pce = presupuestoConEjecucion(db, periodo)
  const periodosExistentes = [...new Set(db.presupuesto.map(p => p.periodo))].sort().reverse()
  const periodos = [...new Set([addMonths(primeroDelMes(), -1), primeroDelMes(), addMonths(primeroDelMes(), 1), ...periodosExistentes])].sort().reverse()

  const save = async () => {
    if (!form.concepto || !form.monto) return
    const row = { ...form, monto: parseMonto(form.monto), periodo, activo_id: form.activo_id || null, cuenta_id: form.cuenta_id || null, pagador_id: esPersonal ? null : (form.pagador_id || null), categoria_id: form.categoria_id || null }
    delete row.id; delete row.ejecutado; delete row.diferencia; delete row.pct; delete row.creado_por; delete row.creado_en; delete row.actualizado_por; delete row.actualizado_en; delete row.espacio_id; delete row.entidad_id
    modal === 'add' ? await insertar('presupuesto', row) : await actualizar('presupuesto', modal.id, row)
    setModal(null)
  }
  const del = async id => { if (window.confirm('¿Eliminar este rubro?')) await borrar('presupuesto', id) }
  const markPaid = async p => actualizar('presupuesto', p.id, { estado: 'Pagado', fecha_efectiva: today() })
  const copiarMesAnterior = async () => {
    const prev = db.presupuesto.filter(p => p.periodo === addMonths(periodo, -1))
    if (!prev.length) { alert('El mes anterior no tiene rubros.'); return }
    await insertarVarios('presupuesto', prev.map(p => ({ periodo, concepto: p.concepto, pagador_id: p.pagador_id, categoria_id: p.categoria_id, activo_id: p.activo_id, cuenta_id: p.cuenta_id, monto: p.monto, fecha_tentativa: p.fecha_tentativa ? addMonths(p.fecha_tentativa, 1) : null, estado: 'Planificado', notas: p.notas })))
    setCopiar(false)
  }

  const t = today(), t7 = addDays(t, 7)
  let items = [...pce]
  if (search) items = items.filter(p => norm(p.concepto).includes(norm(search)))
  if (vista === 'proximos') items = items.filter(p => !['Pagado', 'Cancelado'].includes(p.estado) && p.fecha_tentativa >= t && p.fecha_tentativa <= t7)
  if (vista === 'pagador') items.sort((a, b) => nombreMiembro(a.pagador_id).localeCompare(nombreMiembro(b.pagador_id)))
  const planAportes = esPersonal ? aportesPlanificados(all, periodo, userId, personal?.id) : {}
  const realAportes = esPersonal ? aportesPorEspacio(all, personal?.id, periodo.slice(0, 7)) : {}
  const totalPlanAportes = Object.values(planAportes).reduce((a, v) => a + v, 0)
  if (vista === 'grupo') items.sort((a, b) => (ix.cat[a.categoria_id]?.grupo || '').localeCompare(ix.cat[b.categoria_id]?.grupo || ''))
  const tP = items.reduce((a, p) => a + p.monto, 0), tE = items.reduce((a, p) => a + p.ejecutado, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ ...sel, flex: 1, fontWeight: 700, textTransform: 'capitalize' }}>{periodos.map(p => <option key={p} value={p}>{mesLabel(p)}{p === primeroDelMes() ? ' (actual)' : ''}</option>)}</select>
        {pce.length === 0 && db.presupuesto.some(p => p.periodo === addMonths(periodo, -1)) && <SmallBtn onClick={() => setCopiar(true)} bg="#ede9fe" color="#7c3aed"><Icon name="refresh" size={12} />Copiar mes anterior</SmallBtn>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <Kpi label="Presupuestado" value={fmtCOP(tP)} color="#7c3aed" /><Kpi label="Ejecutado" value={fmtCOP(tE)} color="#0891b2" /><Kpi label="Diferencia" value={fmtCOP(tP - tE)} color={tP - tE >= 0 ? '#059669' : '#dc2626'} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, flex: 1 }} />
        <button onClick={() => setImportar(true)} title="Importar CSV" style={{ background: '#fff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="upload" size={18} /></button>
        <PrimaryBtn onClick={() => { setForm(empty); setModal('add') }}><Icon name="plus" size={18} sw={2.2} /></PrimaryBtn>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <PBtn active={vista === 'todos'} onClick={() => setVista('todos')}>Todos</PBtn><PBtn active={vista === 'proximos'} onClick={() => setVista('proximos')}>7 días</PBtn>{!esPersonal && <PBtn active={vista === 'pagador'} onClick={() => setVista('pagador')}>Pagador</PBtn>}<PBtn active={vista === 'grupo'} onClick={() => setVista('grupo')}>Grupo</PBtn>
      </div>
      {esPersonal && Object.keys(planAportes).length > 0 && <Card style={{ background: '#f5f3ff', border: '1px solid #e9d5ff' }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#5b21b6', marginBottom: 6 }}><IcoText name="arrow-right" size={13}>Aportes planificados a mis espacios · {fmtCOP(totalPlanAportes)}</IcoText></div>
        <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 8 }}>Vienen de los rubros de cada espacio compartido asignados a ti. Se ejecutan con lo que pagas desde tus cuentas.</div>
        {Object.entries(planAportes).map(([eid, plan]) => { const real = realAportes[eid]?.aportes || 0; const pct = plan > 0 ? Math.round(real / plan * 100) : 0; return <div key={eid} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><b>{espacioDe(eid)?.nombre || '—'}</b><span>{fmtCOP(real)} / {fmtCOP(plan)}</span></div>
          <div style={{ background: '#e9d5ff', borderRadius: 99, height: 6, marginTop: 4 }}><div style={{ height: 6, borderRadius: 99, background: pct > 100 ? '#dc2626' : '#7c3aed', width: `${Math.min(pct, 100)}%` }} /></div>
        </div> })}
      </Card>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && <Card style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 30 }}>Sin rubros en {mesLabel(periodo)}.</Card>}
        {items.map(p => { const cat = ix.cat[p.categoria_id]; return (
          <div key={p.id} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.concepto}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{!esPersonal && <span><Icon name="user" size={10} style={{ marginRight: 3 }} />{p.pagador_id ? nombreMiembro(p.pagador_id) : 'sin pagador'} ·</span>} {cat?.nombre || '—'} {cat && <Badge val={cat.grupo} map={GCLS} />} · {fmtDate(p.fecha_tentativa)}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontWeight: 800, fontSize: 14, color: '#111' }}>{fmtCOP(p.monto)}</div><Badge val={p.estado} map={ECLS} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, background: '#e5e7eb', borderRadius: 99, height: 6 }}><div style={{ height: 6, borderRadius: 99, background: p.pct > 100 ? '#dc2626' : p.pct > 80 ? '#f59e0b' : '#10b981', width: `${Math.min(p.pct, 100)}%` }} /></div>
              <span style={{ fontSize: 10, color: '#6b7280', minWidth: 32 }}>{p.pct}%</span><span style={{ fontSize: 10, color: '#0891b2' }}>{fmtCOP(p.ejecutado)}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {p.estado !== 'Pagado' && <button onClick={() => markPaid(p)} style={{ flex: 1, fontSize: 12, background: '#d1fae5', color: '#065f46', border: 'none', borderRadius: 8, padding: '7px', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Icon name="check" size={12} />Pagado</button>}
              <SmallBtn onClick={() => { setForm({ ...p, monto: String(p.monto) }); setModal(p) }} bg="#ede9fe" color="#7c3aed"><Icon name="pencil" size={13} /></SmallBtn>
              <SmallBtn onClick={() => del(p.id)} bg="#fee2e2" color="#dc2626"><Icon name="trash" size={13} /></SmallBtn>
            </div>
          </div>) })}
      </div>

      {modal && <Modal title={modal === 'add' ? `Nuevo rubro · ${mesLabel(periodo)}` : 'Editar rubro'} onClose={() => setModal(null)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Concepto" full><input value={form.concepto || ''} onChange={e => sf('concepto', e.target.value)} style={inp} /></Field>
          {!esPersonal && <Field label="Quién lo paga"><select value={form.pagador_id || ''} onChange={e => sf('pagador_id', e.target.value || null)} style={sel}><option value="">— Por definir —</option>{miembros.map(m => <option key={m.user_id} value={m.user_id}>{m.nombre}</option>)}</select></Field>}
          <Field label="Categoría"><select value={form.categoria_id || ''} onChange={e => sf('categoria_id', e.target.value || null)} style={sel}>{db.categorias.filter(c => c.activa !== false || c.id === form.categoria_id).map(x => <option key={x.id} value={x.id}>{x.nombre} · {x.grupo}</option>)}</select></Field>
          <Field label="Cuenta"><select value={form.cuenta_id || ''} onChange={e => sf('cuenta_id', e.target.value || null)} style={sel}><option value="">—</option>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{nombreCuenta(x)}</option>)}</select></Field>
          <Field label="Activo"><select value={form.activo_id || ''} onChange={e => sf('activo_id', e.target.value || null)} style={sel}><option value="">— Ninguno —</option>{db.activos.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          <Field label="Monto (COP)"><input type="number" inputMode="numeric" value={form.monto || ''} onChange={e => sf('monto', e.target.value)} style={inp} /></Field>
          <Field label="Fecha tentativa"><input type="date" value={form.fecha_tentativa || ''} onChange={e => sf('fecha_tentativa', e.target.value)} style={inp} /></Field>
          <Field label="Estado"><select value={form.estado || ''} onChange={e => sf('estado', e.target.value)} style={sel}>{ESTADOS_P.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Notas" full><input value={form.notas || ''} onChange={e => sf('notas', e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={save}>Guardar</SaveBtn></div>
      </Modal>}

      {copiar && <Modal title="Copiar presupuesto del mes anterior" onClose={() => setCopiar(false)}>
        <Aviso tipo="info">Se copiarán los {db.presupuesto.filter(p => p.periodo === addMonths(periodo, -1)).length} rubros de {mesLabel(addMonths(periodo, -1))} a {mesLabel(periodo)}, todos en estado Planificado y con las fechas corridas un mes.</Aviso>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setCopiar(false)} /><SaveBtn onClick={copiarMesAnterior}>Copiar</SaveBtn></div>
      </Modal>}

      {importar && <ImportarCSV periodo={periodo} onClose={() => setImportar(false)} />}
    </div>
  )
}

function ImportarCSV({ periodo, onClose }) {
  const { db, insertar, insertarVarios, nombreCuenta } = useData(); const { esPersonal, miembros } = useAuth()
  const [parsed, setParsed] = useState(null); const [err, setErr] = useState(''); const [crear, setCrear] = useState(true); const fileRef = useRef()
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== 'Tarjeta crédito')
  const plantilla = () => descargar('plantilla-presupuesto.csv', toCSV([CSV_COLS, ['Arriendo apto', miembros[0]?.nombre || '', 'Arriendo', '2200000', fmtDate(periodo).replace(/^01/, '05'), 'Planificado', cuentasCaja[0]?.nombre || '', ''], ['Mercado semana 1', miembros[0]?.nombre || '', 'Mercado', '350000', '', 'Planificado', '', 'Éxito']]))
  const leer = async file => {
    setErr('')
    try {
      const text = await leerArchivoTexto(file); const { rows, delim } = parseCSV(text)
      if (rows.length < 2) throw new Error('El archivo no tiene filas de datos.')
      const head = rows[0].map(norm)
      const alias = { concepto: ['concepto', 'rubro', 'nombre', 'descripcion', 'detalle'], pagador: ['pagador', 'quien paga', 'paga', 'responsable', 'entidad', 'persona', 'quien'], categoria: ['categoria', 'cat'], monto: ['monto', 'valor', 'presupuestado', 'importe', 'total'], fecha: ['fecha', 'fecha tentativa', 'vencimiento', 'dia'], estado: ['estado', 'status'], cuenta: ['cuenta', 'metodo de pago', 'medio', 'banco'], notas: ['notas', 'nota', 'observaciones'] }
      const idx = {}; CSV_COLS.forEach(c => { idx[c] = head.findIndex(h => alias[c].includes(h)); if (idx[c] < 0) idx[c] = head.findIndex(h => alias[c].some(a => h.includes(a))) })
      if (idx.concepto < 0 || idx.monto < 0) throw new Error(`No encontré las columnas obligatorias "concepto" y "monto". Encabezados: ${rows[0].join(' | ')}`)
      const get = (r, c) => idx[c] >= 0 ? (r[idx[c]] ?? '') : ''
      const nuevos = { ent: [], cat: new Set(), cta: new Set() }
      const items = rows.slice(1).map((r, i) => {
        const w = [], e = []
        const concepto = String(get(r, 'concepto')).trim(); if (!concepto) e.push('Sin concepto')
        const monto = parseMonto(get(r, 'monto')); if (isNaN(monto) || monto <= 0) e.push('Monto inválido')
        const entRaw = String(get(r, 'pagador')).trim(); let ent = esPersonal ? null : matchOpt(entRaw, miembros, x => x.nombre); if (!esPersonal && !ent) { if (entRaw) w.push(`Pagador "${entRaw}" no es miembro; queda por definir`); else w.push('Sin pagador') }
        const catRaw = String(get(r, 'categoria')).trim(); let cat = matchOpt(catRaw, db.categorias.filter(c => c.activa !== false), x => x.nombre); if (!cat) { if (catRaw) { nuevos.cat.add(catRaw); w.push(`Categoría nueva: ${catRaw}`) } else { cat = db.categorias.find(c => c.nombre === 'Otro'); w.push('Sin categoría → Otro') } }
        const fechaRaw = String(get(r, 'fecha')).trim(); let fecha = parseFecha(fechaRaw); if (!fecha) { fecha = periodo; if (fechaRaw) w.push('Fecha no reconocida → 1° del mes') }
        const estado = matchOpt(get(r, 'estado'), ESTADOS_P) || 'Planificado'
        const ctaRaw = String(get(r, 'cuenta')).trim(); let cta = matchOpt(ctaRaw, cuentasCaja, x => x.nombre) || matchOpt(ctaRaw, cuentasCaja, x => nombreCuenta(x)); if (!cta && ctaRaw) { if (esPersonal) { nuevos.cta.add(ctaRaw); w.push(`Cuenta nueva: ${ctaRaw}`) } else w.push(`Cuenta "${ctaRaw}" no está habilitada aquí; queda vacía`) }
        return { n: i + 2, concepto, monto, ent, entRaw, cat, catRaw, cta, ctaRaw, fecha, estado, notas: String(get(r, 'notas')).trim(), w, e }
      })
      setParsed({ items, delim, nuevos: { ent: [], cat: [...nuevos.cat], cta: [...nuevos.cta] } })
    } catch (ex) { setErr(ex.message || String(ex)) }
  }
  const validos = parsed ? parsed.items.filter(x => !x.e.length) : []
  const confirmar = async () => {
    const mapC = Object.fromEntries(db.categorias.map(x => [norm(x.nombre), x.id])), mapK = Object.fromEntries(cuentasCaja.map(x => [norm(x.nombre), x.id]))
    if (crear) {
      for (const n of parsed.nuevos.cat) { const r = await insertar('categorias', { nombre: n, grupo: 'Variable' }); mapC[norm(n)] = r.id }
      for (const n of parsed.nuevos.cta) { const r = await insertar('cuentas', { nombre: n, tipo: 'Bancaria' }); mapK[norm(n)] = r.id }
    }
    await insertarVarios('presupuesto', validos.map(x => ({ periodo, concepto: x.concepto, monto: x.monto, fecha_tentativa: x.fecha, estado: x.estado, notas: x.notas, pagador_id: x.ent?.user_id || null, categoria_id: x.cat?.id || mapC[norm(x.catRaw)] || null, cuenta_id: x.cta?.id || mapK[norm(x.ctaRaw)] || null })))
    onClose()
  }
  return (
    <Modal title={`Importar presupuesto · ${mesLabel(periodo)}`} onClose={onClose}>
      {!parsed ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Aviso tipo="info">CSV con columnas <b>concepto</b> y <b>monto</b> (obligatorias) y opcionales <code>{esPersonal ? '' : 'pagador, '}categoria, fecha, estado, cuenta, notas</code>. Acepta <code>1.200.000</code> y fechas <code>DD/MM/AAAA</code>.</Aviso>
        <button onClick={plantilla} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, border: '1px solid #d1d5db', borderRadius: 12, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' }}><Icon name="download" size={16} />Descargar plantilla CSV</button>
        <div onClick={() => fileRef.current.click()} style={{ border: '2px dashed #c4b5fd', borderRadius: 14, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: '#faf5ff' }}>
          <div style={{ color: '#7c3aed', marginBottom: 8 }}><Icon name="upload" size={30} sw={1.5} /></div><div style={{ fontWeight: 700, fontSize: 14, color: '#4c1d95' }}>Toca para elegir el archivo</div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) leer(f); e.target.value = '' }} />
        </div>
        {err && <Aviso tipo="err">{err}</Aviso>}
      </div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}><Kpi value={validos.length} label="Válidas" color="#059669" /><Kpi value={validos.filter(x => x.w.length).length} label="Con avisos" color="#d97706" /><Kpi value={parsed.items.length - validos.length} label="Con errores" color="#dc2626" /></div>
        {(parsed.nuevos.ent.length + parsed.nuevos.cat.length + parsed.nuevos.cta.length) > 0 && <Aviso tipo="warn"><label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={crear} onChange={e => setCrear(e.target.checked)} /><span>Crear lo que no existe: {[...parsed.nuevos.ent, ...parsed.nuevos.cat, ...parsed.nuevos.cta].join(', ')}</span></label></Aviso>}
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
          {parsed.items.map(x => <div key={x.n} style={{ padding: '8px 10px', borderBottom: '1px solid #f3f4f6', background: x.e.length ? '#fff5f5' : x.w.length ? '#fffbeb' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: x.e.length ? '#991b1b' : '#111' }}><span style={{ color: '#9ca3af', fontWeight: 500 }}>#{x.n} </span>{x.concepto || '(sin concepto)'}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>{esPersonal ? '' : (x.ent?.nombre || x.entRaw || 'sin pagador') + ' · '}{x.cat?.nombre || x.catRaw || '—'} · {fmtDate(x.fecha)}</div>
              {x.e.map((m, i) => <div key={i} style={{ fontSize: 10, color: '#dc2626' }}>✕ {m}</div>)}{x.w.map((m, i) => <div key={i} style={{ fontSize: 10, color: '#b45309' }}>· {m}</div>)}</div>
              <div style={{ fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{isNaN(x.monto) ? '—' : fmtCOP(x.monto)}</div></div>
          </div>)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}><CancelBtn onClick={() => setParsed(null)} /><SaveBtn onClick={confirmar} disabled={!validos.length}>Importar {validos.length}</SaveBtn></div>
      </div>}
    </Modal>
  )
}
