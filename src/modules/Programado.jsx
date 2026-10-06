import { useState, useEffect, useRef } from 'react'
import { useData, useIndices } from '../lib/data'
import { Kpi, Card, Icon, IcoText, Modal, Field, inp, sel, PBtn, SaveBtn, CancelBtn, SmallBtn, PrimaryBtn, Aviso, BarChartCJ, useForm } from '../lib/ui'
import { fmtCOP, fmtDate, today, addDays, addMonths, daysLeft, TC, TIPOS_PROG, PERIODICIDADES } from '../lib/util'
import { parseCSV, parseMonto, parseFecha, matchOpt, toCSV, descargar, leerArchivoTexto, norm } from '../lib/csv'

const PICO = { Impuesto: 'receipt', Seguro: 'shield', Mantenimiento: 'wrench', 'Cuota crédito': 'card', Servicio: 'wifi', Suscripción: 'refresh', Nómina: 'user', Honorarios: 'dollar', Arriendo: 'home', Otro: 'pin' }

export default function Programado() {
  const { db, insertar, actualizar, borrar, rpc } = useData(); const ix = useIndices()
  const [flujo, setFlujo] = useState('salida'); const [vista, setVista] = useState('pendientes'); const [modal, setModal] = useState(null); const [ficha, setFicha] = useState(null); const [completar, setCompletar] = useState(null); const [importar, setImportar] = useState(false)
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const empty = f => ({ flujo: f, tipo: f === 'ingreso' ? 'Honorarios' : 'Servicio', nombre: '', entidad_id: db.entidades[0]?.id || null, categoria_id: db.categorias.find(c => f === 'ingreso' ? c.nombre === 'Honorarios' : c.nombre === 'Servicios públicos')?.id || db.categorias[0]?.id || null, activo_id: null, cuenta_id: cuentasCaja[0]?.id || null, deuda_id: null, monto: '', periodicidad: 'Mensual', vencimiento: addDays(today(), 7), ficha_url: '', ficha_usuario: '', ficha_referencia: '', ficha_instrucciones: '', ficha_valores: {}, notas: '' })
  const [form, sf, setForm] = useForm(empty('salida'))
  const t = today(), t30 = addDays(t, 30)
  const todos = db.programado.filter(p => p.flujo === flujo)
  let items = vista === 'pendientes' ? todos.filter(p => p.estado === 'Pendiente') : vista === 'historial' ? todos.filter(p => p.estado !== 'Pendiente') : todos
  items = [...items].sort((a, b) => vista === 'historial' ? (b.completado_en || b.vencimiento).localeCompare(a.completado_en || a.vencimiento) : a.vencimiento.localeCompare(b.vencimiento))
  const pend = todos.filter(p => p.estado === 'Pendiente')
  const vencidas = pend.filter(p => p.vencimiento < t).length, carga30 = pend.filter(p => p.vencimiento <= t30).reduce((a, p) => a + +p.monto, 0)
  const mesData = (() => { const m = {}; for (let i = 0; i < 6; i++) { const k = addMonths(t, i).slice(0, 7); m[k] = { mes: `${k.slice(5)}/${k.slice(2, 4)}`, salidas: 0, ingresos: 0 } } db.programado.filter(p => p.estado === 'Pendiente').forEach(p => { const k = p.vencimiento.slice(0, 7); if (m[k]) m[k][p.flujo === 'ingreso' ? 'ingresos' : 'salidas'] += +p.monto }); return Object.values(m) })()

  const save = async () => {
    if (!form.nombre || !form.monto) return
    const row = { flujo: form.flujo, tipo: form.tipo, nombre: form.nombre, entidad_id: form.entidad_id || null, categoria_id: form.categoria_id || null, activo_id: form.activo_id || null, cuenta_id: form.cuenta_id || null, deuda_id: form.deuda_id || null, monto: parseMonto(form.monto), periodicidad: form.periodicidad, vencimiento: form.vencimiento, ficha_url: form.ficha_url || null, ficha_usuario: form.ficha_usuario || null, ficha_referencia: form.ficha_referencia || null, ficha_instrucciones: form.ficha_instrucciones || null, ficha_valores: form.ficha_valores || {}, notas: form.notas || null, ...(modal === 'add' ? { estado: 'Pendiente' } : {}) }
    modal === 'add' ? await insertar('programado', row) : await actualizar('programado', modal.id, row); setModal(null)
  }
  const omitir = async p => { if (!window.confirm('¿Omitir esta ocurrencia? No se registra movimiento y se crea la siguiente.')) return; await actualizar('programado', p.id, { estado: 'Omitido', completado_en: t }); if (p.periodicidad !== 'Puntual') { const { id, creado_por, creado_en, actualizado_por, actualizado_en, hogar_id, movimiento_id, completado_en, estado, ...rest } = p; await insertar('programado', { ...rest, vencimiento: siguiente(p.vencimiento, p.periodicidad), estado: 'Pendiente' }) } }
  const deshacer = async p => { if (!window.confirm('¿Deshacer? Se borra el movimiento y la siguiente ocurrencia pendiente.')) return; await rpc('deshacer_programado', { p_id: p.id }) }
  const eliminarSerie = async p => { const n = db.programado.filter(x => x.serie_id === p.serie_id && x.estado === 'Pendiente').length; if (!window.confirm(`¿Eliminar esta obligación? Se borran ${n} ocurrencia(s) pendiente(s); el historial completado se conserva.`)) return; for (const x of db.programado.filter(x => x.serie_id === p.serie_id && x.estado === 'Pendiente')) await borrar('programado', x.id) }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', background: '#ede9fe', borderRadius: 12, padding: 4 }}>
        {[['salida', 'Obligaciones', 'trending-down'], ['ingreso', 'Ingresos', 'dollar']].map(([k, l, i]) => <button key={k} onClick={() => setFlujo(k)} style={{ flex: 1, padding: '9px', borderRadius: 9, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, background: flujo === k ? '#fff' : 'transparent', color: flujo === k ? '#7c3aed' : '#6d28d9', boxShadow: flujo === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}><IcoText name={i} size={14}>{l}</IcoText></button>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}><Kpi icon="alert" value={vencidas} label={flujo === 'ingreso' ? 'Cobros vencidos' : 'Pagos vencidos'} color={vencidas ? '#dc2626' : '#059669'} /><Kpi icon="dollar" value={fmtCOP(carga30)} label={flujo === 'ingreso' ? 'Por cobrar 30 días' : 'Por pagar 30 días'} color={flujo === 'ingreso' ? '#059669' : '#7c3aed'} /></div>
      <Card><div style={{ fontWeight: 700, fontSize: 12, color: '#374151', marginBottom: 10 }}>Flujo programado · próximos 6 meses</div><BarChartCJ labels={mesData.map(x => x.mes)} datasets={[{ label: 'Ingresos', data: mesData.map(x => x.ingresos), backgroundColor: '#10b981', borderRadius: 4 }, { label: 'Obligaciones', data: mesData.map(x => x.salidas), backgroundColor: '#7c3aed', borderRadius: 4 }]} height={150} /></Card>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 5 }}><PBtn active={vista === 'pendientes'} onClick={() => setVista('pendientes')}>Pendientes</PBtn><PBtn active={vista === 'historial'} onClick={() => setVista('historial')}>Historial</PBtn></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setImportar(true)} title="Importar CSV" style={{ background: '#fff', color: '#7c3aed', border: '1px solid #c4b5fd', borderRadius: 10, padding: '9px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}><Icon name="upload" size={18} /></button>
          <PrimaryBtn onClick={() => { setForm(empty(flujo)); setModal('add') }}><Icon name="plus" size={18} sw={2.2} /></PrimaryBtn>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.length === 0 && <Card style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 30 }}>{vista === 'historial' ? 'Sin historial todavía.' : flujo === 'ingreso' ? 'Programa tus ingresos fijos: honorarios, salario, arriendos que recibes…' : 'Programa tus obligaciones recurrentes.'}</Card>}
        {items.map(p => { const d = daysLeft(p.vencimiento); const ing = p.flujo === 'ingreso'; const pendiente = p.estado === 'Pendiente'; const tieneFicha = p.ficha_url || p.ficha_usuario || p.ficha_referencia || p.ficha_instrucciones || Object.keys(p.ficha_valores || {}).length || db.programado_adjuntos.some(a => a.programado_id === p.id); return (
          <div key={p.id} style={{ background: '#fff', borderRadius: 14, padding: '12px 14px', border: '1px solid #f0f0f0', opacity: pendiente ? 1 : 0.75 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ background: ing ? 'linear-gradient(135deg,#059669,#047857)' : 'linear-gradient(135deg,#7c3aed,#6d28d9)', borderRadius: 10, padding: '9px 11px', color: '#fff', flexShrink: 0 }}><Icon name={PICO[p.tipo] || 'pin'} size={18} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#111' }}>{p.nombre}</div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{ix.ent[p.entidad_id]?.nombre || '—'}{p.activo_id ? ` · ${ix.act[p.activo_id]?.nombre}` : ''} · {p.periodicidad} · {ix.cta[p.cuenta_id]?.nombre || '—'}</div>
                {tieneFicha && <button onClick={() => setFicha(p)} style={{ marginTop: 4, fontSize: 10, background: '#f5f3ff', color: '#6d28d9', border: '1px solid #e9d5ff', borderRadius: 7, padding: '3px 8px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="file" size={11} />Ver ficha de pago</button>}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14, color: ing ? '#059669' : '#111' }}>{ing ? '+' : ''}{fmtCOP(p.monto)}</div>
                {pendiente ? <span style={{ background: d < 0 ? '#fee2e2' : d <= 7 ? '#fef3c7' : '#f0fdf4', color: d < 0 ? '#991b1b' : d <= 7 ? '#92400e' : '#065f46', padding: '2px 7px', borderRadius: 9, fontSize: 10, fontWeight: 700 }}>{d < 0 ? `Vencido ${-d}d` : d === 0 ? 'Hoy' : `${d}d · ${fmtDate(p.vencimiento)}`}</span>
                  : <span style={{ background: p.estado === 'Completado' ? '#d1fae5' : '#f1f5f9', color: p.estado === 'Completado' ? '#065f46' : '#64748b', padding: '2px 7px', borderRadius: 9, fontSize: 10, fontWeight: 700 }}>{p.estado} {fmtDate(p.completado_en)}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              {pendiente && <SmallBtn onClick={() => setCompletar(p)} bg={ing ? '#059669' : '#7c3aed'} color="#fff"><Icon name="check" size={12} />{ing ? 'Cobrar' : 'Pagar'}</SmallBtn>}
              {pendiente && <SmallBtn onClick={() => omitir(p)} bg="#f1f5f9" color="#64748b">Omitir</SmallBtn>}
              {p.estado === 'Completado' && <SmallBtn onClick={() => deshacer(p)} bg="#fef3c7" color="#92400e">Deshacer</SmallBtn>}
              {pendiente && <SmallBtn onClick={() => { setForm({ ...p, monto: String(p.monto), ficha_valores: p.ficha_valores || {} }); setModal(p) }} bg="#ede9fe" color="#7c3aed"><Icon name="pencil" size={12} /></SmallBtn>}
              {pendiente && <SmallBtn onClick={() => eliminarSerie(p)} bg="#fee2e2" color="#dc2626"><Icon name="trash" size={12} /></SmallBtn>}
            </div>
          </div>) })}
      </div>

      {modal && <FormProgramado form={form} sf={sf} setForm={setForm} modal={modal} onClose={() => setModal(null)} onSave={save} />}
      {ficha && <FichaPago p={ficha} onClose={() => setFicha(null)} onCompletar={() => { setFicha(null); setCompletar(ficha) }} />}
      {completar && <CompletarModal p={completar} onClose={() => setCompletar(null)} />}
      {importar && <ImportarProgramado flujo={flujo} onClose={() => setImportar(false)} />}
    </div>
  )
}

const PCSV_COLS = ['nombre', 'monto', 'periodicidad', 'vencimiento', 'tipo', 'entidad', 'categoria', 'cuenta', 'activo', 'enlace', 'usuario', 'referencia', 'instrucciones', 'notas']

function ImportarProgramado({ flujo, onClose }) {
  const { db, insertar, insertarVarios } = useData()
  const ing = flujo === 'ingreso'
  const [parsed, setParsed] = useState(null); const [err, setErr] = useState(''); const [crear, setCrear] = useState(true); const fileRef = useRef()
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const ent0 = db.entidades[0]?.nombre || 'Familia', cta0 = cuentasCaja[0]?.nombre || ''
  const plantilla = () => descargar(ing ? 'plantilla-ingresos-programados.csv' : 'plantilla-obligaciones.csv', toCSV([PCSV_COLS, ...(ing
    ? [['Honorarios Kontbox', '8500000', 'Mensual', fmtDate(addDays(today(), 10)), 'Honorarios', ent0, 'Honorarios', cta0, '', '', '', '', '', ''], ['Arriendo local', '1800000', 'Mensual', fmtDate(addDays(today(), 5)), 'Arriendo', ent0, 'Otro', cta0, '', '', '', '', '', '']]
    : [['Internet Claro', '95000', 'Mensual', fmtDate(addDays(today(), 7)), 'Servicio', ent0, 'Servicios públicos', cta0, '', 'https://www.claro.com.co', 'andres@correo.com', '123456789', 'PSE, opción Pago de factura', ''], ['SOAT Mazda', '650000', 'Anual', fmtDate(addMonths(today(), 3)), 'Seguro', ent0, 'Otro', cta0, 'Mazda', '', '', '', '', 'Comparar precio en Suramericana y Bolívar']])]))
  const leer = async file => {
    setErr('')
    try {
      const text = await leerArchivoTexto(file); const { rows, delim } = parseCSV(text)
      if (rows.length < 2) throw new Error('El archivo no tiene filas de datos.')
      const head = rows[0].map(norm)
      const alias = { nombre: ['nombre', 'concepto', 'obligacion', 'ingreso', 'descripcion', 'detalle'], monto: ['monto', 'valor', 'importe', 'total', 'cuota'], periodicidad: ['periodicidad', 'frecuencia', 'recurrencia', 'periodo'], vencimiento: ['vencimiento', 'fecha', 'proximo vencimiento', 'proximo cobro', 'fecha de pago', 'fecha de cobro', 'dia'], tipo: ['tipo', 'clase'], entidad: ['entidad', 'persona', 'quien', 'beneficiario'], categoria: ['categoria', 'cat'], cuenta: ['cuenta', 'cuenta de pago', 'metodo de pago', 'medio', 'banco'], activo: ['activo', 'bien', 'vehiculo'], enlace: ['enlace', 'url', 'link', 'enlace de pago', 'pagina'], usuario: ['usuario', 'user', 'login'], referencia: ['referencia', 'contrato', 'numero de contrato', 'convenio', 'ref'], instrucciones: ['instrucciones', 'como pagar', 'pasos'], notas: ['notas', 'nota', 'observaciones'] }
      const idx = {}; PCSV_COLS.forEach(c => { idx[c] = head.findIndex(h => alias[c].includes(h)); if (idx[c] < 0) idx[c] = head.findIndex(h => alias[c].some(a => h.includes(a))) })
      if (idx.nombre < 0 || idx.monto < 0) throw new Error(`No encontré las columnas obligatorias "nombre" y "monto". Encabezados: ${rows[0].join(' | ')}`)
      const get = (r, c) => idx[c] >= 0 ? String(r[idx[c]] ?? '').trim() : ''
      const nuevos = { ent: new Set(), cat: new Set(), cta: new Set() }
      const tipoDef = ing ? 'Honorarios' : 'Servicio'
      const items = rows.slice(1).filter(r => r.some(v => String(v ?? '').trim())).map((r, i) => {
        const w = [], e = []
        const nombre = get(r, 'nombre'); if (!nombre) e.push('Sin nombre')
        const monto = parseMonto(get(r, 'monto')); if (isNaN(monto) || monto <= 0) e.push('Monto inválido')
        const perRaw = get(r, 'periodicidad'); let periodicidad = matchOpt(perRaw, PERIODICIDADES); if (!periodicidad) { periodicidad = 'Mensual'; if (perRaw) w.push(`Periodicidad "${perRaw}" no reconocida → Mensual`); else w.push('Sin periodicidad → Mensual') }
        const venRaw = get(r, 'vencimiento'); let vencimiento = parseFecha(venRaw); if (!vencimiento) { if (venRaw) e.push(`Fecha "${venRaw}" no reconocida (usa DD/MM/AAAA)`); else e.push(ing ? 'Sin fecha de cobro' : 'Sin fecha de vencimiento') }
        const tipoRaw = get(r, 'tipo'); let tipo = matchOpt(tipoRaw, TIPOS_PROG); if (!tipo) { tipo = tipoDef; if (tipoRaw) w.push(`Tipo "${tipoRaw}" no reconocido → ${tipoDef}`) }
        const entRaw = get(r, 'entidad'); let ent = matchOpt(entRaw, db.entidades, x => x.nombre); if (!ent) { if (entRaw) { nuevos.ent.add(entRaw); w.push(`Entidad nueva: ${entRaw}`) } else { ent = db.entidades[0]; w.push(`Sin entidad → ${ent?.nombre || '—'}`) } }
        const catRaw = get(r, 'categoria'); let cat = matchOpt(catRaw, db.categorias, x => x.nombre); if (!cat) { if (catRaw) { nuevos.cat.add(catRaw); w.push(`Categoría nueva: ${catRaw}`) } else { cat = db.categorias.find(c => c.nombre === (ing ? 'Honorarios' : 'Otro')) || db.categorias[0]; w.push(`Sin categoría → ${cat?.nombre || '—'}`) } }
        const ctaRaw = get(r, 'cuenta'); let cta = matchOpt(ctaRaw, cuentasCaja, x => x.nombre); if (!cta) { if (ctaRaw) { nuevos.cta.add(ctaRaw); w.push(`Cuenta nueva: ${ctaRaw}`) } else { cta = cuentasCaja[0]; w.push(`Sin cuenta → ${cta?.nombre || '—'}`) } }
        const actRaw = get(r, 'activo'); const act = matchOpt(actRaw, db.activos, x => x.nombre); if (actRaw && !act) w.push(`Activo "${actRaw}" no existe; se deja vacío`)
        const enlace = get(r, 'enlace'); if (enlace && !/^https?:\/\//i.test(enlace)) w.push('Enlace sin https:// — se guarda igual')
        return { n: i + 2, nombre, monto, periodicidad, vencimiento, tipo, ent, entRaw, cat, catRaw, cta, ctaRaw, act, enlace, usuario: get(r, 'usuario'), referencia: get(r, 'referencia'), instrucciones: get(r, 'instrucciones'), notas: get(r, 'notas'), w, e }
      })
      if (!items.length) throw new Error('El archivo no tiene filas de datos.')
      setParsed({ items, delim, nuevos: { ent: [...nuevos.ent], cat: [...nuevos.cat], cta: [...nuevos.cta] } })
    } catch (ex) { setErr(ex.message || String(ex)) }
  }
  const validos = parsed ? parsed.items.filter(x => !x.e.length) : []
  const confirmar = async () => {
    const mapE = Object.fromEntries(db.entidades.map(x => [norm(x.nombre), x.id])), mapC = Object.fromEntries(db.categorias.map(x => [norm(x.nombre), x.id])), mapK = Object.fromEntries(cuentasCaja.map(x => [norm(x.nombre), x.id]))
    if (crear) {
      for (const n of parsed.nuevos.ent) { const r = await insertar('entidades', { nombre: n, tipo: 'persona' }); mapE[norm(n)] = r.id }
      for (const n of parsed.nuevos.cat) { const r = await insertar('categorias', { nombre: n, grupo: ing ? 'Variable' : 'Fijo' }); mapC[norm(n)] = r.id }
      for (const n of parsed.nuevos.cta) { const r = await insertar('cuentas', { nombre: n, tipo: 'Bancaria' }); mapK[norm(n)] = r.id }
    }
    await insertarVarios('programado', validos.map(x => ({ flujo, tipo: x.tipo, nombre: x.nombre, monto: x.monto, periodicidad: x.periodicidad, vencimiento: x.vencimiento, estado: 'Pendiente', entidad_id: x.ent?.id || mapE[norm(x.entRaw)] || null, categoria_id: x.cat?.id || mapC[norm(x.catRaw)] || null, cuenta_id: x.cta?.id || mapK[norm(x.ctaRaw)] || null, activo_id: x.act?.id || null, deuda_id: null, ficha_url: x.enlace || null, ficha_usuario: x.usuario || null, ficha_referencia: x.referencia || null, ficha_instrucciones: x.instrucciones || null, ficha_valores: {}, notas: x.notas || null })))
    onClose()
  }
  const total = validos.reduce((a, x) => a + x.monto, 0)
  return (
    <Modal title={ing ? 'Importar ingresos programados' : 'Importar obligaciones'} onClose={onClose}>
      {!parsed ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Aviso tipo="info">CSV con columnas <b>nombre</b>, <b>monto</b> y <b>vencimiento</b> (obligatorias) y opcionales <code>periodicidad, tipo, entidad, categoria, cuenta, activo, enlace, usuario, referencia, instrucciones, notas</code>. Periodicidad: {PERIODICIDADES.join(', ')}. Acepta <code>1.200.000</code> y fechas <code>DD/MM/AAAA</code>. Cada fila queda como la <b>próxima ocurrencia</b>; al {ing ? 'cobrar' : 'pagar'} se genera la siguiente.</Aviso>
        {!ing && <Aviso tipo="warn">La ficha de pago (enlace, usuario, referencia) se importa; las <b>contraseñas no</b>. Si el archivo trae una columna de contraseña, se ignora.</Aviso>}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: x.e.length ? '#991b1b' : '#111' }}><span style={{ color: '#9ca3af', fontWeight: 500 }}>#{x.n} </span>{x.nombre || '(sin nombre)'}</div>
              <div style={{ fontSize: 10, color: '#6b7280' }}>{x.tipo} · {x.periodicidad} · {x.vencimiento ? fmtDate(x.vencimiento) : 'sin fecha'} · {x.ent?.nombre || x.entRaw || '—'} · {x.cta?.nombre || x.ctaRaw || '—'}{x.enlace || x.referencia ? ' · con ficha' : ''}</div>
              {x.e.map((m, i) => <div key={i} style={{ fontSize: 10, color: '#dc2626' }}>✕ {m}</div>)}{x.w.map((m, i) => <div key={i} style={{ fontSize: 10, color: '#b45309' }}>· {m}</div>)}</div>
              <div style={{ fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap', color: ing ? '#059669' : '#111' }}>{isNaN(x.monto) ? '—' : fmtCOP(x.monto)}</div></div>
          </div>)}
        </div>
        <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right' }}>Total a importar: <b>{fmtCOP(total)}</b></div>
        <div style={{ display: 'flex', gap: 10 }}><CancelBtn onClick={() => setParsed(null)} /><SaveBtn onClick={confirmar} disabled={!validos.length}>Importar {validos.length}</SaveBtn></div>
      </div>}
    </Modal>
  )
}

const siguiente = (v, per) => ({ Semanal: addDays(v, 7), Quincenal: addDays(v, 15), Mensual: addMonths(v, 1), Bimestral: addMonths(v, 2), Trimestral: addMonths(v, 3), Semestral: addMonths(v, 6), Anual: addMonths(v, 12) }[per] || v)

function FormProgramado({ form, sf, setForm, modal, onClose, onSave }) {
  const { db } = useData()
  const ing = form.flujo === 'ingreso'; const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const [nk, setNk] = useState(''); const [nv, setNv] = useState('')
  const addValor = () => { if (!nk.trim()) return; setForm(f => ({ ...f, ficha_valores: { ...(f.ficha_valores || {}), [nk.trim()]: nv.trim() } })); setNk(''); setNv('') }
  const delValor = k => setForm(f => { const v = { ...(f.ficha_valores || {}) }; delete v[k]; return { ...f, ficha_valores: v } })
  return (
    <Modal title={modal === 'add' ? (ing ? 'Nuevo ingreso programado' : 'Nueva obligación') : 'Editar'} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Nombre" full><input value={form.nombre} onChange={e => sf('nombre', e.target.value)} style={inp} placeholder={ing ? 'Ej. Honorarios Kontbox, Arriendo local' : 'Ej. SOAT Mazda, Internet Claro'} /></Field>
        <Field label="Tipo"><select value={form.tipo} onChange={e => sf('tipo', e.target.value)} style={sel}>{TIPOS_PROG.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Periodicidad"><select value={form.periodicidad} onChange={e => sf('periodicidad', e.target.value)} style={sel}>{PERIODICIDADES.map(x => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Monto (COP)"><input type="number" inputMode="numeric" value={form.monto} onChange={e => sf('monto', e.target.value)} style={inp} /></Field>
        <Field label={ing ? 'Próximo cobro' : 'Próximo vencimiento'}><input type="date" value={form.vencimiento} onChange={e => sf('vencimiento', e.target.value)} style={inp} /></Field>
        <Field label={ing ? 'Entidad que recibe' : 'Entidad'}><select value={form.entidad_id || ''} onChange={e => sf('entidad_id', e.target.value || null)} style={sel}>{db.entidades.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label="Categoría"><select value={form.categoria_id || ''} onChange={e => sf('categoria_id', e.target.value || null)} style={sel}>{db.categorias.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label={ing ? 'Cuenta donde entra' : 'Cuenta de pago'}><select value={form.cuenta_id || ''} onChange={e => sf('cuenta_id', e.target.value || null)} style={sel}>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
        <Field label="Activo"><select value={form.activo_id || ''} onChange={e => sf('activo_id', e.target.value || null)} style={sel}><option value="">— Ninguno —</option>{db.activos.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></Field>
      </div>
      {!ing && <div style={{ marginTop: 16, background: '#faf5ff', borderRadius: 12, padding: '12px 14px', border: '1px solid #e9d5ff' }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#6d28d9', marginBottom: 4 }}><IcoText name="file">Ficha de pago</IcoText></div>
        <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 10 }}>Todo lo que necesitas a la mano para pagar en un minuto. <b>Nunca guardes contraseñas aquí</b>; usa tu gestor de contraseñas.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Enlace de pago" full><input type="url" value={form.ficha_url || ''} onChange={e => sf('ficha_url', e.target.value)} style={inp} placeholder="https://…" /></Field>
          <Field label="Usuario"><input value={form.ficha_usuario || ''} onChange={e => sf('ficha_usuario', e.target.value)} style={inp} /></Field>
          <Field label="Referencia / N° contrato"><input value={form.ficha_referencia || ''} onChange={e => sf('ficha_referencia', e.target.value)} style={inp} /></Field>
          <Field label="Instrucciones" full><textarea value={form.ficha_instrucciones || ''} onChange={e => sf('ficha_instrucciones', e.target.value)} rows={2} style={{ ...inp, resize: 'vertical' }} placeholder="Ej. Pagar por PSE, opción 'Convenio 1234'…" /></Field>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Otros datos</div>
          {Object.entries(form.ficha_valores || {}).map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '5px 8px', background: '#fff', borderRadius: 8, marginBottom: 4 }}><span><b>{k}:</b> {v}</span><button onClick={() => delValor(k)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 16 }}>×</button></div>)}
          <div style={{ display: 'flex', gap: 6 }}><input value={nk} onChange={e => setNk(e.target.value)} placeholder="Etiqueta (NIT, convenio…)" style={{ ...inp, flex: 1 }} /><input value={nv} onChange={e => setNv(e.target.value)} placeholder="Valor" style={{ ...inp, flex: 1 }} onKeyDown={e => e.key === 'Enter' && addValor()} /><button onClick={addValor} style={{ background: '#6d28d9', color: '#fff', border: 'none', borderRadius: 10, padding: '0 12px', cursor: 'pointer' }}><Icon name="plus" size={14} /></button></div>
        </div>
        {modal !== 'add' && <Adjuntos programadoId={modal.id} />}
        {modal === 'add' && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 8 }}>Las imágenes se adjuntan después de guardar (botón Editar).</div>}
      </div>}
      <div style={{ marginTop: 12 }}><Field label="Notas"><input value={form.notas || ''} onChange={e => sf('notas', e.target.value)} style={inp} /></Field></div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={onClose} /><SaveBtn onClick={onSave} disabled={!form.nombre || !form.monto}>Guardar</SaveBtn></div>
    </Modal>
  )
}

