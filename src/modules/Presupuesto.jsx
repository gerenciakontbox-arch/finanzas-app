import { useState, useRef } from 'react'
import { useData, useIndices } from '../lib/data'
import { Kpi, Card, Badge, Icon, IcoText, Modal, Field, inp, sel, PBtn, SaveBtn, CancelBtn, SmallBtn, PrimaryBtn, Aviso, useForm, T } from '../lib/ui'
import { fmtCOP, fmtDate, today, addDays, addMonths, primeroDelMes, ESTADOS_P, GRUPOS, PERIODICIDADES } from '../lib/util'
import { presupuestoConEjecucion, aportesPlanificados, aportesPorEspacio } from '../lib/finanzas'
import { useAuth } from '../lib/auth'
import { parseCSV, parseMonto, parseFecha, matchOpt, toCSV, descargar, leerArchivoTexto, norm } from '../lib/csv'

const ECLS = { Planificado: '#F3F1F8|#6E6E73', Programado: '#E6F2F6|#0F6E8C', Pagado: '#E7F5EE|#0F6B47', Cancelado: '#FBEAE7|#B42318' }
const GCLS = { Fijo: '#E6F2F6|#0F6E8C', Variable: '#f3e8ff|#7e22ce', Provisión: '#FBF0DA|#9A5B00', 'Amortización crédito': '#FBEAE7|#B42318', 'Depreciación activo': '#F3F1F8|#6E6E73' }
const CSV_COLS = ['concepto', 'pagador', 'categoria', 'monto', 'fecha', 'estado', 'cuenta', 'notas', 'periodo', 'programar', 'periodicidad', 'vencimiento']
const esSi = v => /^(s[ií]|x|1|true|yes|ok)$/i.test(String(v ?? '').trim())
const mesLabel = p => new Date(p + 'T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })

export default function Presupuesto({ goTo }) {
  const { db, all, insertar, actualizar, borrar, insertarVarios, rpc, nombreCuenta, nombreMiembro, espacioDe } = useData(); const ix = useIndices()
  const { esPersonal, miembros, userId, personal, espacio } = useAuth()
  const [periodo, setPeriodo] = useState(primeroDelMes())
  const [vista, setVista] = useState('todos'); const [modal, setModal] = useState(null); const [programar, setProgramar] = useState(null); const [fp, sfp, setFp] = useForm({ periodicidad: 'Mensual', vencimiento: '' }); const [search, setSearch] = useState(''); const [importar, setImportar] = useState(false); const [copiar, setCopiar] = useState(false)
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
  const del = async id => { if (window.confirm('¿Eliminar este rubro?')) { try { await borrar('presupuesto', id) } catch (e) { alert(e.message) } } }
  const abrirProgramar = p => { setFp({ periodicidad: p.periodicidad || 'Mensual', vencimiento: p.fecha_tentativa || periodo }); setProgramar(p) }
  const confirmarProgramar = async () => { try { await rpc('programar_presupuesto', { p_id: programar.id, p_periodicidad: fp.periodicidad, p_vencimiento: fp.vencimiento || null }); setProgramar(null) } catch (e) { alert(e.message) } }
  const desprogramar = async p => { if (!window.confirm('¿Desprogramar este rubro? Se borra la obligación pendiente en Programado y el rubro vuelve a Planificado.')) return; try { await rpc('desprogramar_presupuesto', { p_id: p.id }) } catch (e) { alert(e.message) } }
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
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} style={{ ...sel, flex: 1, fontWeight: 700 }}>{periodos.map(p => { const l = mesLabel(p); return <option key={p} value={p}>{l[0].toUpperCase() + l.slice(1)}{p === primeroDelMes() ? ' (actual)' : ''}</option> })}</select>
        {pce.length === 0 && db.presupuesto.some(p => p.periodo === addMonths(periodo, -1)) && <SmallBtn onClick={() => setCopiar(true)} bg="#F3F1F8" color="#4B1D9E"><Icon name="refresh" size={12} />Copiar mes anterior</SmallBtn>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <Kpi label="Presupuestado" value={fmtCOP(tP)} color="#4B1D9E" /><Kpi label="Ejecutado" value={fmtCOP(tE)} color="#0F6E8C" /><Kpi label="Diferencia" value={fmtCOP(tP - tE)} color={tP - tE >= 0 ? '#138A5B' : '#B42318'} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="Buscar…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inp, flex: 1 }} />
        <button onClick={() => setImportar(true)} title="Importar CSV" style={{ background: '#fff', color: '#4B1D9E', border: '1.5px solid #EBE9F1', borderRadius: 20, padding: '9px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="upload" size={18} /></button>
        <PrimaryBtn onClick={() => { setForm(empty); setModal('add') }}><Icon name="plus" size={18} sw={2.2} /></PrimaryBtn>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <PBtn active={vista === 'todos'} onClick={() => setVista('todos')}>Todos</PBtn><PBtn active={vista === 'proximos'} onClick={() => setVista('proximos')}>7 días</PBtn>{!esPersonal && <PBtn active={vista === 'pagador'} onClick={() => setVista('pagador')}>Pagador</PBtn>}<PBtn active={vista === 'grupo'} onClick={() => setVista('grupo')}>Grupo</PBtn>
      </div>
      {esPersonal && Object.keys(planAportes).length > 0 && <Card style={{ background: '#F3F1F8', border: '1px solid #D9D2EA' }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#36146F', marginBottom: 6 }}><IcoText name="arrow-right" size={13}>Aportes planificados a mis espacios · {fmtCOP(totalPlanAportes)}</IcoText></div>
        <div style={{ fontSize: 10, color: '#6E6E73', marginBottom: 8 }}>Vienen de los rubros de cada espacio compartido asignados a ti. Se ejecutan con lo que pagas desde tus cuentas.</div>
        {Object.entries(planAportes).map(([eid, plan]) => { const real = realAportes[eid]?.aportes || 0; const pct = plan > 0 ? Math.round(real / plan * 100) : 0; return <div key={eid} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><b>{espacioDe(eid)?.nombre || '—'}</b><span>{fmtCOP(real)} / {fmtCOP(plan)}</span></div>
          <div style={{ background: '#D9D2EA', borderRadius: 99, height: 6, marginTop: 4 }}><div style={{ height: 6, borderRadius: 99, background: pct > 100 ? '#B42318' : '#4B1D9E', width: `${Math.min(pct, 100)}%` }} /></div>
        </div> })}
      </Card>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && <Card style={{ textAlign: 'center', color: '#9A9AA0', fontSize: 13, padding: 30 }}>Sin rubros en {mesLabel(periodo)}.</Card>}
        {items.map(p => { const cat = ix.cat[p.categoria_id]; const prog = !!p.programado_id; const oc = prog ? db.programado.find(x => x.id === p.programado_id) : null; return (
          <div key={p.id} data-item={p.concepto} style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', border: '1px solid #EBE9F1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ flex: 1, paddingRight: 8, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#1B1B1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.concepto}</div>
                <div style={{ fontSize: 11, color: '#6E6E73', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>{!esPersonal && <span><Icon name="user" size={10} style={{ marginRight: 3 }} />{p.pagador_id ? nombreMiembro(p.pagador_id) : 'sin pagador'} ·</span>} {cat?.nombre || '—'} {cat && <Badge val={cat.grupo} map={GCLS} />} · {fmtDate(p.fecha_tentativa)}</div>
                {prog && <div style={{ fontSize: 11, color: T.morado, fontWeight: 700, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="calendar" size={11} />Programado {p.periodicidad ? p.periodicidad.toLowerCase() : ''}{oc ? ` · vence ${fmtDate(oc.vencimiento)}` : ''} · se paga desde Programado</div>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontWeight: 800, fontSize: 14, color: '#1B1B1F' }}>{fmtCOP(p.monto)}</div><Badge val={p.estado} map={ECLS} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1, background: '#EBE9F1', borderRadius: 99, height: 6 }}><div style={{ height: 6, borderRadius: 99, background: p.pct > 100 ? '#B42318' : p.pct > 80 ? '#9A5B00' : '#138A5B', width: `${Math.min(p.pct, 100)}%` }} /></div>
              <span style={{ fontSize: 10, color: '#6E6E73', minWidth: 32 }}>{p.pct}%</span><span style={{ fontSize: 10, color: '#0F6E8C' }}>{fmtCOP(p.ejecutado)}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {prog ? <>
                <button onClick={() => goTo('programado')} style={{ flex: 1, fontSize: 12, background: '#fff', color: T.morado, border: `1.5px solid ${T.morado}`, borderRadius: 18, height: 34, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Icon name="calendar" size={12} />Ver en Programado</button>
                <SmallBtn onClick={() => desprogramar(p)} bg="#fff" color={T.gris}>Desprogramar</SmallBtn>
              </> : <>
                {p.estado !== 'Pagado' && p.estado !== 'Cancelado' && <SmallBtn onClick={() => abrirProgramar(p)} bg={T.morado} color="#fff"><Icon name="calendar" size={12} />Programar</SmallBtn>}
                {p.estado !== 'Pagado' && <button onClick={() => markPaid(p)} style={{ flex: 1, fontSize: 12, background: '#fff', color: T.verde, border: `1.5px solid ${T.verde}`, borderRadius: 18, height: 34, cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}><Icon name="check" size={12} />Pagado</button>}
                <SmallBtn onClick={() => { setForm({ ...p, monto: String(p.monto) }); setModal(p) }} bg="#fff" color={T.morado}><Icon name="pencil" size={13} /></SmallBtn>
                <SmallBtn onClick={() => del(p.id)} bg="#fff" color={T.rojo}><Icon name="trash" size={13} /></SmallBtn>
              </>}
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
          <Field label="Estado"><select value={form.estado || ''} onChange={e => sf('estado', e.target.value)} style={sel}>{ESTADOS_P.filter(x => x !== 'Programado').map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Notas" full><input value={form.notas || ''} onChange={e => sf('notas', e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={save}>Guardar</SaveBtn></div>
      </Modal>}

      {programar && <Modal title={`Programar · ${programar.concepto}`} onClose={() => setProgramar(null)}>
        <Aviso tipo="info">Se crea la obligación en Programado por <b>{fmtCOP(programar.monto)}</b>{programar.cuenta_id && ix.cta[programar.cuenta_id] ? ` desde ${nombreCuenta(ix.cta[programar.cuenta_id])}` : ''}. Desde ahora el rubro se paga allá; cada pago cierra el rubro del mes y deja listo el del mes siguiente.</Aviso>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <Field label="Se repite"><select value={fp.periodicidad} onChange={e => sfp('periodicidad', e.target.value)} style={sel}>{PERIODICIDADES.map(x => <option key={x} value={x}>{x === 'Puntual' ? 'Una sola vez' : x}</option>)}</select></Field>
          <Field label="Primer vencimiento"><input type="date" value={fp.vencimiento || ''} onChange={e => sfp('vencimiento', e.target.value)} style={inp} /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setProgramar(null)} /><SaveBtn onClick={confirmarProgramar}>Programar</SaveBtn></div>
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
  const { db, insertar, insertarVarios, rpc, nombreCuenta } = useData(); const { esPersonal, miembros } = useAuth()
  const [parsed, setParsed] = useState(null); const [err, setErr] = useState(''); const [crear, setCrear] = useState(true); const fileRef = useRef()
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== 'Tarjeta crédito')
  const plantilla = () => descargar('plantilla-presupuesto.csv', toCSV([CSV_COLS, ['Arriendo apto', miembros[0]?.nombre || '', 'Arriendo', '2200000', fmtDate(periodo).replace(/^01/, '05'), 'Planificado', cuentasCaja[0]?.nombre || '', '', periodo.slice(0, 7), 'sí', 'Mensual', fmtDate(periodo).replace(/^01/, '05')], ['Mercado semana 1', miembros[0]?.nombre || '', 'Mercado', '350000', '', 'Planificado', '', 'Éxito', periodo.slice(0, 7), 'no', '', '']]))
  const leer = async file => {
    setErr('')
    try {
      const text = await leerArchivoTexto(file); const { rows, delim } = parseCSV(text)
      if (rows.length < 2) throw new Error('El archivo no tiene filas de datos.')
      const head = rows[0].map(norm)
      const alias = { concepto: ['concepto', 'rubro', 'nombre', 'descripcion', 'detalle'], pagador: ['pagador', 'quien paga', 'paga', 'responsable', 'entidad', 'persona', 'quien'], categoria: ['categoria', 'cat'], monto: ['monto', 'valor', 'presupuestado', 'importe', 'total'], fecha: ['fecha', 'fecha tentativa', 'vencimiento', 'dia'], estado: ['estado', 'status'], cuenta: ['cuenta', 'metodo de pago', 'medio', 'banco'], notas: ['notas', 'nota', 'observaciones'], periodo: ['periodo', 'mes', 'mes presupuesto', 'periodo presupuesto'], programar: ['programar', 'programable', 'programado', 'recurrente', 'automatico'], periodicidad: ['periodicidad', 'frecuencia', 'repite', 'se repite'], vencimiento: ['vencimiento', 'primer vencimiento', 'fecha vencimiento', 'vence'] }
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
        const perRaw = String(get(r, 'periodo')).trim(); let per = periodo
        if (perRaw) { const pf = parseFecha(perRaw) || parseFecha('01/' + perRaw.replace(/[-.]/g, '/')) || (/^\d{4}-\d{2}$/.test(perRaw) ? perRaw + '-01' : null); if (pf) per = pf.slice(0, 7) + '-01'; else w.push(`Periodo "${perRaw}" no reconocido → ${mesLabel(periodo)}`) }
        const programar = esSi(get(r, 'programar')); let periodicidad = matchOpt(get(r, 'periodicidad'), PERIODICIDADES) || null
        if (programar && !periodicidad) { periodicidad = 'Mensual'; if (String(get(r, 'periodicidad')).trim()) w.push('Periodicidad no reconocida → Mensual') }
        if (programar && ['Pagado', 'Cancelado'].includes(estado)) w.push('Un rubro pagado/cancelado no se programa')
        const vencRaw = String(get(r, 'vencimiento')).trim(); const venc = parseFecha(vencRaw) || null; if (vencRaw && !venc) w.push('Vencimiento no reconocido → fecha tentativa')
        const ctaRaw = String(get(r, 'cuenta')).trim(); let cta = matchOpt(ctaRaw, cuentasCaja, x => x.nombre) || matchOpt(ctaRaw, cuentasCaja, x => nombreCuenta(x)); if (!cta && ctaRaw) { if (esPersonal) { nuevos.cta.add(ctaRaw); w.push(`Cuenta nueva: ${ctaRaw}`) } else w.push(`Cuenta "${ctaRaw}" no está habilitada aquí; queda vacía`) }
        return { n: i + 2, concepto, monto, ent, entRaw, cat, catRaw, cta, ctaRaw, fecha, estado, notas: String(get(r, 'notas')).trim(), per, programar: programar && !['Pagado', 'Cancelado'].includes(estado), periodicidad, venc, w, e }
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
    const creados = await insertarVarios('presupuesto', validos.map(x => ({ periodo: x.per, concepto: x.concepto, monto: x.monto, fecha_tentativa: x.fecha === periodo && x.per !== periodo ? x.per : x.fecha, estado: x.estado, notas: x.notas, pagador_id: x.ent?.user_id || null, categoria_id: x.cat?.id || mapC[norm(x.catRaw)] || null, cuenta_id: x.cta?.id || mapK[norm(x.ctaRaw)] || null })))
    const aProgramar = validos.map((x, i) => [x, creados?.[i]]).filter(([x, c]) => x.programar && c?.id)
    const fallos = []
    for (const [x, c] of aProgramar) { try { await rpc('programar_presupuesto', { p_id: c.id, p_periodicidad: x.periodicidad, p_vencimiento: x.venc || null }) } catch (e) { fallos.push(`${x.concepto}: ${e.message}`) } }
    if (fallos.length) alert('Importado, pero no se pudieron programar:\n' + fallos.join('\n'))
    onClose()
  }
  return (
    <Modal title={`Importar presupuesto · ${mesLabel(periodo)}`} onClose={onClose}>
      {!parsed ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Aviso tipo="info">CSV con columnas <b>concepto</b> y <b>monto</b> (obligatorias) y opcionales <code>{esPersonal ? '' : 'pagador, '}categoria, fecha, estado, cuenta, notas, periodo, programar, periodicidad, vencimiento</code>. <b>periodo</b> (MM/AAAA) permite cargar todo el año en un solo archivo; sin esa columna todo entra en {mesLabel(periodo)}. <b>programar = sí</b> crea la obligación en Programado con la <b>periodicidad</b> indicada (Mensual por defecto). Acepta <code>1.200.000</code> y fechas <code>DD/MM/AAAA</code>.</Aviso>
        <button onClick={plantilla} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, border: '1px solid #D9D2EA', borderRadius: 12, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#1B1B1F' }}><Icon name="download" size={16} />Descargar plantilla CSV</button>
        <div onClick={() => fileRef.current.click()} style={{ border: '2px dashed #D9D2EA', borderRadius: 14, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: '#F3F1F8' }}>
          <div style={{ color: '#4B1D9E', marginBottom: 8 }}><Icon name="upload" size={30} sw={1.5} /></div><div style={{ fontWeight: 700, fontSize: 14, color: '#36146F' }}>Toca para elegir el archivo</div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) leer(f); e.target.value = '' }} />
        </div>
        {err && <Aviso tipo="err">{err}</Aviso>}
      </div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}><Kpi value={validos.length} label="Válidas" color="#138A5B" /><Kpi value={validos.filter(x => x.w.length).length} label="Con avisos" color="#9A5B00" /><Kpi value={parsed.items.length - validos.length} label="Con errores" color="#B42318" /></div>
        {(parsed.nuevos.ent.length + parsed.nuevos.cat.length + parsed.nuevos.cta.length) > 0 && <Aviso tipo="warn"><label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={crear} onChange={e => setCrear(e.target.checked)} /><span>Crear lo que no existe: {[...parsed.nuevos.ent, ...parsed.nuevos.cat, ...parsed.nuevos.cta].join(', ')}</span></label></Aviso>}
        <div style={{ border: '1px solid #EBE9F1', borderRadius: 12, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
          {parsed.items.map(x => <div key={x.n} style={{ padding: '8px 10px', borderBottom: '1px solid #F3F1F8', background: x.e.length ? '#fff5f5' : x.w.length ? '#FBF0DA' : '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: x.e.length ? '#B42318' : '#1B1B1F' }}><span style={{ color: '#9A9AA0', fontWeight: 500 }}>#{x.n} </span>{x.concepto || '(sin concepto)'}</div>
              <div style={{ fontSize: 10, color: '#6E6E73' }}>{esPersonal ? '' : (x.ent?.nombre || x.entRaw || 'sin pagador') + ' · '}{x.cat?.nombre || x.catRaw || '—'} · {fmtDate(x.fecha)}{x.per !== periodo ? ` · ${mesLabel(x.per)}` : ''}{x.programar ? ` · se programa ${x.periodicidad.toLowerCase()}` : ''}</div>
              {x.e.map((m, i) => <div key={i} style={{ fontSize: 10, color: '#B42318' }}>✕ {m}</div>)}{x.w.map((m, i) => <div key={i} style={{ fontSize: 10, color: '#9A5B00' }}>· {m}</div>)}</div>
              <div style={{ fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{isNaN(x.monto) ? '—' : fmtCOP(x.monto)}</div></div>
          </div>)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}><CancelBtn onClick={() => setParsed(null)} /><SaveBtn onClick={confirmar} disabled={!validos.length}>Importar {validos.length}</SaveBtn></div>
      </div>}
    </Modal>
  )
}
