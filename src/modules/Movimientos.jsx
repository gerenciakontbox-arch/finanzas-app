import { useState, useEffect, useRef } from 'react'
import { useData, useIndices } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Kpi, Card, Icon, IcoText, Modal, Field, inp, sel, PBtn, SaveBtn, CancelBtn, SmallBtn, PrimaryBtn, Aviso, useForm, T } from '../lib/ui'
import { fmtCOP, fmtDate, today, TC } from '../lib/util'
import { indicePagadas, resumenDeuda } from '../lib/finanzas'
import { parseMonto, parseCSV, parseFecha, matchOpt, toCSV, descargar, leerArchivoTexto, norm } from '../lib/csv'
import { esAnticipado, MotivoAnticipo } from './Deudas'
import { EtiquetaPicker, ChipsDe, Chip } from './Etiquetas'

const SUB = { aporte: ['Aporte a', '#4B1D9E', '#F3F1F8'], recibido: ['Recibido de', '#138A5B', '#E7F5EE'], devolucion: ['Devolución de', '#138A5B', '#E7F5EE'], traslado: ['Traslado', '#0F6E8C', '#E6F2F6'] }

export default function Movimientos({ goTo, inicial }) {
  const { db, insertar, actualizar, borrar, rpc, espacioDe, nombreCuenta, duenoCuenta, nombreMiembro, cuentasDe } = useData(); const ix = useIndices()
  const { espacio, esPersonal, userId, miembros, compartidos } = useAuth()
  const [modal, setModal] = useState(false); const [filtro, setFiltro] = useState('todos'); const [mes, setMes] = useState(today().slice(0, 7)); const [anticipo, setAnticipo] = useState(false); const [importar, setImportar] = useState(false); const [etiqueta, setEtiqueta] = useState(null); const [etiquetar, setEtiquetar] = useState(null)   // filtro por etiqueta · movimiento al que se le cambian etiquetas
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const empty = { fecha: today(), tipo: 'Salida', descripcion: '', categoria_id: db.categorias.find(c => c.activa !== false)?.id || null, cuenta_id: cuentasCaja[0]?.id || null, cuenta_destino_id: '', modo_destino: espacio.tipo === 'empresa' ? 'ingreso' : 'devolucion', activo_id: null, presupuesto_id: null, monto: '', deuda_id: '', cuotaN: '', manejo: '', mora: '', seguros: '', otros: '', otrosDetalle: '', aMiembro: false, etiqueta_ids: [] }
  const [form, sf, setForm] = useForm(empty)
  useEffect(() => { if (!inicial) return; if (inicial.filtro) setFiltro(inicial.filtro); if (inicial.etiqueta) setEtiqueta(inicial.etiqueta); if (inicial.nuevo) { setForm(empty); setModal(true) } }, [inicial?._k]) // eslint-disable-line
  const catSel = ix.cat[form.categoria_id]
  const isCreditPay = form.tipo === 'Salida' && catSel?.nombre === 'Cuota crédito'
  const idx = indicePagadas(db.cuotas_pagadas)
  const creditos = db.deudas.filter(d => d.estado === 'Activo')
  const credSel = creditos.find(d => d.id === form.deuda_id); const rCred = credSel ? resumenDeuda(credSel, idx, db.abonos_capital, db.ajustes_saldo_deuda) : null
  const cuotaSel = rCred?.am.find(c => c.n === +form.cuotaN) || null
  const xM = parseMonto(form.manejo) || 0, xMo = parseMonto(form.mora) || 0, xS = parseMonto(form.seguros) || 0, xO = parseMonto(form.otros) || 0
  const totalCred = cuotaSel ? cuotaSel.total + xM + xMo + xS + xO : 0
  const montoNum = parseMonto(form.monto) || 0
  const esTraslado = form.tipo === 'Transferencia'
  // cuentas personales de OTROS miembros habilitadas aquí (para "pagar a un miembro")
  const cuentasMiembros = cuentasCaja.filter(c => { const d = duenoCuenta(c); return d && d !== null })
  const canSave = form.descripcion && (isCreditPay ? !!cuotaSel && !(xO > 0 && !form.otrosDetalle.trim()) : montoNum > 0) && (!esTraslado || (form.cuenta_destino_id && form.cuenta_destino_id !== form.cuenta_id)) && (!form.aMiembro || form.cuenta_destino_id)

  const save = async (motivo = null) => {
    if (!canSave) return
    if (isCreditPay && !motivo && esAnticipado(cuotaSel.fecha)) { setAnticipo(true); return }
    try {
      if (isCreditPay) {
        await rpc('pagar_cuota_credito', { p_deuda: credSel.id, p_numero: cuotaSel.n, p_fecha: form.fecha, p_cuenta: form.cuenta_id || null, p_capital: cuotaSel.capital, p_interes: cuotaSel.interes, p_extras: { cuota_manejo: xM, mora: xMo, seguros: xS, otros: xO, otros_detalle: xO > 0 ? form.otrosDetalle.trim() : undefined }, p_motivo: motivo, p_seguro: cuotaSel.seguro || 0 })
      } else {
        const row = { fecha: form.fecha, tipo: form.tipo, descripcion: form.descripcion, categoria_id: esTraslado ? null : (form.categoria_id || null), cuenta_id: form.cuenta_id || null, activo_id: form.activo_id || null, presupuesto_id: form.presupuesto_id || null, origen: 'manual', monto: montoNum, etiqueta_ids: form.etiqueta_ids || [] }
        if (esTraslado) { row.subtipo = 'traslado'; row.cuenta_destino_id = form.cuenta_destino_id }
        if (form.tipo === 'Salida' && form.aMiembro && form.cuenta_destino_id) { row.cuenta_destino_id = form.cuenta_destino_id; row.modo_destino = form.modo_destino }
        await insertar('movimientos', row)
      }
      setModal(false)
    } catch (e) { alert(e.message) }
  }
  const del = async m => { if (!window.confirm('¿Eliminar este movimiento?' + (m.deuda_id || m.tc_cuenta_id ? ' Las cuotas que pagó quedarán pendientes de nuevo.' : '') + (m.espacio_contraparte && !m.espejo_de ? ' También se elimina su reflejo en el espacio personal del pagador.' : ''))) return; try { await borrar('movimientos', m.id) } catch (e) { alert(e.message) } }

  let items = db.movimientos.filter(m => m.fecha.startsWith(mes)).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado_en || '').localeCompare(a.creado_en || ''))
  if (filtro === 'Aportes') items = items.filter(m => m.tipo === 'Transferencia' && m.subtipo !== 'traslado')
  else if (filtro !== 'todos') items = items.filter(m => m.tipo === filtro)
  if (etiqueta) items = items.filter(m => (m.etiqueta_ids || []).includes(etiqueta))
  const base = db.movimientos.filter(m => m.fecha.startsWith(mes))
  const ing = base.filter(m => m.tipo === 'Ingreso').reduce((a, m) => a + +m.monto, 0), sal = base.filter(m => m.tipo === 'Salida').reduce((a, m) => a + +m.monto, 0)
  const aportes = base.filter(m => m.tipo === 'Transferencia' && m.subtipo === 'aporte').reduce((a, m) => a + +m.monto, 0)
  const recibidos = base.filter(m => m.tipo === 'Transferencia' && (m.subtipo === 'recibido' || m.subtipo === 'devolucion')).reduce((a, m) => a + +m.monto, 0)
  const meses = [...new Set([today().slice(0, 7), ...db.movimientos.map(m => m.fecha.slice(0, 7))])].sort().reverse()
  const hayTC = db.cuentas.some(c => c.tipo === TC)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <select value={mes} onChange={e => setMes(e.target.value)} style={{ ...sel, fontWeight: 700 }}>{meses.map(m => { const l = new Date(m + '-01T12:00:00').toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }); return <option key={m} value={m}>{l[0].toUpperCase() + l.slice(1)}</option> })}</select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
        <Kpi label="Ingresos" value={fmtCOP(ing + (esPersonal ? recibidos : 0))} color="#138A5B" /><Kpi label="Salidas" value={fmtCOP(sal)} color="#B42318" />
        {esPersonal && <Kpi label="Aportes" value={fmtCOP(aportes)} color="#4B1D9E" />}
        <Kpi label="Neto" value={fmtCOP(ing + recibidos - sal - aportes)} color={ing + recibidos - sal - aportes >= 0 ? '#4B1D9E' : '#B42318'} />
      </div>
      {hayTC && <div onClick={() => goTo('deudas')} style={{ cursor: 'pointer' }}><Aviso tipo="info">Las compras con tarjeta se registran dentro de la tarjeta (Deudas). Aquí solo entra el pago de la factura.</Aviso></div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}><PBtn active={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</PBtn><PBtn active={filtro === 'Ingreso'} onClick={() => setFiltro('Ingreso')}>Ingresos</PBtn><PBtn active={filtro === 'Salida'} onClick={() => setFiltro('Salida')}>Salidas</PBtn>{esPersonal && <PBtn active={filtro === 'Aportes'} onClick={() => setFiltro('Aportes')}>Aportes</PBtn>}</div>
        <div style={{ display: 'flex', gap: 8 }}><button onClick={() => setImportar(true)} title="Importar CSV" style={{ background: '#fff', color: T.morado, border: `1.5px solid ${T.divisor}`, borderRadius: 20, width: 40, height: 40, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="upload" size={18} /></button><PrimaryBtn onClick={() => { setForm(empty); setModal(true) }}><Icon name="plus" size={18} sw={2.2} /></PrimaryBtn></div>
      </div>
      {db.etiquetas.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}><span style={{ fontSize: 11, color: T.gris, fontWeight: 600 }}>etiqueta</span>{db.etiquetas.map(e => <Chip key={e.id} e={e} activa={etiqueta === e.id} onClick={() => setEtiqueta(etiqueta === e.id ? null : e.id)} />)}{etiqueta && <span style={{ fontSize: 11, color: T.gris }}>· {items.filter(m => m.tipo === 'Salida').length} salidas · {fmtCOP(items.filter(m => m.tipo === 'Salida').reduce((a, m) => a + +m.monto, 0))}</span>}</div>}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {items.length === 0 && <div style={{ color: '#6E6E73', fontSize: 13, padding: '20px 0' }}>Sin movimientos.</div>}
        {items.map(m => { const rubro = ix.pre[m.presupuesto_id]; const esp = m.espejo_de ? espacioDe(m.espacio_contraparte) : null; const sub = SUB[m.subtipo]; const d = m.desglose || {}; const dx = d.extras || {}; const extras = (d.cuota_manejo || 0) + (d.mora || 0) + (d.seguros || 0) + (d.otros || 0) + (dx.cuota_manejo || 0) + (dx.mora || 0) + (dx.seguros || 0) + (dx.intereses || 0) + (dx.otros || 0); const pag = m.pagador_id && !esPersonal ? nombreMiembro(m.pagador_id) : null; const cta = ix.cta[m.cuenta_id]; const positivo = m.tipo === 'Ingreso' || (m.tipo === 'Transferencia' && (m.subtipo === 'recibido' || m.subtipo === 'devolucion')); return (
          <div key={m.id} style={{ padding: '12px 0', borderBottom: '1px solid #EBE9F1' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#1B1B1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.descripcion}</div>
                <div style={{ fontSize: 12, color: '#6E6E73', marginTop: 2 }}>{m.tipo !== 'Transferencia' ? `${ix.cat[m.categoria_id]?.nombre || '—'} · ` : ''}{fmtDate(m.fecha)} · {cta ? nombreCuenta(cta) : 'cuenta de otro miembro'}{m.subtipo === 'traslado' && ix.cta[m.cuenta_destino_id] ? ` → ${nombreCuenta(ix.cta[m.cuenta_destino_id])}` : ''}</div>
                {esp && <div style={{ fontSize: 10, color: sub?.[1] || '#4B1D9E', marginTop: 2, fontWeight: 700 }}><IcoText name={m.subtipo === 'aporte' ? 'arrow-right' : 'refresh'} size={11} gap={4}>{m.tipo === 'Ingreso' ? 'Ingreso desde' : sub?.[0]} {esp.nombre} · reflejo, se edita allá</IcoText></div>}
                {!m.espejo_de && m.cuenta_destino_id && m.tipo === 'Salida' && <div style={{ fontSize: 10, color: '#138A5B', marginTop: 2 }}><IcoText name="user" size={11} gap={4}>Pago a {nombreMiembro(duenoCuenta(ix.cta[m.cuenta_destino_id]) || '')} ({m.modo_destino === 'ingreso' ? 'ingreso para él' : 'devolución de aporte'})</IcoText></div>}
                {rubro && <div style={{ fontSize: 10, color: '#4B1D9E', marginTop: 1, display: 'flex', alignItems: 'center', gap: 4 }}><Icon name="arrow-right" size={10} />{rubro.concepto}</div>}
                {m.tc_cuenta_id && <div style={{ fontSize: 10, color: '#4B1D9E', marginTop: 3 }}><Icon name="card" size={11} style={{ marginRight: 4 }} />Factura {ix.cta[m.tc_cuenta_id]?.nombre} · {d.items?.length || 0} cuota{d.items?.length !== 1 ? 's' : ''}{extras > 0 && <span style={{ color: '#9A5B00' }}> · extras {fmtCOP(extras)}</span>}{d.diferencia ? <span style={{ color: d.diferencia > 0 ? '#B42318' : '#138A5B' }}> · dif. {d.diferencia > 0 ? '+' : ''}{fmtCOP(d.diferencia)}</span> : null}</div>}
                {m.deuda_id && <div style={{ fontSize: 10, color: '#138A5B', marginTop: 3 }}><Icon name="check" size={11} style={{ marginRight: 4 }} />{ix.deu[m.deuda_id]?.nombre} · cuota {d.cuota} · capital {fmtCOP(d.capital)} · interés {fmtCOP(d.interes)}{extras > 0 && <span style={{ color: '#9A5B00' }}> · extras {fmtCOP(extras)}</span>}</div>}
                {m.programado_id && !m.deuda_id && <div style={{ fontSize: 10, color: '#0F6E8C', marginTop: 3 }}><Icon name="calendar" size={11} style={{ marginRight: 4 }} />Desde programado</div>}
                {m.motivo && <div style={{ fontSize: 10, color: '#9A5B00', marginTop: 3 }}><Icon name="alert" size={11} style={{ marginRight: 4 }} />{m.motivo}</div>}
                <ChipsDe ids={m.etiqueta_ids} />
                <div style={{ fontSize: 11, color: '#9A9AA0', marginTop: 3 }}>{pag ? `Pagó ${pag} · ` : ''}Registró {nombreMiembro(m.creado_por)}</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontWeight: 800, fontSize: 15, color: positivo ? '#138A5B' : '#1B1B1F', fontVariantNumeric: 'tabular-nums' }}>{positivo ? '+ ' : m.subtipo === 'traslado' ? '' : '− '}{fmtCOP(m.monto).replace('$ ', '')}</div><div style={{ color: m.tipo === 'Transferencia' ? '#4B1D9E' : '#6E6E73', fontSize: 11, fontWeight: 700, marginTop: 2 }}>{m.tipo === 'Transferencia' ? (m.subtipo === 'traslado' ? 'Traslado' : m.subtipo === 'aporte' ? 'Aporte' : 'Recibido') : m.tipo}</div></div>
            </div>
            {!m.espejo_de && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 6 }}><button onClick={() => setEtiquetar(m)} aria-label={`Etiquetar ${m.descripcion}`} style={{ background: 'none', border: 'none', color: T.morado, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="tag" size={12} />Etiquetar</button><button onClick={() => del(m)} style={{ background: 'none', border: 'none', color: '#B42318', fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="trash" size={12} />Eliminar</button></div>}
          </div>) })}
      </div>

      {modal && <Modal title="Registrar movimiento" onClose={() => setModal(false)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Fecha"><input type="date" value={form.fecha} onChange={e => sf('fecha', e.target.value)} style={inp} /></Field>
          <Field label="Tipo"><select value={form.tipo} onChange={e => { sf('tipo', e.target.value); sf('aMiembro', false) }} style={sel}><option>Salida</option><option>Ingreso</option>{esPersonal && <option value="Transferencia">Traslado entre mis cuentas</option>}</select></Field>
          <Field label="Descripción" full><input value={form.descripcion} onChange={e => sf('descripcion', e.target.value)} style={inp} placeholder={esTraslado ? 'Ej. Retiro cajero' : 'Ej. Mercado Éxito, Cuota vehicular…'} /></Field>
          {!esTraslado && <Field label="Categoría"><select value={form.categoria_id || ''} onChange={e => { sf('categoria_id', e.target.value || null); sf('deuda_id', ''); sf('cuotaN', '') }} style={sel}>{db.categorias.filter(c => c.activa !== false && c.nombre !== 'Pago tarjeta crédito').map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>}
          <Field label={esTraslado ? 'Desde' : form.tipo === 'Ingreso' ? 'Cuenta donde entra' : 'Cuenta de donde sale'}><select value={form.cuenta_id || ''} onChange={e => sf('cuenta_id', e.target.value || null)} style={sel}>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{nombreCuenta(x)}</option>)}</select></Field>
          {esTraslado && <Field label="Hacia"><select value={form.cuenta_destino_id || ''} onChange={e => sf('cuenta_destino_id', e.target.value)} style={sel}><option value="">— Selecciona —</option>{cuentasCaja.filter(x => x.id !== form.cuenta_id).map(x => <option key={x.id} value={x.id}>{nombreCuenta(x)}</option>)}</select></Field>}
          {!esTraslado && <Field label="Activo"><select value={form.activo_id || ''} onChange={e => sf('activo_id', e.target.value || null)} style={sel}><option value="">— Ninguno —</option>{db.activos.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>}
          {!isCreditPay && <Field label="Monto (COP)" full><input type="number" inputMode="numeric" value={form.monto} onChange={e => sf('monto', e.target.value)} style={inp} /></Field>}
          {!esPersonal && form.tipo === 'Salida' && !isCreditPay && <div style={{ gridColumn: '1/-1', background: '#E7F5EE', borderRadius: 12, padding: '10px 12px', border: '1px solid #E7F5EE' }}>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: '#0F6B47' }}><input type="checkbox" checked={form.aMiembro} onChange={e => sf('aMiembro', e.target.checked)} />Este pago es a un miembro del espacio</label>
            {form.aMiembro && <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Cuenta del miembro (debe estar habilitada aquí)"><select value={form.cuenta_destino_id || ''} onChange={e => sf('cuenta_destino_id', e.target.value)} style={sel}><option value="">— Selecciona —</option>{cuentasMiembros.map(x => <option key={x.id} value={x.id}>{nombreCuenta(x)}</option>)}</select></Field>
              <Field label="Para él cuenta como"><select value={form.modo_destino} onChange={e => sf('modo_destino', e.target.value)} style={sel}><option value="ingreso">Ingreso (honorarios, salario)</option><option value="devolucion">Devolución de aporte</option></select></Field>
            </div>}
          </div>}
          {isCreditPay && <div style={{ gridColumn: '1/-1', background: '#E7F5EE', borderRadius: 12, padding: '12px 14px', border: '1px solid #E7F5EE' }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: '#0F6B47', marginBottom: 10 }}><IcoText name="landmark">Pago de crédito — conciliación</IcoText></div>
            <Field label="Crédito"><select value={form.deuda_id} onChange={e => { sf('deuda_id', e.target.value); sf('cuotaN', '') }} style={sel}><option value="">— Selecciona —</option>{creditos.map(d => <option key={d.id} value={d.id}>{d.nombre}</option>)}</select></Field>
            {rCred && rCred.am.filter(c => !c.pago).length > 0 && <div style={{ marginTop: 10 }}><Field label="Cuota a pagar"><select value={form.cuotaN} onChange={e => sf('cuotaN', e.target.value)} style={sel}><option value="">— Selecciona —</option>{rCred.am.filter(c => !c.pago).slice(0, 12).map(c => <option key={c.n} value={c.n}>Cuota {c.n} · {fmtDate(c.fecha)} · {fmtCOP(c.total)}</option>)}</select></Field></div>}
            {cuotaSel && <div style={{ marginTop: 12, background: '#fff', borderRadius: 10, padding: 12, border: '1px solid #E7F5EE' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}><span style={{ color: '#6E6E73' }}>Capital</span><b>{fmtCOP(cuotaSel.capital)}</b></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: cuotaSel.seguro ? 'none' : '2px solid #4B1D9E', marginBottom: cuotaSel.seguro ? 0 : 8 }}><span style={{ color: '#6E6E73' }}>Interés</span><b>{fmtCOP(cuotaSel.interes)}</b></div>
              {cuotaSel.seguro > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: '2px solid #4B1D9E', marginBottom: 8 }}><span style={{ color: '#6E6E73' }}>Seguro del crédito</span><b>{fmtCOP(cuotaSel.seguro)}</b></div>}
              {esAnticipado(cuotaSel.fecha) && <div style={{ marginBottom: 8 }}><Aviso tipo="warn">Esta cuota vence el {fmtDate(cuotaSel.fecha)}: al registrar el pago se te pedirá el motivo del anticipo.</Aviso></div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
                <Field label="Manejo"><input type="number" inputMode="numeric" value={form.manejo} onChange={e => sf('manejo', e.target.value)} style={inp} placeholder="0" /></Field>
                <Field label="Mora"><input type="number" inputMode="numeric" value={form.mora} onChange={e => sf('mora', e.target.value)} style={inp} placeholder="0" /></Field>
                <Field label="Otros seg."><input type="number" inputMode="numeric" value={form.seguros} onChange={e => sf('seguros', e.target.value)} style={inp} placeholder="0" /></Field>
                <Field label="Otros"><input type="number" inputMode="numeric" value={form.otros} onChange={e => sf('otros', e.target.value)} style={inp} placeholder="0" /></Field>
              </div>
              {xO > 0 && <div style={{ marginBottom: 10 }}><Field label="¿Qué es ese otro concepto?"><input value={form.otrosDetalle} onChange={e => sf('otrosDetalle', e.target.value)} placeholder="Ej. Comisión por canal" style={inp} /></Field></div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #138A5B', paddingTop: 8 }}><span style={{ fontWeight: 800, fontSize: 14 }}>TOTAL A PAGAR</span><span style={{ fontWeight: 800, fontSize: 14, color: '#138A5B' }}>{fmtCOP(totalCred)}</span></div>
            </div>}
          </div>}
          {!esTraslado && <EtiquetaPicker value={form.etiqueta_ids || []} onChange={v => sf('etiqueta_ids', v)} />}
          {!esTraslado && <Field label="Vincular a rubro del presupuesto" full><select value={form.presupuesto_id || ''} onChange={e => sf('presupuesto_id', e.target.value || null)} style={sel}><option value="">— Sin vincular —</option>{db.presupuesto.filter(p => p.periodo === form.fecha.slice(0, 7) + '-01').map(p => <option key={p.id} value={p.id}>{p.concepto}</option>)}</select></Field>}
        </div>
        {!esPersonal && form.cuenta_id && duenoCuenta(ix.cta[form.cuenta_id]) && form.tipo !== 'Ingreso' && <div style={{ marginTop: 10 }}><Aviso tipo="info">Se registra en {espacio.nombre} y queda como <b>aporte de {nombreMiembro(duenoCuenta(ix.cta[form.cuenta_id]))}</b> en su espacio personal.</Aviso></div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(false)} /><SaveBtn onClick={() => save()} disabled={!canSave}>{isCreditPay ? 'Registrar pago' : 'Registrar'}</SaveBtn></div>
        {anticipo && cuotaSel && <MotivoAnticipo cuota={cuotaSel} onClose={() => setAnticipo(false)} onConfirm={m => { setAnticipo(false); save(m) }} />}
      </Modal>}
      {importar && <ImportarMovimientos onClose={() => setImportar(false)} />}
      {etiquetar && <EtiquetarMovimiento m={etiquetar} onClose={() => setEtiquetar(null)} onSave={async ids => { try { await actualizar('movimientos', etiquetar.id, { etiqueta_ids: ids }); setEtiquetar(null) } catch (e) { alert(e.message) } }} />}
    </div>
  )
}