function Adjuntos({ programadoId, soloLectura }) {
  const { db, subirAdjunto, urlAdjunto, borrarAdjunto } = useData()
  const adj = db.programado_adjuntos.filter(a => a.programado_id === programadoId)
  const [urls, setUrls] = useState({}); const [busy, setBusy] = useState(false); const ref = useRef()
  useEffect(() => { adj.forEach(a => { if (!urls[a.id]) urlAdjunto(a.ruta).then(u => setUrls(p => ({ ...p, [a.id]: u }))) }) }, [adj.length])
  const subir = async f => { setBusy(true); try { await subirAdjunto(programadoId, f) } catch (e) { alert('No se pudo subir: ' + e.message) } finally { setBusy(false) } }
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Adjuntos ({adj.length})</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {adj.map(a => <div key={a.id} style={{ position: 'relative', width: 84 }}>
          <a href={urls[a.id]} target="_blank" rel="noreferrer" style={{ display: 'block', width: 84, height: 84, borderRadius: 10, overflow: 'hidden', border: '1px solid #e5e7eb', background: '#f9fafb' }}>{a.mime?.startsWith('image/') && urls[a.id] ? <img src={urls[a.id]} alt={a.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#7c3aed' }}><Icon name="file" size={28} /></div>}</a>
          <div style={{ fontSize: 9, color: '#6b7280', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nombre}</div>
          {!soloLectura && <button onClick={() => { if (window.confirm('¿Eliminar adjunto?')) borrarAdjunto(a) }} style={{ position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: '50%', background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 12, lineHeight: 1 }}>×</button>}
        </div>)}
        {!soloLectura && <button onClick={() => ref.current.click()} disabled={busy} style={{ width: 84, height: 84, borderRadius: 10, border: '2px dashed #c4b5fd', background: '#faf5ff', color: '#7c3aed', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 10 }}><Icon name="upload" size={20} />{busy ? 'Subiendo…' : 'Imagen/PDF'}</button>}
        <input ref={ref} type="file" accept="image/*,application/pdf" capture="environment" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) subir(f); e.target.value = '' }} />
      </div>
    </div>
  )
}

