import { useState } from 'react'
import { useData, useIndices } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Kpi, Card, Icon, IcoText, Modal, Field, inp, sel, SaveBtn, CancelBtn, SmallBtn, PrimaryBtn, Aviso, useForm, T } from '../lib/ui'
import MoverA from './MoverA'
import ImportarExtracto, { EstadoExtracto } from './Extracto'
import { fmtCOP, fmtDate, today, daysLeft, cfFija, TC, TIPOS_DEUDA } from '../lib/util'
import { indicePagadas, resumenDeuda, resumenTarjeta } from '../lib/finanzas'
import { parseMonto } from '../lib/csv'

export const CONCEPTOS_DIF = [['mora', 'Intereses de mora'], ['seguros', 'Seguros (variación)'], ['cuota_manejo', 'Cuota de manejo / comisión'], ['otros', 'Otro concepto']]

// R12 · pago anticipado: si faltan más de DIAS_ANTICIPO días para el vencimiento, se exige un motivo.
export const DIAS_ANTICIPO = 5
export const MOTIVOS_ANTICIPO = ['Adelanto de cuota', 'Corrección de fecha', 'Pago doble por viaje o ausencia', 'Otro']
export const esAnticipado = fecha => daysLeft(fecha) > DIAS_ANTICIPO
export const SISTEMAS = { fija: 'Cuota fija', capital: 'Cuota decreciente' }

// Motivo para pagar una cuota antes de tiempo. Devuelve el texto final o null si se cancela.
export function MotivoAnticipo({ cuota, onConfirm, onClose }) {
  const [motivo, setMotivo] = useState(''); const [otro, setOtro] = useState('')
  const texto = motivo === 'Otro' ? otro.trim() : motivo
  return (
    <Modal title="Pago anticipado" onClose={onClose}>
      <Aviso tipo="warn">La cuota {cuota.n} vence el {fmtDate(cuota.fecha)} (faltan {daysLeft(cuota.fecha)} días). Para pagarla antes de tiempo elige el motivo; queda registrado en el movimiento.</Aviso>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
        {MOTIVOS_ANTICIPO.map(m => <button key={m} onClick={() => setMotivo(m)} style={{ textAlign: 'left', padding: '11px 14px', borderRadius: 12, border: '1.5px solid', borderColor: motivo === m ? T.morado : T.divisor, background: motivo === m ? T.superficie : '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', color: T.tinta }}>{m}</button>)}
        {motivo === 'Otro' && <input autoFocus value={otro} onChange={e => setOtro(e.target.value)} placeholder="Escribe el motivo" style={inp} />}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={onClose} /><SaveBtn disabled={!texto} onClick={() => onConfirm(texto)}>Pagar con este motivo</SaveBtn></div>
    </Modal>
  )
}

// Pago de cuota con valor real: muestra la cuota calculada, pide cuánto se pagó y, si no coincide, obliga a explicar la
// diferencia por concepto (mora, seguros, manejo, otros con detalle) o a dar un motivo si se pagó menos (pago parcial).
// Sale UN movimiento de caja por el valor real; cada concepto queda en el desglose para los informes.
export function PagoCuota({ r, c, onClose, onConfirm }) {
  const { nombreCuenta } = useData(); const ix = useIndices()
  const [pagado, setPagado] = useState(String(c.total)); const [dif, setDif] = useState({ mora: '', seguros: '', cuota_manejo: '', otros: '' }); const [detalle, setDetalle] = useState(''); const [motivo, setMotivo] = useState('')
  const [anticipo, setAnticipo] = useState(false)
  const esperado = c.total; const real = parseMonto(pagado) || 0; const diferencia = real - esperado
  const suma = Object.values(dif).reduce((a, v) => a + (parseMonto(v) || 0), 0)
  const falta = diferencia > 0 ? diferencia - suma : 0
  const ant = esAnticipado(c.fecha)
  const listo = real > 0 && (diferencia === 0 || (diferencia > 0 && falta === 0 && (!(parseMonto(dif.otros) > 0) || detalle.trim())) || (diferencia < 0 && motivo.trim()))
  const confirmar = (motivoAnt = null) => {
    if (ant && !motivoAnt) { setAnticipo(true); return }
    const extras = {}; if (diferencia > 0) { for (const [k] of CONCEPTOS_DIF) { const v = parseMonto(dif[k]) || 0; if (v > 0) extras[k] = v } if (extras.otros) extras.otros_detalle = detalle.trim() }
    if (diferencia < 0) extras.parcial = diferencia
    onConfirm({ extras, motivo: [motivoAnt, diferencia < 0 ? motivo.trim() : null].filter(Boolean).join(' · ') || null })
  }
  const fila = (l, v, b) => <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12, borderBottom: b ? `2px solid ${T.morado}` : 'none' }}><span style={{ color: T.gris }}>{l}</span><b>{fmtCOP(v)}</b></div>
  return (
    <Modal title={`Pagar cuota ${c.n} · ${r.nombre}`} onClose={onClose}>
      <div style={{ background: T.superficie, borderRadius: 12, padding: '10px 14px' }}>
        {fila('Capital', c.capital)}{fila('Interés', c.interes, !c.seguro)}{c.seguro > 0 && fila('Seguro del crédito', c.seguro, true)}
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, fontSize: 13 }}><span style={{ fontWeight: 800 }}>Cuota calculada</span><span style={{ fontWeight: 800, color: T.morado }}>{fmtCOP(esperado)}</span></div>
        <div style={{ fontSize: 11, color: T.gris, marginTop: 4 }}>Vence {fmtDate(c.fecha)} · sale de {ix.cta[r.cuenta_pago_id] ? nombreCuenta(ix.cta[r.cuenta_pago_id]) : 'la cuenta de pago'}</div>
      </div>
      <div style={{ marginTop: 14 }}><Field label="¿Cuánto pagaste realmente? (COP)"><input type="number" inputMode="numeric" autoFocus value={pagado} onChange={e => setPagado(e.target.value)} style={{ ...inp, fontWeight: 800, fontSize: 18 }} aria-label="Valor pagado" /></Field></div>
      {real > 0 && diferencia > 0 && <div style={{ marginTop: 12 }}>
        <Aviso tipo="warn">Pagaste <b>{fmtCOP(diferencia)}</b> más que la cuota. Reparte esa diferencia en los conceptos que cobró el banco; cada uno queda registrado en el movimiento.</Aviso>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
          {CONCEPTOS_DIF.map(([k, l]) => <Field key={k} label={l}><input type="number" inputMode="numeric" value={dif[k]} onChange={e => setDif({ ...dif, [k]: e.target.value })} placeholder="0" style={inp} /></Field>)}
          {parseMonto(dif.otros) > 0 && <Field label="¿Qué es ese otro concepto?" full><input value={detalle} onChange={e => setDetalle(e.target.value)} placeholder="Ej. Comisión por pago en corresponsal" style={inp} /></Field>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 8, color: falta === 0 ? T.verde : T.rojo }}>{falta === 0 ? 'La diferencia queda explicada.' : falta > 0 ? `Falta explicar ${fmtCOP(falta)}` : `Repartiste ${fmtCOP(-falta)} de más`}</div>
      </div>}
      {real > 0 && diferencia < 0 && <div style={{ marginTop: 12 }}>
        <Aviso tipo="warn">Pagaste <b>{fmtCOP(-diferencia)}</b> menos que la cuota: queda como <b>pago parcial</b>. La cuota se marca pagada por lo que salió de caja; el saldo del crédito no baja lo esperado, así que conviene ajustar el saldo con el próximo extracto.</Aviso>
        <div style={{ marginTop: 10 }}><Field label="Motivo del pago parcial"><input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej. Acuerdo con el banco, resto el día 20" style={inp} /></Field></div>
      </div>}
      {ant && <div style={{ marginTop: 10 }}><Aviso tipo="info">Faltan {daysLeft(c.fecha)} días para el vencimiento: al confirmar se te pedirá el motivo del anticipo.</Aviso></div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={onClose} /><SaveBtn disabled={!listo} onClick={() => confirmar()}>Registrar pago {real > 0 ? fmtCOP(real) : ''}</SaveBtn></div>
      {anticipo && <MotivoAnticipo cuota={c} onClose={() => setAnticipo(false)} onConfirm={m => { setAnticipo(false); confirmar(m) }} />}
    </Modal>
  )
}