// Cambiar las etiquetas de un movimiento ya registrado (sirve también para pagos de crédito y de tarjeta).
function EtiquetarMovimiento({ m, onClose, onSave }) {
  const [ids, setIds] = useState(m.etiqueta_ids || [])
  return (
    <Modal title="Etiquetar movimiento" onClose={onClose}>
      <div style={{ fontWeight: 700, fontSize: 14, color: T.tinta }}>{m.descripcion}</div><div style={{ fontSize: 12, color: T.gris, marginTop: 2, marginBottom: 14 }}>{fmtDate(m.fecha)} · {fmtCOP(m.monto)}</div>
      <EtiquetaPicker value={ids} onChange={setIds} label="¿De quién o de qué es este movimiento?" />
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={onClose} /><SaveBtn onClick={() => onSave(ids)}>Guardar etiquetas</SaveBtn></div>
    </Modal>
  )
}

// ── Importación desde archivo plano (plantilla propia o exportación de otras apps, p. ej. MonAi) ──
const MCOLS = ['fecha', 'descripcion', 'monto', 'tipo', 'categoria', 'cuenta', 'moneda', 'ref', 'tags', 'notas']
const MALIAS = {
  fecha: ['fecha', 'date', 'fecha movimiento', 'dia', 'day'], descripcion: ['descripcion', 'purpose', 'concepto', 'detalle', 'description', 'title', 'memo', 'nombre'],
  monto: ['monto', 'amount', 'valor', 'importe', 'total'], tipo: ['tipo', 'type', 'flujo', 'kind'], categoria: ['categoria', 'category', 'cat', 'rubro'],
  cuenta: ['cuenta', 'account', 'medio', 'medio de pago', 'banco', 'wallet'], moneda: ['moneda', 'currency'], ref: ['id', 'ref', 'referencia', 'external id', 'uuid'],
  tags: ['tags', 'etiquetas', 'etiqueta'], notas: ['notas', 'notes', 'observaciones', 'comentario'],
}
const esIngreso = v => /^(ingreso|income|in|credit|credito|abono|entrada|\+)$/i.test(String(v).trim())
const esSalida = v => /^(salida|gasto|expense|out|debit|debito|egreso|pago|-)$/i.test(String(v).trim())