function FichaPago({ p, onClose, onCompletar }) {
  const ix = useIndices(); const ing = p.flujo === 'ingreso'
  const copiar = async v => { try { await navigator.clipboard.writeText(v) } catch { } }
  const Row = ({ l, v, copy }) => v ? <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}><div><div style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', fontWeight: 700 }}>{l}</div><div style={{ fontSize: 14, fontWeight: 600, color: '#111', wordBreak: 'break-all' }}>{v}</div></div>{copy && <button onClick={() => copiar(v)} style={{ fontSize: 11, background: '#f1f5f9', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', color: '#374151', flexShrink: 0 }}>Copiar</button>}</div> : null
  return (
    <Modal title={p.nombre} onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}><div style={{ fontSize: 12, color: '#6b7280' }}>Vence {fmtDate(p.vencimiento)} · {ix.cta[p.cuenta_id]?.nombre || '—'}</div><div style={{ fontWeight: 800, fontSize: 18, color: ing ? '#059669' : '#7c3aed' }}>{fmtCOP(p.monto)}</div></div>
      {p.ficha_url && <a href={p.ficha_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, background: '#7c3aed', color: '#fff', borderRadius: 12, textDecoration: 'none', fontWeight: 700, fontSize: 14, marginBottom: 10 }}><Icon name="arrow-right" size={16} />Ir a pagar</a>}
      <Row l="Usuario" v={p.ficha_usuario} copy /><Row l="Referencia" v={p.ficha_referencia} copy />
      {Object.entries(p.ficha_valores || {}).map(([k, v]) => <Row key={k} l={k} v={v} copy />)}
      {p.ficha_instrucciones && <div style={{ marginTop: 10, background: '#fffbeb', borderRadius: 10, padding: '10px 12px', fontSize: 12, color: '#78350f', whiteSpace: 'pre-wrap' }}>{p.ficha_instrucciones}</div>}
      <Adjuntos programadoId={p.id} soloLectura />
      {p.estado === 'Pendiente' && <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={onClose} /><SaveBtn onClick={onCompletar}>{ing ? 'Ya lo cobré' : 'Ya lo pagué'}</SaveBtn></div>}
    </Modal>
  )
}