// Saldo real según el extracto del banco: no toca caja; la tabla se remide desde la cuota siguiente manteniendo
// las cuotas restantes. Sirve al crear el crédito (saldo de apertura) y después (cada extracto).
export function AjustarSaldo({ r, onClose, onConfirm }) {
  const [saldo, setSaldo] = useState(''); const [fecha, setFecha] = useState(today()); const [motivo, setMotivo] = useState('Saldo según extracto del banco')
  const real = parseMonto(saldo); const dif = real != null && saldo !== '' ? real - r.capitalPendiente : null
  const restantes = r.cuotasTotales - r.pagadas
  return (
    <Modal title={`Ajustar saldo · ${r.nombre}`} onClose={onClose}>
      <Aviso tipo="info">La app calcula un saldo de capital de <b>{fmtCOP(r.capitalPendiente)}</b> tras {r.pagadas} cuota{r.pagadas === 1 ? '' : 's'}. Si el extracto dice otra cosa (gastos capitalizados, seguros, intereses de mora), escribe el saldo real: las <b>{restantes} cuotas restantes</b> se recalculan desde ahí. No se crea ningún movimiento de caja.</Aviso>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
        <Field label="Saldo real según extracto (COP)" full><input type="number" inputMode="numeric" autoFocus value={saldo} onChange={e => setSaldo(e.target.value)} style={{ ...inp, fontWeight: 800, fontSize: 18 }} aria-label="Saldo real" /></Field>
        <Field label="Fecha del extracto"><input type="date" value={fecha} onChange={e => setFecha(e.target.value)} style={inp} /></Field>
        <Field label="Motivo"><input value={motivo} onChange={e => setMotivo(e.target.value)} style={inp} /></Field>
      </div>
      {dif != null && <div style={{ fontSize: 12, fontWeight: 700, marginTop: 10, color: dif === 0 ? T.verde : dif > 0 ? T.rojo : T.verde }}>{dif === 0 ? 'Coincide con lo calculado.' : dif > 0 ? `El banco dice ${fmtCOP(dif)} más que la app: la cuota subirá.` : `El banco dice ${fmtCOP(-dif)} menos que la app: la cuota bajará.`}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={onClose} /><SaveBtn disabled={!(real >= 0 && saldo !== '' && motivo.trim())} onClick={() => onConfirm({ saldo_real: real, fecha, motivo: motivo.trim(), saldo_calculado: r.capitalPendiente })}>Ajustar saldo</SaveBtn></div>
    </Modal>
  )
}

export default function Deudas({ goTo }) {
  const { db, all, insertar, actualizar, borrar, rpc, nombreCuenta, duenoCuenta, nombreMiembro } = useData(); const ix = useIndices(); const { esPersonal, userId, espacio } = useAuth()
  const [mover, setMover] = useState(null)
  const [open, setOpen] = useState(null); const [modal, setModal] = useState(null); const [showAll, setShowAll] = useState({})
  const [pago, setPago] = useState(null)           // { r, c } cuota en proceso de pago (valor real)
  const [ajuste, setAjuste] = useState(null)       // crédito al que se le ajusta el saldo según extracto
  const [abono, setAbono] = useState(null)         // crédito al que se abona
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const emptyD = { nombre: '', tipo: 'Consumo', sistema: 'fija', activo_id: null, cuenta_pago_id: cuentasCaja[0]?.id || null, capital_inicial: '', tasa_mensual: '', total_cuotas: '', seguro_mensual: '', cuotas_previas: '', fecha_primera_cuota: today(), estado: 'Activo', notas: '', saldo_real: '', fecha_saldo: today() }
  const [form, sf, setForm] = useForm(emptyD)
  const [fa, sfa, setFa] = useForm({ fecha: today(), monto: '', cuenta_id: '', modo: 'plazo', motivo: '' })
  const idx = indicePagadas(db.cuotas_pagadas)
  const tarjetas = db.cuentas.filter(c => c.tipo === TC).map(c => resumenTarjeta(c, db.tc_cargos, idx))
  const creditos = db.deudas.map(d => resumenDeuda(d, idx, db.abonos_capital, db.ajustes_saldo_deuda))
  const totalCred = creditos.filter(d => d.estado === 'Activo').reduce((a, d) => a + d.capitalPendiente, 0)
  const totalTC = tarjetas.reduce((a, r) => a + r.saldo, 0)
  const cargaMes = creditos.filter(d => d.estado === 'Activo').reduce((a, d) => a + d.cf, 0) + tarjetas.reduce((a, r) => a + r.proximaFactura, 0)
  const capF = parseMonto(form.capital_inicial) || 0, nF = parseInt(form.total_cuotas) || 0, tF = parseFloat(form.tasa_mensual) || 0, segF = parseMonto(form.seguro_mensual) || 0
  const cfEst = capF && nF ? (form.sistema === 'capital' ? Math.round(capF / nF + capF * tF / 100) : Math.round(cfFija(capF, tF, nF))) + segF : 0
  const totalEst = capF && nF ? (form.sistema === 'capital' ? Math.round(capF + capF * tF / 100 * (nF + 1) / 2) : Math.round(cfFija(capF, tF, nF) * nF)) + segF * nF : 0

  const saveD = async () => {
    if (!form.nombre || !form.capital_inicial || !form.total_cuotas) return
    const row = { nombre: form.nombre, notas: form.notas, tipo: form.tipo, sistema: form.sistema || 'fija', activo_id: form.activo_id || null, cuenta_pago_id: form.cuenta_pago_id || null, capital_inicial: parseMonto(form.capital_inicial), tasa_mensual: parseFloat(form.tasa_mensual) || 0, total_cuotas: parseInt(form.total_cuotas), seguro_mensual: parseMonto(form.seguro_mensual) || 0, cuotas_previas: Math.max(0, Math.min(parseInt(form.cuotas_previas) || 0, (parseInt(form.total_cuotas) || 1) - 1)), fecha_primera_cuota: form.fecha_primera_cuota, estado: form.estado }
    try {
      if (modal === 'add') {
        const d = await insertar('deudas', row)
        const sr = parseMonto(form.saldo_real)
        if (form.saldo_real !== '' && sr != null && sr >= 0) {   // saldo de apertura según extracto: la tabla arranca desde el saldo real
          const calc = resumenDeuda({ ...d, ...row }, idx, [], []).capitalPendiente
          await rpc('ajustar_saldo_deuda', { p_deuda: d.id, p_fecha: form.fecha_saldo || today(), p_saldo_real: sr, p_saldo_calculado: calc, p_motivo: 'Saldo según extracto al crear el crédito' })
        }
      } else await actualizar('deudas', modal.id, row)
      setModal(null)
    } catch (e) { alert(e.message) }
  }
  const ejecutarPago = async (d, c, { extras = {}, motivo = null } = {}) => { try { await rpc('pagar_cuota_credito', { p_deuda: d.id, p_numero: c.n, p_fecha: today(), p_cuenta: d.cuenta_pago_id, p_capital: c.capital, p_interes: c.interes, p_extras: extras, p_motivo: motivo, p_seguro: c.seguro || 0 }); setPago(null) } catch (e) { alert(e.message) } }
  const pagarC = (d, c) => setPago({ r: d, c })
  const ajustar = async ({ saldo_real, fecha, motivo, saldo_calculado }) => { try { await rpc('ajustar_saldo_deuda', { p_deuda: ajuste.id, p_fecha: fecha, p_saldo_real: saldo_real, p_saldo_calculado: saldo_calculado, p_motivo: motivo }); setAjuste(null) } catch (e) { alert(e.message) } }
  const anularC = async c => { if (!window.confirm('¿Anular el pago de esta cuota? Se eliminará también el movimiento de caja.')) return; if (c.pago.movimiento_id) await borrar('movimientos', c.pago.movimiento_id); await borrar('cuotas_pagadas', c.pago.id) }
  const abonar = async () => {
    const monto = parseMonto(fa.monto) || 0; if (monto <= 0) return
    if (monto > abono.capitalPendiente && !window.confirm('El abono supera el saldo pendiente. ¿Continuar?')) return
    try { await rpc('abonar_capital', { p_deuda: abono.id, p_fecha: fa.fecha, p_monto: monto, p_cuenta: fa.cuenta_id || abono.cuenta_pago_id, p_modo: fa.modo, p_motivo: fa.motivo || null }); setAbono(null) } catch (e) { alert(e.message) }
  }
  const btnTabla = (bg, color, extra) => ({ fontSize: 10, background: bg, color, border: 'none', borderRadius: 10, padding: '4px 9px', cursor: 'pointer', fontWeight: 700, fontFamily: 'inherit', ...extra })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}><Kpi icon="landmark" value={fmtCOP(totalCred)} label="Créditos" color={T.rojo} /><Kpi icon="card" value={fmtCOP(totalTC)} label="Tarjetas" color={T.morado} /><Kpi icon="calendar" value={fmtCOP(cargaMes)} label="Carga mes" color={T.ambar} /></div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}><h2 style={{ margin: 0, fontWeight: 800, fontSize: 16, color: T.tinta }}>Tarjetas <span style={{ color: T.gris, fontWeight: 700, fontSize: 13 }}>{tarjetas.length}</span></h2>{esPersonal && <SmallBtn onClick={() => goTo('config')} bg={T.superficie} color={T.gris}><Icon name="plus" size={12} />Nueva en Ajustes</SmallBtn>}</div>
      {tarjetas.length === 0 && <Card style={{ textAlign: 'center', color: T.gris, fontSize: 12 }}>{esPersonal ? 'Crea una cuenta tipo "Tarjeta crédito" en Ajustes y aparecerá aquí.' : 'Ningún miembro ha habilitado una tarjeta en este espacio. Cada quien lo hace desde su espacio personal (Ajustes → Cuentas).'}</Card>}
      {tarjetas.map(r => <Tarjeta key={r.cuenta.id} r={r} esDueno={duenoCuenta(r.cuenta) === userId || r.cuenta.espacio_id === espacio.id} onMover={setMover} />)}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}><h2 style={{ margin: 0, fontWeight: 800, fontSize: 16, color: T.tinta }}>Créditos <span style={{ color: T.gris, fontWeight: 700, fontSize: 13 }}>{creditos.length}</span></h2><PrimaryBtn onClick={() => { setForm(emptyD); setModal('add') }} style={{ height: 36, fontSize: 13 }}><Icon name="plus" size={13} />Nuevo</PrimaryBtn></div>
      {creditos.map(r => { const isOpen = open === r.id; const vT = showAll[r.id]; const rows = vT ? r.am : r.am.slice(Math.max(0, r.pagadas - 1), r.pagadas + 4); const anticipada = r.proxima && esAnticipado(r.proxima.fecha); return (
        <div key={r.id} data-item={r.nombre} style={{ background: T.superficie, borderRadius: 16, overflow: 'hidden' }}>
          <div onClick={() => setOpen(isOpen ? null : r.id)} style={{ padding: '14px 16px', cursor: 'pointer', background: r.estado === 'Activo' ? T.tinta : T.gris, color: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name={r.tipo === 'Vehicular' ? 'car' : r.tipo === 'Hipotecario' ? 'home' : 'banknote'} size={12} />Crédito {r.tipo.toLowerCase()} · {SISTEMAS[r.sistema] || SISTEMAS.fija}{r.estado !== 'Activo' ? ' · cancelado' : ''}</div>
                <div style={{ fontWeight: 800, fontSize: 16, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nombre}</div>
                <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>{r.tasa_mensual}% m.v. · {r.cuotasTotales} cuotas{+r.seguro_mensual > 0 ? ` · seguro ${fmtCOP(r.seguro_mensual)}/mes` : ''}{r.activo_id ? ` · ${ix.act[r.activo_id]?.nombre}` : ''}</div>
              </div>
              <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size={20} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
              <div><div style={{ fontSize: 11, opacity: 0.75 }}>Saldo capital</div><div style={{ fontWeight: 800, fontSize: 14 }}>{fmtCOP(r.capitalPendiente)}</div></div>
              <div><div style={{ fontSize: 11, opacity: 0.75 }}>Próxima cuota</div><div style={{ fontWeight: 800, fontSize: 14, color: '#FFD166' }}>{r.proxima ? fmtCOP(r.proxima.total) : '—'}</div>{r.proxima && <div style={{ fontSize: 11, opacity: 0.8 }}>{r.proxima.fecha < today() ? 'Vencida · ' : ''}{fmtDate(r.proxima.fecha)} · N° {r.proxima.n}</div>}</div>
              <div><div style={{ fontSize: 11, opacity: 0.75 }}>{r.sistema === 'capital' ? 'Abono a capital' : 'Cuota'}</div><div style={{ fontWeight: 800, fontSize: 14 }}>{fmtCOP(r.sistema === 'capital' ? (r.proxima?.capital || 0) : r.cf)}</div><div style={{ fontSize: 11, opacity: 0.8 }}>{ix.cta[r.cuenta_pago_id] ? nombreCuenta(ix.cta[r.cuenta_pago_id]) : 'sin cuenta'}</div></div>
            </div>
            <div style={{ marginTop: 10 }}><div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 99, height: 6 }}><div style={{ height: 6, borderRadius: 99, background: '#fff', width: `${Math.min(100, r.pct)}%` }} /></div><div style={{ fontSize: 11, opacity: 0.8, marginTop: 3 }}>{r.pct}% amortizado · {r.pagadas}/{r.cuotasTotales} cuotas pagadas{r.abonos.length ? ` · ${r.abonos.length} abono${r.abonos.length > 1 ? 's' : ''} ${fmtCOP(r.abonos.reduce((a, x) => a + +x.monto, 0))}` : ''}{r.ultimoAjuste ? ` · saldo según extracto ${fmtDate(r.ultimoAjuste.fecha)}` : ''}</div></div>
          </div>
          {r.estado === 'Activo' && r.proxima && !isOpen && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, padding: '10px 12px' }}><SmallBtn onClick={() => setOpen(r.id)} bg="#fff" color={T.tinta}>Ver tabla</SmallBtn><SmallBtn onClick={() => pagarC(r, r.proxima)} bg={anticipada ? '#fff' : T.morado} color={anticipada ? T.ambar : '#fff'}><Icon name={anticipada ? 'clock' : 'check'} size={12} />{anticipada ? `Cuota ${r.proxima.n} · vence ${fmtDate(r.proxima.fecha)}` : `Pagar cuota ${r.proxima.n}`}</SmallBtn></div>}
          {isOpen && <div style={{ borderTop: `1px solid ${T.divisor}` }}>
            <div style={{ padding: '10px 12px 4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}><div style={{ fontWeight: 700, fontSize: 12, color: T.tinta }}>Tabla de amortización</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {r.estado === 'Activo' && <SmallBtn onClick={() => { setFa({ fecha: today(), monto: '', cuenta_id: r.cuenta_pago_id || '', modo: 'plazo', motivo: '' }); setAbono(r) }} bg={T.morado} color="#fff"><Icon name="banknote" size={12} />Abonar a capital</SmallBtn>}
                {r.estado === 'Activo' && r.proxima && <SmallBtn onClick={() => setAjuste(r)} bg="#fff" color={T.morado} title="Ajustar saldo según extracto"><Icon name="refresh" size={12} />Ajustar saldo</SmallBtn>}
                <SmallBtn onClick={() => setShowAll(p => ({ ...p, [r.id]: !vT }))} bg="#fff" color={T.gris}>{vT ? 'Menos' : 'Todas'}</SmallBtn><SmallBtn onClick={() => setMover({ tabla: 'deudas', id: r.id, nombre: r.nombre })} bg="#fff" color={T.gris}><Icon name="arrow-right" size={12} />Mover</SmallBtn><SmallBtn onClick={() => { setForm({ ...r, capital_inicial: String(r.capital_inicial), tasa_mensual: String(r.tasa_mensual), total_cuotas: String(r.total_cuotas), seguro_mensual: String(r.seguro_mensual || ''), cuotas_previas: String(r.cuotas_previas || '') }); setModal(r) }} bg="#fff" color={T.morado}><Icon name="pencil" size={13} /></SmallBtn><SmallBtn onClick={async () => { if (window.confirm('¿Eliminar este crédito y su historial de cuotas?')) await borrar('deudas', r.id) }} bg="#fff" color={T.rojo}><Icon name="trash" size={13} /></SmallBtn></div></div>
            {r.abonos.length > 0 && <div style={{ padding: '4px 12px 6px', fontSize: 11, color: T.gris }}>{r.abonos.map(a => <div key={a.id}>Abono a capital {fmtCOP(a.monto)} el {fmtDate(a.fecha)} · {a.modo === 'plazo' ? 'misma cuota, menos plazo' : 'mismo plazo, cuota menor'}{a.motivo ? ` · ${a.motivo}` : ''}</div>)}</div>}
            {r.ajustes.length > 0 && <div style={{ padding: '4px 12px 6px', fontSize: 11, color: T.ambar }}>{r.ajustes.slice().sort((a, b) => a.despues_de_cuota - b.despues_de_cuota).map(a => <div key={a.id}>Saldo ajustado a {fmtCOP(a.saldo_real)} tras la cuota {a.despues_de_cuota} ({fmtDate(a.fecha)}) · {+a.diferencia >= 0 ? '+' : '−'}{fmtCOP(Math.abs(a.diferencia))} frente a lo calculado · {a.motivo}</div>)}</div>}
            <div style={{ overflowX: 'auto', padding: '0 8px 12px' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: 420 }}>
              <thead><tr style={{ background: T.divisor }}>{['N°', 'Fecha', 'Capital', 'Interés', +r.seguro_mensual > 0 ? 'Seguro' : null, 'Cuota', 'Pagado', 'Estado', ''].filter(h => h !== null).map(h => <th key={h} style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, fontWeight: 700, color: T.gris }}>{h}</th>)}</tr></thead>
              <tbody>{rows.map(c => { const venc = !c.pago && c.fecha < today(); const pr = c.pago?.monto_pagado; const dif = pr != null ? +pr - c.total : null; const ant = !c.pago && esAnticipado(c.fecha); return (
                <tr key={c.n} style={{ borderBottom: `1px solid ${T.divisor}`, background: c.pago ? T.verdeFondo : venc ? T.rojoFondo : '' }}>
                  <td style={{ padding: '6px 8px', fontWeight: 700, color: T.morado }}>{c.n}</td><td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fmtDate(c.fecha)}</td>
                  <td style={{ padding: '6px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtCOP(c.capital)}</td><td style={{ padding: '6px 8px', color: T.gris, whiteSpace: 'nowrap' }}>{fmtCOP(c.interes)}</td>
                  {+r.seguro_mensual > 0 && <td style={{ padding: '6px 8px', color: T.gris, whiteSpace: 'nowrap' }}>{fmtCOP(c.seguro)}</td>}
                  <td style={{ padding: '6px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtCOP(c.total)}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{pr != null ? <span style={{ fontWeight: 700, color: dif > 0 ? T.rojo : dif < 0 ? T.verde : T.tinta }}>{fmtCOP(pr)}</span> : <span style={{ color: '#D9D2EA' }}>—</span>}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{c.pago?.previa ? <span style={{ color: T.gris, fontSize: 11, fontWeight: 700 }}>Pagada antes de la app</span> : c.pago ? <span style={{ color: T.verde, fontSize: 11, fontWeight: 700 }}>✓ {fmtDate(c.pago.fecha_pago)}</span> : venc ? <span style={{ color: T.rojo, fontSize: 11, fontWeight: 700 }}>Vencida</span> : <span style={{ color: T.gris, fontSize: 11 }}>Pendiente</span>}</td>
                  <td style={{ padding: '6px 8px' }}>{!c.pago ? (r.estado === 'Activo' && (r.proxima?.n === c.n) ? <button onClick={() => pagarC(r, c)} title={ant ? 'Pago anticipado: pide motivo' : 'Pagar'} style={btnTabla(ant ? '#fff' : T.morado, ant ? T.ambar : '#fff', ant ? { border: `1px solid ${T.ambar}` } : {})}>{ant ? 'Anticipar' : 'Pagar'}</button> : null) : c.pago?.previa ? null : <button onClick={() => anularC(c)} style={btnTabla('#fff', T.gris, { border: `1px solid ${T.divisor}` })}>Anular</button>}</td>
                </tr>) })}
              {!vT && r.am.length > rows.length && <tr><td colSpan={9} style={{ padding: 8, textAlign: 'center', color: T.grisClaro, fontSize: 10 }}>…{r.am.length - rows.length} más</td></tr>}</tbody>
            </table></div>
          </div>}
        </div>) })}

      {modal && <Modal title={modal === 'add' ? 'Nuevo crédito' : 'Editar crédito'} onClose={() => setModal(null)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Nombre" full><input value={form.nombre} onChange={e => sf('nombre', e.target.value)} style={inp} /></Field>
          <Field label="Tipo"><select value={form.tipo} onChange={e => sf('tipo', e.target.value)} style={sel}>{TIPOS_DEUDA.map(x => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Sistema de cuota"><select value={form.sistema || 'fija'} onChange={e => sf('sistema', e.target.value)} style={sel}><option value="fija">Cuota fija</option><option value="capital">Abono fijo a capital (cuota decreciente)</option></select></Field>
          <Field label="Capital inicial"><input type="number" inputMode="numeric" value={form.capital_inicial} onChange={e => sf('capital_inicial', e.target.value)} style={inp} /></Field>
          <Field label="Tasa mensual (%)"><input type="number" inputMode="decimal" step="0.01" value={form.tasa_mensual} onChange={e => sf('tasa_mensual', e.target.value)} style={inp} /></Field>
          <Field label="Total cuotas"><input type="number" inputMode="numeric" value={form.total_cuotas} onChange={e => sf('total_cuotas', e.target.value)} style={inp} /></Field>
          <Field label="Seguros mensuales (COP)"><input type="number" inputMode="numeric" value={form.seguro_mensual || ''} onChange={e => sf('seguro_mensual', e.target.value)} style={inp} placeholder="Vida + todo riesgo" /></Field>
          <Field label="Primera cuota"><input type="date" value={form.fecha_primera_cuota} onChange={e => sf('fecha_primera_cuota', e.target.value)} style={inp} /></Field>
          <Field label="Cuotas ya pagadas antes de la app"><input type="number" inputMode="numeric" value={form.cuotas_previas || ''} onChange={e => sf('cuotas_previas', e.target.value)} placeholder="0" style={inp} /></Field>
          {modal === 'add' && <Field label="Saldo real hoy según extracto (opcional)"><input type="number" inputMode="numeric" value={form.saldo_real} onChange={e => sf('saldo_real', e.target.value)} placeholder="Si difiere del calculado" style={inp} /></Field>}
          {modal === 'add' && <Field label="Fecha de ese saldo"><input type="date" value={form.fecha_saldo} onChange={e => sf('fecha_saldo', e.target.value)} style={inp} /></Field>}
          <Field label="Cuenta de pago"><select value={form.cuenta_pago_id || ''} onChange={e => sf('cuenta_pago_id', e.target.value || null)} style={sel}>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{nombreCuenta(x)}</option>)}</select></Field>
          <Field label="Activo asociado"><select value={form.activo_id || ''} onChange={e => sf('activo_id', e.target.value || null)} style={sel}><option value="">— Ninguno —</option>{db.activos.map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          <Field label="Estado"><select value={form.estado} onChange={e => sf('estado', e.target.value)} style={sel}><option>Activo</option><option>Cancelado</option></select></Field>
          <Field label="Notas" full><input value={form.notas || ''} onChange={e => sf('notas', e.target.value)} style={inp} /></Field>
        </div>
        {cfEst > 0 && <div style={{ background: T.superficie, borderRadius: 12, padding: '10px 14px', marginTop: 12, display: 'flex', gap: 20 }}><div><div style={{ fontSize: 11, color: T.gris, fontWeight: 600 }}>{form.sistema === 'capital' ? 'Primera cuota est.' : 'Cuota est.'}{segF ? ' (con seguro)' : ''}</div><div style={{ fontWeight: 800, fontSize: 15, color: T.morado }}>{fmtCOP(cfEst)}</div></div><div><div style={{ fontSize: 11, color: T.gris, fontWeight: 600 }}>Total a pagar est.</div><div style={{ fontWeight: 800, fontSize: 15, color: T.rojo }}>{fmtCOP(totalEst)}</div></div></div>}
        {modal !== 'add' && modal.pagadas > 0 && <div style={{ marginTop: 10 }}><Aviso tipo="info">Las {modal.pagadas} cuotas ya pagadas no cambian; la tabla se recalcula solo hacia adelante. El saldo real se ajusta con el botón "Ajustar saldo" en la tabla.</Aviso></div>}
        {modal === 'add' && form.saldo_real !== '' && <div style={{ marginTop: 10 }}><Aviso tipo="info">Las cuotas restantes se calcularán desde el saldo real que indiques, no desde el capital inicial menos las cuotas previas.</Aviso></div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={saveD}>Guardar</SaveBtn></div>
      </Modal>}

      {abono && <Modal title={`Abono a capital · ${abono.nombre}`} onClose={() => setAbono(null)}>
        <Aviso tipo="info">Saldo de capital pendiente: <b>{fmtCOP(abono.capitalPendiente)}</b>. El abono se registra como salida de caja y la tabla se recalcula desde la cuota {abono.pagadas + 1}.</Aviso>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
          <Field label="Fecha"><input type="date" value={fa.fecha} onChange={e => sfa('fecha', e.target.value)} style={inp} /></Field>
          <Field label="Monto (COP)"><input type="number" inputMode="numeric" autoFocus value={fa.monto} onChange={e => sfa('monto', e.target.value)} style={inp} /></Field>
          <Field label="Cuenta de donde sale" full><select value={fa.cuenta_id || ''} onChange={e => sfa('cuenta_id', e.target.value)} style={sel}>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{nombreCuenta(x)}</option>)}</select></Field>
          <Field label="¿Qué se recalcula?" full>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[['plazo', 'Reducir plazo', 'Misma cuota, se acaba antes. Paga menos intereses.'], ['cuota', 'Reducir cuota', 'Mismo número de cuotas, cada una más baja.']].map(([k, l, d]) => <button key={k} onClick={() => sfa('modo', k)} style={{ textAlign: 'left', padding: '11px 14px', borderRadius: 12, border: '1.5px solid', borderColor: fa.modo === k ? T.morado : T.divisor, background: fa.modo === k ? T.superficie : '#fff', cursor: 'pointer', fontFamily: 'inherit', color: T.tinta }}><div style={{ fontWeight: 700, fontSize: 13 }}>{l}</div><div style={{ fontSize: 11, color: T.gris, marginTop: 2 }}>{d}</div></button>)}
            </div>
          </Field>
          <Field label="Motivo (opcional)" full><input value={fa.motivo} onChange={e => sfa('motivo', e.target.value)} style={inp} placeholder="Prima, cesantías, venta…" /></Field>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setAbono(null)} /><SaveBtn onClick={abonar} disabled={!(parseMonto(fa.monto) > 0)}>Registrar abono</SaveBtn></div>
      </Modal>}

      {pago && <PagoCuota r={pago.r} c={pago.c} onClose={() => setPago(null)} onConfirm={o => ejecutarPago(pago.r, pago.c, o)} />}
      {ajuste && <AjustarSaldo r={ajuste} onClose={() => setAjuste(null)} onConfirm={ajustar} />}
      {mover && <MoverA item={mover} onClose={() => setMover(null)} />}
    </div>
  )
}