function ImportarMovimientos({ onClose }) {
  const { db, insertar, insertarVarios, nombreCuenta } = useData()
  const [parsed, setParsed] = useState(null); const [err, setErr] = useState(''); const [crear, setCrear] = useState(true); const [busy, setBusy] = useState(null); const fileRef = useRef()
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const [cuentaId, setCuentaId] = useState(cuentasCaja[0]?.id || ''); const [regla, setRegla] = useState('auto')   // auto | signo | columna | salidas | ingresos
  const refsExistentes = new Set(db.movimientos.map(m => m.ref_externa).filter(Boolean))
  const plantilla = () => descargar('plantilla-movimientos.csv', toCSV([['fecha', 'descripcion', 'monto', 'tipo', 'categoria', 'cuenta', 'notas'], ['05/10/2026', 'Mercado Éxito', '-185000', 'Salida', 'Mercado', cuentasCaja[0]?.nombre || '', ''], ['01/10/2026', 'Honorarios cliente', '2500000', 'Ingreso', 'Honorarios', cuentasCaja[0]?.nombre || '', 'Factura 123']]))
  const leer = async file => {
    setErr('')
    try {
      const text = await leerArchivoTexto(file); const { rows, delim } = parseCSV(text)
      if (rows.length < 2) throw new Error('El archivo no tiene filas de datos.')
      const head = rows[0].map(norm)
      const idx = {}; MCOLS.forEach(c => { idx[c] = head.findIndex(h => MALIAS[c].includes(h)); if (idx[c] < 0) idx[c] = head.findIndex(h => MALIAS[c].some(a => h.includes(a))) })
      if (idx.fecha < 0 || idx.monto < 0) throw new Error(`No encontré las columnas obligatorias "fecha" y "monto". Encabezados: ${rows[0].join(' | ')}`)
      const get = (r, c) => idx[c] >= 0 ? String(r[idx[c]] ?? '').trim() : ''
      const monAi = head.includes('purpose') && head.includes('original_amount')
      const nuevasCat = new Set(); let negativos = 0, conTipo = 0
      const items = rows.slice(1).filter(r => r.some(v => String(v ?? '').trim())).map((r, i) => {
        const w = [], e = []
        const fecha = parseFecha(get(r, 'fecha')); if (!fecha) e.push(`Fecha "${get(r, 'fecha')}" no reconocida`)
        const monto = parseMonto(get(r, 'monto')); if (isNaN(monto) || monto === 0) e.push('Monto inválido o cero'); if (monto < 0) negativos++
        const tipoRaw = get(r, 'tipo'); const tipoCol = esIngreso(tipoRaw) ? 'Ingreso' : esSalida(tipoRaw) ? 'Salida' : null; if (tipoCol) conTipo++
        const descripcion = get(r, 'descripcion') || get(r, 'categoria') || 'Movimiento importado'
        const catRaw = get(r, 'categoria'); let cat = matchOpt(catRaw, db.categorias.filter(c => c.activa !== false), x => x.nombre); if (!cat && catRaw) { nuevasCat.add(catRaw); w.push(`Categoría nueva: ${catRaw}`) } if (!cat && !catRaw) w.push('Sin categoría → Otro')
        const ctaRaw = get(r, 'cuenta'); const cta = ctaRaw ? (matchOpt(ctaRaw, cuentasCaja, x => x.nombre) || matchOpt(ctaRaw, cuentasCaja, x => nombreCuenta(x))) : null; if (ctaRaw && !cta) w.push(`Cuenta "${ctaRaw}" no existe → se usa la elegida abajo`)
        const moneda = get(r, 'moneda'); if (moneda && !/^cop$/i.test(moneda)) w.push(`Moneda ${moneda}: se toma el monto tal cual`)
        const ref = get(r, 'ref') || null; const dup = ref && refsExistentes.has(ref); if (dup) w.push('Ya importado antes (misma referencia); se omite')
        const tags = (get(r, 'tags') || '').split(/[,;|]/).map(t => t.trim()).filter(Boolean)   // tags del archivo → etiquetas (se crean si no existen)
        const notas = get(r, 'notas') || null
        return { n: i + 2, fecha, monto, tipoCol, descripcion, cat, catRaw, cta, ref, dup, notas, tags, w, e }
      })
      if (!items.length) throw new Error('El archivo no tiene filas de datos.')
      const sugerida = conTipo >= items.length * 0.9 ? 'columna' : negativos > 0 ? 'signo' : 'salidas'
      setRegla(sugerida)
      setParsed({ items, delim, monAi, nuevasCat: [...nuevasCat], negativos, conTipo, sugerida })
    } catch (ex) { setErr(ex.message || String(ex)) }
  }
  const tipoDe = x => regla === 'columna' ? (x.tipoCol || (x.monto < 0 ? 'Salida' : 'Ingreso')) : regla === 'signo' ? (x.monto < 0 ? 'Salida' : 'Ingreso') : regla === 'ingresos' ? 'Ingreso' : 'Salida'
  const validos = parsed ? parsed.items.filter(x => !x.e.length && !x.dup) : []
  const omitidos = parsed ? parsed.items.filter(x => x.dup).length : 0
  const resumen = validos.reduce((a, x) => { const t = tipoDe(x); a[t] += Math.abs(x.monto); return a }, { Ingreso: 0, Salida: 0 })
  const confirmar = async () => {
    if (!cuentaId && !validos.every(x => x.cta)) { setErr('Elige la cuenta a la que entran los movimientos.'); return }
    setBusy('Preparando…'); setErr('')
    try {
      const mapC = Object.fromEntries(db.categorias.map(x => [norm(x.nombre), x.id]))
      if (crear) for (const n of parsed.nuevasCat) { const r = await insertar('categorias', { nombre: n, grupo: 'Variable' }); mapC[norm(n)] = r.id }
      const otro = db.categorias.find(c => c.nombre === 'Otro')?.id || null
      const mapE = Object.fromEntries(db.etiquetas.map(x => [norm(x.nombre), x.id]))
      for (const t of new Set(validos.flatMap(x => x.tags))) if (!mapE[norm(t)]) { const r = await insertar('etiquetas', { nombre: t.slice(0, 40) }); mapE[norm(t)] = r.id }
      const filas = validos.map(x => ({ fecha: x.fecha, tipo: tipoDe(x), descripcion: x.descripcion.slice(0, 200), monto: Math.abs(x.monto), categoria_id: x.cat?.id || mapC[norm(x.catRaw)] || otro, cuenta_id: x.cta?.id || cuentaId || null, origen: 'importacion', ref_externa: x.ref, notas: x.notas, etiqueta_ids: [...new Set(x.tags.map(t => mapE[norm(t)]).filter(Boolean))] }))
      for (let i = 0; i < filas.length; i += 300) { setBusy(`Importando ${Math.min(i + 300, filas.length)} de ${filas.length}…`); await insertarVarios('movimientos', filas.slice(i, i + 300)) }
      onClose()
    } catch (e) { setErr(e.message); setBusy(null) }
  }
  return (
    <Modal title="Importar movimientos" onClose={onClose}>
      {!parsed ? <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Aviso tipo="info">CSV con columnas <b>fecha</b> y <b>monto</b> (obligatorias) y opcionales <code>descripcion, tipo, categoria, cuenta, etiquetas, notas, id</code> (las etiquetas se crean si no existen). También entiende la exportación de <b>MonAi</b> (date, purpose, amount, category, id…). Si el archivo trae <code>id</code>, puedes reimportarlo sin duplicar. Si cargas un histórico, pon antes en la cuenta su <b>saldo al empezar</b> y la <b>fecha de corte</b> (Ajustes → Cuentas): lo anterior al corte no altera el saldo.</Aviso>
        <button onClick={plantilla} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, border: `1.5px solid ${T.divisor}`, borderRadius: 20, background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: T.tinta, fontFamily: 'inherit' }}><Icon name="download" size={16} />Descargar plantilla CSV</button>
        <div onClick={() => fileRef.current.click()} style={{ border: '2px dashed #D9D2EA', borderRadius: 14, padding: '28px 16px', textAlign: 'center', cursor: 'pointer', background: T.superficie }}>
          <div style={{ color: T.morado, marginBottom: 8 }}><Icon name="upload" size={30} sw={1.5} /></div><div style={{ fontWeight: 700, fontSize: 14, color: T.moradoOscuro }}>Toca para elegir el archivo</div>
          <input ref={fileRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) leer(f); e.target.value = '' }} />
        </div>
        {err && <Aviso tipo="err">{err}</Aviso>}
      </div> : <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {parsed.monAi && <Aviso tipo="ok">Archivo de MonAi reconocido. El monto se toma en tu moneda base; los gastos vienen en negativo.</Aviso>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}><Kpi value={validos.length} label="A importar" color={T.verde} /><Kpi value={omitidos} label="Ya importadas" color={T.gris} /><Kpi value={parsed.items.filter(x => x.e.length).length} label="Con errores" color={T.rojo} /></div>
        <div style={{ fontSize: 12, color: T.gris }}>Entrarían <b style={{ color: T.verde }}>{fmtCOP(resumen.Ingreso)}</b> en ingresos y <b style={{ color: T.tinta }}>{fmtCOP(resumen.Salida)}</b> en salidas.</div>
        <Field label="¿Cómo distinguir ingresos de salidas?"><select value={regla} onChange={e => setRegla(e.target.value)} style={sel}>
          <option value="signo">Por el signo del monto (negativo = salida){parsed.sugerida === 'signo' ? ' · sugerido' : ''}</option>
          <option value="columna">Por la columna "tipo"{parsed.sugerida === 'columna' ? ' · sugerido' : ''}{parsed.conTipo < parsed.items.length ? ` (${parsed.items.length - parsed.conTipo} filas sin tipo usan el signo)` : ''}</option>
          <option value="salidas">Todos son salidas</option><option value="ingresos">Todos son ingresos</option>
        </select></Field>
        <Field label="Cuenta a la que entran (si la fila no trae cuenta)"><select value={cuentaId} onChange={e => setCuentaId(e.target.value)} style={sel}><option value="">— Elegir —</option>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{nombreCuenta(x)}</option>)}</select></Field>
        {parsed.nuevasCat.length > 0 && <Aviso tipo="warn"><label style={{ display: 'flex', gap: 8, cursor: 'pointer' }}><input type="checkbox" checked={crear} onChange={e => setCrear(e.target.checked)} /><span>Crear {parsed.nuevasCat.length} categoría{parsed.nuevasCat.length > 1 ? 's' : ''} nueva{parsed.nuevasCat.length > 1 ? 's' : ''} (grupo Variable): {parsed.nuevasCat.slice(0, 8).join(', ')}{parsed.nuevasCat.length > 8 ? '…' : ''}. Si no, van a "Otro".</span></label></Aviso>}
        <div style={{ border: `1px solid ${T.divisor}`, borderRadius: 12, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
          {parsed.items.slice(0, 150).map(x => <div key={x.n} style={{ padding: '8px 10px', borderBottom: `1px solid ${T.superficie}`, background: x.e.length ? T.rojoFondo : x.dup ? T.superficie : x.w.length ? T.ambarFondo : '#fff', opacity: x.dup ? 0.6 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, color: x.e.length ? T.rojo : T.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ color: T.grisClaro, fontWeight: 500 }}>#{x.n} </span>{x.descripcion}</div>
              <div style={{ fontSize: 10, color: T.gris }}>{fmtDate(x.fecha)} · {x.cat?.nombre || x.catRaw || 'Otro'} · {x.e.length ? '' : tipoDe(x)}</div>
              {x.e.map((m, i) => <div key={i} style={{ fontSize: 10, color: T.rojo }}>✕ {m}</div>)}{x.w.map((m, i) => <div key={i} style={{ fontSize: 10, color: T.ambar }}>· {m}</div>)}</div>
              <div style={{ fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap', color: !x.e.length && tipoDe(x) === 'Ingreso' ? T.verde : T.tinta }}>{isNaN(x.monto) ? '—' : fmtCOP(Math.abs(x.monto))}</div></div>
          </div>)}
          {parsed.items.length > 150 && <div style={{ padding: 8, textAlign: 'center', fontSize: 11, color: T.gris }}>…y {parsed.items.length - 150} filas más</div>}
        </div>
        {err && <Aviso tipo="err">{err}</Aviso>}
        <div style={{ display: 'flex', gap: 10 }}><CancelBtn onClick={() => setParsed(null)} /><SaveBtn onClick={confirmar} disabled={!validos.length || !!busy}>{busy || `Importar ${validos.length}`}</SaveBtn></div>
      </div>}
    </Modal>
  )
}