function CompletarModal({ p, onClose }) {
  const { db, rpc } = useData(); const ing = p.flujo === 'ingreso'; const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const [fecha, setFecha] = useState(today()); const [monto, setMonto] = useState(String(p.monto)); const [cuenta, setCuenta] = useState(p.cuenta_id || cuentasCaja[0]?.id); const [busy, setBusy] = useState(false)
  const m = parseMonto(monto) || 0; const dif = m - +p.monto
  const go = async () => { setBusy(true); try { await rpc('completar_programado', { p_id: p.id, p_fecha: fecha, p_monto: m, p_cuenta_id: cuenta, p_desglose: dif ? { esperado: +p.monto, diferencia: dif } : {} }); onClose() } catch (e) { alert(e.message) } finally { setBusy(false) } }
  return (
    <Modal title={(ing ? 'Cobrar · ' : 'Pagar · ') + p.nombre} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Fecha"><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} /></Field>
        <Field label={ing ? 'Monto recibido' : 'Monto pagado'}><input type="number" inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} style={{ ...inp, fontWeight: 700 }} /></Field>
        <Field label={ing ? 'Cuenta donde entró' : 'Cuenta de donde salió'} full><select value={cuenta || ''} onChange={e => setCuenta(e.target.value)} style={sel}>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
      </div>
      {dif !== 0 && <div style={{ marginTop: 10 }}><Aviso tipo="warn">Diferencia de {dif > 0 ? '+' : ''}{fmtCOP(dif)} respecto a lo programado ({fmtCOP(p.monto)}). Se registra el valor real.</Aviso></div>}
      <div style={{ marginTop: 10 }}><Aviso tipo="info">Se crea el movimiento en caja{p.periodicidad !== 'Puntual' ? ` y la siguiente ocurrencia queda programada para el ${fmtDate(siguiente(p.vencimiento, p.periodicidad))}` : ''}.</Aviso></div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={onClose} /><SaveBtn onClick={go} disabled={busy || m <= 0}>{busy ? 'Guardando…' : ing ? 'Registrar cobro' : 'Registrar pago'}</SaveBtn></div>
    </Modal>
  )
}