function Tarjeta({ r, esDueno, onMover }) {
  const { db, all, insertar, actualizar, borrar, rpc, nombreCuenta, espacioDe, duenoCuenta, nombreMiembro } = useData(); const ix = useIndices(); const { esPersonal, espacio } = useAuth()
  const [open, setOpen] = useState(false); const [cargoOpen, setCargoOpen] = useState(null); const [modal, setModal] = useState(null)
  // Para la factura: todas las compras de esta tarjeta en todos mis espacios (solo el dueño la paga)
  const idxAll = indicePagadas(all.cuotas_pagadas); const rAll = resumenTarjeta(r.cuenta, all.tc_cargos, idxAll)
  const [form, sf, setForm] = useForm({})
  const tc = r.cuenta; const corte = tc.dia_corte || 15; const tasaDefault = +tc.tasa_mensual || 0
  const cuentasCaja = db.cuentas.filter(c => c.tipo !== TC)
  const primeraCuota = f => { const d = new Date(f + 'T12:00:00'); const y = d.getFullYear(), m = d.getMonth(); const dc = Math.min(corte, 28); const corteMes = new Date(y, m, dc, 12); const base = d <= corteMes ? corteMes : new Date(y, m + 1, dc, 12); return new Date(base.getFullYear(), base.getMonth() + 1, dc, 12).toISOString().slice(0, 10) }
  const emptyC = { fecha: today(), descripcion: '', monto: '', cuotas: '1', cuotas_previas: '', categoria_id: db.categorias.find(c => c.activa !== false)?.id || null, activo_id: null, primera_cuota: primeraCuota(today()) }
  // Decisión del dueño: al registrar una compra no se conoce el interés; la compra se amortiza como capital/n y el banco
  // cobra los intereses aparte (entran con el extracto como línea de la factura). La tasa de la tarjeta solo estima.
  const montoC = parseMonto(form.monto) || 0, cuotasC = parseInt(form.cuotas) || 0
  const cfC = montoC && cuotasC ? Math.round(montoC / cuotasC) : 0
  const saveCompra = async () => {
    if (!form.descripcion || montoC <= 0 || cuotasC < 1) return
    const row = { cuenta_id: tc.id, fecha: form.fecha, descripcion: form.descripcion, monto: montoC, cuotas: cuotasC, cuotas_previas: Math.max(0, Math.min(parseInt(form.cuotas_previas) || 0, cuotasC - 1)), tasa_mensual: 0, categoria_id: form.categoria_id || null, activo_id: form.activo_id || null, primera_cuota: form.primera_cuota }
    try { modal === 'compra' ? await insertar('tc_cargos', row) : await actualizar('tc_cargos', form.id, row); setModal(null) } catch (e) { alert(e.message) }
  }
  // Factura
  const ultimoExtracto = db.tc_extractos.filter(x => x.cuenta_id === tc.id).sort((a, b) => b.fecha_corte.localeCompare(a.fecha_corte))[0] || null
  const openFactura = (ex = ultimoExtracto) => { const incl = {}, ext = {}; rAll.activos.forEach(c => { incl[c.id] = true; ext[c.id] = String(c.next.total) }); setForm({ fecha: today(), cuenta_pago_id: cuentasCaja[0]?.id || null, incl, ext, manejo: ex?.cuota_manejo ? String(ex.cuota_manejo) : '', mora: ex?.mora ? String(ex.mora) : '', seguros: ex?.seguro ? String(ex.seguro) : '', intereses: ex?.intereses ? String(ex.intereses) : '', otros: '', presupuesto_id: '' }); setModal('factura') }
  const inclList = rAll.activos.filter(c => form.incl?.[c.id]); const esperado = inclList.reduce((a, c) => a + c.next.total, 0); const extracto = inclList.reduce((a, c) => a + (parseMonto(form.ext?.[c.id]) || 0), 0)
  const fM = parseMonto(form.manejo) || 0, fMo = parseMonto(form.mora) || 0, fS = parseMonto(form.seguros) || 0, fI = parseMonto(form.intereses) || 0, fO = parseMonto(form.otros) || 0; const extras = fM + fMo + fS + fI + fO; const totalPagar = extracto + extras; const dif = extracto - esperado
  const saveFactura = async () => {
    if (!inclList.length && !extras) return
    const items = inclList.map(c => ({ cargo_id: c.id, descripcion: c.descripcion, n: c.next.n, de: c.cuotas, esperado: c.next.total, pagado: parseMonto(form.ext[c.id]) || 0, capital: c.next.capital, interes: c.next.interes }))
    try { await rpc('pagar_factura_tc', { p_tc: tc.id, p_fecha: form.fecha, p_cuenta_pago: form.cuenta_pago_id, p_items: items, p_extras: { cuota_manejo: fM, mora: fMo, seguros: fS, intereses: fI, otros: fO }, p_presupuesto_id: form.presupuesto_id || null }); setModal(null) } catch (e) { alert(e.message) }
  }
  const anularCuota = async x => { if (!window.confirm('¿Anular esta cuota? (El movimiento de la factura no se borra)')) return; await borrar('cuotas_pagadas', x.pago.id) }
  const usoPct = r.cupo > 0 ? Math.min(100, Math.round(rAll.saldo / r.cupo * 100)) : 0

  return (
    <div data-item={tc.nombre} style={{ background: '#F3F1F8', borderRadius: 16, overflow: 'hidden' }}>
      <div onClick={() => setOpen(!open)} style={{ padding: '14px 16px', cursor: 'pointer', background: '#4B1D9E', color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div><div style={{ fontSize: 11, opacity: 0.75, fontWeight: 600 }}>Tarjeta de crédito{!esDueno ? ` · de ${nombreMiembro(duenoCuenta(tc))}` : ''}</div><div style={{ fontWeight: 800, fontSize: 15, marginTop: 2 }}>{tc.nombre}</div><div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>{tc.banco || ''}{tc.ultimos4 ? ` •••• ${tc.ultimos4}` : ''} · corte día {corte}{!esPersonal ? ` · compras de ${espacio.nombre}` : ''}</div></div>
          <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginTop: 14 }}>
          <div><div style={{ fontSize: 11, opacity: 0.7 }}>{esPersonal ? 'Saldo total' : 'Saldo de este espacio'}</div><div style={{ fontWeight: 800, fontSize: 14 }}>{fmtCOP(esPersonal ? rAll.saldo : r.saldo)}</div>{esPersonal && rAll.saldo !== r.saldo && <div style={{ fontSize: 11, opacity: 0.7 }}>personal {fmtCOP(r.saldo)}</div>}</div>
          <div><div style={{ fontSize: 11, opacity: 0.7 }}>Próxima factura</div><div style={{ fontWeight: 800, fontSize: 14, color: '#FFD166' }}>{fmtCOP(esPersonal ? rAll.proximaFactura : r.proximaFactura)}</div>{(esPersonal ? rAll : r).proximaFecha && <div style={{ fontSize: 11, opacity: 0.7 }}>{fmtDate((esPersonal ? rAll : r).proximaFecha)}{tasaDefault > 0 && (esPersonal ? rAll : r).saldo > 0 ? ` · + int. ≈ ${fmtCOP((esPersonal ? rAll : r).saldo * tasaDefault / 100)}` : ''}</div>}</div>
          {esDueno ? <div><div style={{ fontSize: 11, opacity: 0.7 }}>Cupo disponible</div><div style={{ fontWeight: 800, fontSize: 14, color: rAll.disponible < 0 ? '#F4A79D' : '#7FD6AD' }}>{fmtCOP(rAll.disponible)}</div></div> : <div><div style={{ fontSize: 11, opacity: 0.7 }}>Compras aquí</div><div style={{ fontWeight: 800, fontSize: 14 }}>{r.activos.length}</div></div>}
        </div>
        {esDueno && r.cupo > 0 && <div style={{ marginTop: 10 }}><div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 99, height: 6 }}><div style={{ height: 6, borderRadius: 99, background: usoPct > 80 ? '#F4A79D' : usoPct > 50 ? '#FFD166' : '#7FD6AD', width: `${usoPct}%` }} /></div><div style={{ fontSize: 11, opacity: 0.75, marginTop: 3 }}>{usoPct}% del cupo ({fmtCOP(r.cupo)}) · {rAll.activos.length} compra{rAll.activos.length !== 1 ? 's' : ''} activa{rAll.activos.length !== 1 ? 's' : ''}{rAll.activos.length !== r.activos.length ? ` (${r.activos.length} en este espacio)` : ''}</div></div>}
      </div>
      {esDueno && <EstadoExtracto tc={tc} />}
      <div style={{ display: 'flex', gap: 8, padding: '12px 14px', borderBottom: open ? '1px solid #EBE9F1' : 'none' }}>
        {esDueno && <button onClick={() => setModal('extracto')} title="Cargar extracto" style={{ width: 40, height: 40, flexShrink: 0, background: '#fff', color: T.morado, border: 'none', borderRadius: 20, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="file" size={18} /></button>}
        <button onClick={() => { setForm(emptyC); setModal('compra') }} style={{ flex: 1, background: '#fff', color: '#1B1B1F', border: 'none', borderRadius: 20, height: 40, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}><IcoText name="cart" size={14}>Registrar compra</IcoText></button>
        {esPersonal && esDueno ? <button onClick={() => openFactura()} disabled={!rAll.activos.length} style={{ flex: 1, background: rAll.activos.length ? '#4B1D9E' : '#EBE9F1', color: rAll.activos.length ? '#fff' : '#9A9AA0', border: 'none', borderRadius: 20, height: 40, fontWeight: 800, fontSize: 13, fontFamily: 'inherit', cursor: rAll.activos.length ? 'pointer' : 'not-allowed' }}><IcoText name="banknote" size={14}>Pagar factura</IcoText></button> : <div style={{ flex: 1, fontSize: 10, color: '#6E6E73', display: 'flex', alignItems: 'center', padding: '0 6px' }}>{esDueno ? 'La factura se paga desde tu espacio personal.' : `La factura la paga ${nombreMiembro(duenoCuenta(tc))} desde su espacio personal.`}</div>}
      </div>
      {open && <div style={{ padding: '4px 0 12px' }}>
        <div style={{ padding: '8px 14px 6px', fontWeight: 700, fontSize: 12, color: '#1B1B1F' }}>Compras ({r.cargos.length})</div>
        {r.cargos.length === 0 && <div style={{ padding: '10px 14px', color: '#9A9AA0', fontSize: 12 }}>Sin compras en este espacio. No afectan la caja hasta que se pague la factura.</div>}
        {[...r.cargos].sort((a, b) => (a.liquidado ? 1 : 0) - (b.liquidado ? 1 : 0) || b.fecha.localeCompare(a.fecha)).map(c => { const isO = cargoOpen === c.id; const pct = Math.round(c.pagadas / c.cuotas * 100); return (
          <div key={c.id} style={{ margin: '0 10px 8px', borderRadius: 12, border: '1px solid #EBE9F1', background: c.liquidado ? '#EBE9F1' : '#fff', overflow: 'hidden' }}>
            <div onClick={() => setCargoOpen(isO ? null : c.id)} style={{ padding: '10px 12px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 13, color: c.liquidado ? '#9A9AA0' : '#1B1B1F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descripcion}</div><div style={{ fontSize: 10, color: '#6E6E73', marginTop: 2 }}>{fmtDate(c.fecha)} · {ix.cat[c.categoria_id]?.nombre || '—'} · {c.cuotas} cuota{c.cuotas > 1 ? 's' : ''} {+c.tasa_mensual > 0 ? `al ${c.tasa_mensual}%` : 'sin interés'} · registró {nombreMiembro(c.creado_por)}</div></div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontWeight: 800, fontSize: 13 }}>{fmtCOP(c.monto)}</div>{c.liquidado ? <span style={{ color: '#0F6B47', fontSize: 11, fontWeight: 700 }}>Liquidada</span> : <div style={{ fontSize: 10, color: '#B42318' }}>Debe {fmtCOP(c.saldo)}</div>}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}><div style={{ flex: 1, background: '#EBE9F1', borderRadius: 99, height: 5 }}><div style={{ height: 5, borderRadius: 99, background: '#4B1D9E', width: `${pct}%` }} /></div><span style={{ fontSize: 10, color: '#4B1D9E', fontWeight: 700 }}>{c.pagadas}/{c.cuotas}</span>{c.next && <span style={{ fontSize: 10, color: '#6E6E73' }}>· próx. {fmtCOP(c.next.total)} el {fmtDate(c.next.fecha)}</span>}</div>
            </div>
            {isO && <div style={{ borderTop: '1px solid #EBE9F1', padding: '8px 8px 10px' }}>
              <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, minWidth: 340 }}>
                <thead><tr style={{ background: '#EBE9F1' }}>{['N°', 'Fecha', 'Capital', 'Interés', 'Esperado', 'Pagado', 'Estado'].map(h => <th key={h} style={{ padding: '5px 7px', textAlign: 'left', fontSize: 9, fontWeight: 700, color: '#6E6E73' }}>{h}</th>)}</tr></thead>
                <tbody>{c.am.map(x => { const venc = !x.pago && x.fecha < today(); const pr = x.pago?.monto_pagado; const d = pr != null ? +pr - x.total : null; return (
                  <tr key={x.n} style={{ borderBottom: '1px solid #EBE9F1', background: x.pago ? '#E7F5EE' : venc ? '#fff5f5' : '' }}>
                    <td style={{ padding: '5px 7px', fontWeight: 700, color: '#4B1D9E' }}>{x.n}</td><td style={{ padding: '5px 7px', whiteSpace: 'nowrap' }}>{fmtDate(x.fecha)}</td><td style={{ padding: '5px 7px', whiteSpace: 'nowrap' }}>{fmtCOP(x.capital)}</td><td style={{ padding: '5px 7px', color: '#9A9AA0', whiteSpace: 'nowrap' }}>{fmtCOP(x.interes)}</td><td style={{ padding: '5px 7px', fontWeight: 700, whiteSpace: 'nowrap' }}>{fmtCOP(x.total)}</td>
                    <td style={{ padding: '5px 7px', whiteSpace: 'nowrap' }}>{pr != null ? <span style={{ fontWeight: 700, color: d > 0 ? '#B42318' : d < 0 ? '#138A5B' : '#1B1B1F' }}>{fmtCOP(pr)}</span> : <span style={{ color: '#D9D2EA' }}>—</span>}</td>
                    <td style={{ padding: '5px 7px' }}>{x.pago?.previa ? <span style={{ color: '#6E6E73', fontSize: 10, fontWeight: 700 }}>Pagada antes</span> : x.pago ? <button onClick={() => anularCuota(x)} style={{ fontSize: 9, background: '#E7F5EE', color: '#0F6B47', border: 'none', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', fontWeight: 700 }}>✓ {fmtDate(x.pago.fecha_pago)}</button> : venc ? <span style={{ color: '#B42318', fontSize: 11, fontWeight: 700 }}>Vencida</span> : <span style={{ background: '#F3F1F8', color: '#6E6E73', padding: '1px 6px', borderRadius: 8, fontSize: 9 }}>Pend.</span>}</td>
                  </tr>) })}</tbody></table></div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 8 }}><SmallBtn onClick={() => onMover({ tabla: 'tc_cargos', id: c.id, nombre: c.descripcion })} bg="#F3F1F8" color="#6E6E73"><Icon name="arrow-right" size={12} />Mover</SmallBtn><SmallBtn onClick={() => { setForm({ ...c, monto: String(c.monto), cuotas: String(c.cuotas), tasa_mensual: String(c.tasa_mensual), cuotas_previas: String(c.cuotas_previas || '') }); setModal('editCargo') }} bg="#F3F1F8" color="#4B1D9E"><Icon name="pencil" size={12} />Editar</SmallBtn><SmallBtn onClick={async () => { if (window.confirm('¿Eliminar esta compra y sus cuotas?')) await borrar('tc_cargos', c.id) }} bg="#FBEAE7" color="#B42318"><Icon name="trash" size={12} />Eliminar</SmallBtn></div>
            </div>}
          </div>) })}
      </div>}

      {(modal === 'compra' || modal === 'editCargo') && <Modal title={modal === 'compra' ? `Compra con ${tc.nombre}` : 'Editar compra'} onClose={() => setModal(null)}>
        <div style={{ marginBottom: 14 }}><Aviso tipo="info">Esta compra NO afecta la caja. Se convierte en cuotas dentro de la tarjeta{!esPersonal ? ` y queda como gasto de ${espacio.nombre}; al pagar la factura, su porción será aporte de ${nombreMiembro(duenoCuenta(tc))}` : ' y la pagas con la factura mensual'}.</Aviso></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Descripción" full><input value={form.descripcion || ''} onChange={e => sf('descripcion', e.target.value)} style={inp} placeholder="Ej. Televisor, Mercado Éxito…" /></Field>
          <Field label="Fecha compra"><input type="date" value={form.fecha || ''} onChange={e => { sf('fecha', e.target.value); if (modal === 'compra') sf('primera_cuota', primeraCuota(e.target.value)) }} style={inp} /></Field>
          <Field label="Monto (COP)"><input type="number" inputMode="numeric" value={form.monto || ''} onChange={e => sf('monto', e.target.value)} style={inp} /></Field>
          <Field label="N° cuotas *"><input type="number" inputMode="numeric" min="1" max="60" value={form.cuotas || ''} onChange={e => sf('cuotas', e.target.value)} style={{ ...inp, borderColor: !cuotasC ? '#9A5B00' : '#EBE9F1' }} /></Field>
          <Field label="Categoría"><select value={form.categoria_id || ''} onChange={e => sf('categoria_id', e.target.value || null)} style={sel}>{db.categorias.filter(c => c.activa !== false && !['Pago tarjeta crédito', 'Cuota crédito'].includes(c.nombre)).map(x => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></Field>
          <Field label="Activo"><select value={form.activo_id || ''} onChange={e => sf('activo_id', e.target.value || null)} style={sel}><option value="">— Ninguno —</option>{db.activos.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></Field>
          <Field label="Primera cuota"><input type="date" value={form.primera_cuota || ''} onChange={e => sf('primera_cuota', e.target.value)} style={inp} /></Field>
          {cuotasC > 1 && <Field label="Cuotas ya pagadas antes de la app"><input type="number" inputMode="numeric" value={form.cuotas_previas || ''} onChange={e => sf('cuotas_previas', e.target.value)} placeholder="0" style={inp} /></Field>}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>{[1, 3, 6, 12, 24].map(n => <button key={n} onClick={() => sf('cuotas', String(n))} style={{ flex: 1, padding: '6px 0', borderRadius: 8, border: '1px solid', fontSize: 11, fontWeight: 700, cursor: 'pointer', background: cuotasC === n ? '#4B1D9E' : '#fff', color: cuotasC === n ? '#fff' : '#6E6E73', borderColor: cuotasC === n ? '#4B1D9E' : '#EBE9F1' }}>{n}</button>)}</div>
        {cfC > 0 && <div style={{ marginTop: 12, background: '#F3F1F8', borderRadius: 10, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div><div style={{ fontSize: 10, color: '#4B1D9E', fontWeight: 700 }}>Cuota mensual · {cuotasC}</div><div style={{ fontSize: 10, color: '#6E6E73' }}>Capital {fmtCOP(montoC)}{tasaDefault > 0 && cuotasC > 1 ? ` · intereses estimados ≈ ${fmtCOP(montoC * tasaDefault / 100 * (cuotasC + 1) / 2)} (los cobra el banco aparte)` : ' · el banco cobra los intereses aparte'}</div></div><div style={{ fontWeight: 800, fontSize: 16, color: '#4B1D9E' }}>{fmtCOP(cfC)}</div></div>}
        {esDueno && montoC > rAll.disponible && r.cupo > 0 && modal === 'compra' && <div style={{ marginTop: 8 }}><Aviso tipo="warn">Esta compra supera el cupo disponible ({fmtCOP(rAll.disponible)}).</Aviso></div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={saveCompra} disabled={!form.descripcion || montoC <= 0 || cuotasC < 1}>{modal === 'compra' ? 'Registrar compra' : 'Guardar'}</SaveBtn></div>
      </Modal>}

      {modal === 'extracto' && <ImportarExtracto tc={tc} r={r} saldoApp={rAll.saldo} onClose={() => setModal(null)} />}
      {modal === 'factura' && <Modal title={`Pagar factura · ${tc.nombre}`} onClose={() => setModal(null)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Field label="Fecha de pago"><input type="date" value={form.fecha} onChange={e => sf('fecha', e.target.value)} style={inp} /></Field>
          <Field label="Cuenta desde la que pagas"><select value={form.cuenta_pago_id || ''} onChange={e => sf('cuenta_pago_id', e.target.value)} style={sel}>{cuentasCaja.map(x => <option key={x.id} value={x.id}>{nombreCuenta(x)}</option>)}</select></Field>
        </div>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#1B1B1F', marginBottom: 6 }}>Cuotas del extracto — ajusta cada valor al del banco</div>
        <div style={{ border: '1px solid #EBE9F1', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
          {rAll.activos.map((c, i) => { const on = !!form.incl?.[c.id]; const v = parseMonto(form.ext?.[c.id]) || 0; const d = v - c.next.total; const esp = espacioDe(c.espacio_id); return (
            <div key={c.id} style={{ padding: '10px 12px', borderBottom: i < rAll.activos.length - 1 ? '1px solid #EBE9F1' : 'none', background: on ? '#fff' : '#EBE9F1', opacity: on ? 1 : 0.6, display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="checkbox" checked={on} onChange={e => setForm(f => ({ ...f, incl: { ...f.incl, [c.id]: e.target.checked } }))} style={{ width: 18, height: 18, accentColor: '#4B1D9E' }} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.descripcion}{esp && esp.tipo !== 'personal' && <span style={{ marginLeft: 6, fontSize: 9, background: '#E7F5EE', color: '#138A5B', padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>{esp.nombre}</span>}</div><div style={{ fontSize: 10, color: '#6E6E73' }}>Cuota {c.next.n}/{c.cuotas} · cap {fmtCOP(c.next.capital)} + int {fmtCOP(c.next.interes)} = <b>{fmtCOP(c.next.total)}</b></div></div>
              <div style={{ width: 118 }}><input type="number" inputMode="numeric" value={form.ext?.[c.id] ?? ''} disabled={!on} onChange={e => setForm(f => ({ ...f, ext: { ...f.ext, [c.id]: e.target.value } }))} style={{ ...inp, padding: '7px 8px', fontSize: 13, textAlign: 'right', fontWeight: 700, borderColor: d !== 0 && on ? (d > 0 ? '#F4A79D' : '#7FD6AD') : '#EBE9F1' }} />{on && d !== 0 && <div style={{ fontSize: 9, textAlign: 'right', color: d > 0 ? '#B42318' : '#138A5B', marginTop: 2 }}>{d > 0 ? '+' : ''}{fmtCOP(d)}</div>}</div>
            </div>) })}
        </div>
        <div style={{ fontWeight: 700, fontSize: 12, color: '#1B1B1F', marginBottom: 2 }}>Cargos adicionales del extracto</div>
        <div style={{ fontSize: 11, color: T.gris, marginBottom: 8 }}>Las cuotas de arriba son capital. El banco cobra los intereses aparte: van aquí, no dentro de cada compra.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <Field label="Intereses corrientes"><input type="number" inputMode="numeric" value={form.intereses || ''} onChange={e => sf('intereses', e.target.value)} style={inp} placeholder="0" /></Field>
          <Field label="Cuota de manejo"><input type="number" inputMode="numeric" value={form.manejo} onChange={e => sf('manejo', e.target.value)} style={inp} placeholder="0" /></Field>
          <Field label="Interés de mora"><input type="number" inputMode="numeric" value={form.mora} onChange={e => sf('mora', e.target.value)} style={inp} placeholder="0" /></Field>
          <Field label="Seguros"><input type="number" inputMode="numeric" value={form.seguros} onChange={e => sf('seguros', e.target.value)} style={inp} placeholder="0" /></Field>
          <Field label="Otros"><input type="number" inputMode="numeric" value={form.otros} onChange={e => sf('otros', e.target.value)} style={inp} placeholder="0" /></Field>
        </div>
        <div style={{ background: '#F3F1F8', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: '#6E6E73' }}>Esperado ({inclList.length} cuota{inclList.length !== 1 ? 's' : ''})</span><b>{fmtCOP(esperado)}</b></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}><span style={{ color: '#6E6E73' }}>Según extracto</span><b>{fmtCOP(extracto)}</b></div>
          {dif !== 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: dif > 0 ? '#B42318' : '#138A5B' }}><span>Diferencia en cuotas</span><b>{dif > 0 ? '+' : ''}{fmtCOP(dif)}</b></div>}
          {extras > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', color: '#9A5B00' }}><span>Cargos adicionales</span><b>+{fmtCOP(extras)}</b></div>}
          {(() => { const comp = inclList.filter(c => c.espacio_id !== tc.espacio_id).reduce((a, c) => a + (parseMonto(form.ext?.[c.id]) || 0), 0); return comp > 0 ? <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', color: '#138A5B' }}><span>De espacios compartidos (queda como aporte tuyo)</span><b>{fmtCOP(comp)}</b></div> : null })()}
          <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid #4B1D9E', marginTop: 6, paddingTop: 8 }}><span style={{ fontWeight: 800, fontSize: 14 }}>TOTAL A PAGAR</span><span style={{ fontWeight: 800, fontSize: 16, color: '#4B1D9E' }}>{fmtCOP(totalPagar)}</span></div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={saveFactura} disabled={!inclList.length && !extras}>Registrar pago {fmtCOP(totalPagar)}</SaveBtn></div>
      </Modal>}
    </div>
  )
}
