// Cargar el extracto de una tarjeta (PDF o foto): el servidor lo interpreta, aquí se concilia con lo que
// ya existe y el usuario decide qué crear o ajustar. Sirve para la carga inicial (trae todas las compras
// vigentes con sus cuotas ya pagadas) y para el cargue periódico (solo entran las compras nuevas).
import { useState, useRef } from 'react'
import { useData } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Modal, Field, inp, sel, SaveBtn, CancelBtn, SmallBtn, Aviso, Icon, Kpi, T } from '../lib/ui'
import { fmtCOP, fmtDate, today, addMonths } from '../lib/util'
import { conciliar, diferenciaSaldo } from '../lib/extracto'
import { supabase } from '../lib/supabase'
import { textoDePdf } from '../lib/pdfTexto'
import { tachar } from '../lib/tachar'

const esperar = ms => new Promise(r => setTimeout(r, ms))

export default function ImportarExtracto({ tc, r, saldoApp, onClose }) {
  const { db, insertarVarios, actualizar, insertar, recargar } = useData(); const { miembroActual } = useAuth()
  const [fase, setFase] = useState('archivo'); const [err, setErr] = useState(''); const [busy, setBusy] = useState(null); const fileRef = useRef()
  const [lectura, setLectura] = useState(null); const [filas, setFilas] = useState([]); const [actualizarCupo, setActualizarCupo] = useState(true)
  const [pedirClave, setPedirClave] = useState(null); const [clave, setClave] = useState('')   // PDF con contraseña: se pide aquí y nunca sale del dispositivo
  const catDefault = db.categorias.find(c => c.activa !== false)?.id || null

  const leer = async (file, password) => {
    setErr(''); setBusy('Leyendo el PDF en tu dispositivo…')
    let lecturaId = null
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!/pdf/i.test(file.type) && !/\.pdf$/i.test(file.name)) throw new Error('Por ahora solo se aceptan extractos en PDF (el archivo que envía el banco).')
      let texto = ''
      try { texto = (await textoDePdf(file, 12, password)).texto }
      catch (e) { if (e.password) { setPedirClave({ file, error: password ? e.message : '' }); setBusy(null); return } throw new Error('No se pudo abrir el PDF (' + (e.message || e.name || 'error desconocido') + ').') }
      if (texto.replace(/\s+/g, '').length < 400) throw new Error('Este PDF es una imagen escaneada, sin texto. Pide al banco el extracto original en PDF.')
      const limpio = tachar(texto, [miembroActual?.nombre, session.user.email?.split('@')[0]])
      if (limpio.length > 200000) throw new Error('El extracto es demasiado largo para leerlo de una vez.')
      // 1) fila pendiente (solo la ve este usuario); 2) la función de fondo procesa y escribe el resultado; 3) se consulta hasta que esté lista
      const { data: fila, error: e1 } = await supabase.from('tc_lecturas').insert({ user_id: session.user.id, cuenta_id: tc.id }).select().single(); if (e1) throw e1
      lecturaId = fila.id
      setBusy('Leyendo el extracto… (15–40 segundos)')
      const res = await fetch('/.netlify/functions/extracto-leer-background', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lectura_id: fila.id, token: session.access_token, texto: limpio, nombres: [miembroActual?.nombre] }) })
      if (!res.ok && res.status !== 202) throw new Error(res.status === 413 ? 'El extracto es demasiado grande para enviarlo.' : 'El servidor no aceptó el extracto (' + res.status + ').')
      let out = null
      for (let i = 0; i < 90; i++) {
        await esperar(2000)
        const { data: l, error: e2 } = await supabase.from('tc_lecturas').select('estado,resultado,error').eq('id', fila.id).single(); if (e2) throw e2
        if (l.estado === 'lista') { out = l.resultado; break }
        if (l.estado === 'error') throw new Error(l.error || 'No se pudo leer el extracto')
        if (i === 20) setBusy('Sigue leyendo… los extractos largos tardan hasta un minuto')
      }
      if (!out) throw new Error('El servidor tardó demasiado. Intenta de nuevo en un momento.')
      const pag = {}; db.cuotas_pagadas.forEach(x => { if (x.cargo_id) pag[x.cargo_id] = (pag[x.cargo_id] || 0) + 1 })
      const existentes = db.tc_cargos.filter(c => c.cuenta_id === tc.id)
      setLectura(out); setFilas(conciliar(out.compras, existentes, pag)); setFase('revisar')
    } catch (e) { setErr(e.message) } finally { setBusy(null); if (lecturaId) supabase.from('tc_lecturas').delete().eq('id', lecturaId).then(() => {}, () => {}) }
  }
  const toggle = i => setFilas(f => f.map((x, k) => k === i ? { ...x, incluir: !x.incluir } : x))
  const nuevas = filas.filter(f => f.estado === 'nueva' && f.incluir), ajustes = filas.filter(f => f.estado === 'ajuste' && f.incluir)
  const dif = lectura ? diferenciaSaldo(saldoApp, lectura.estado) : null
  const primeraCuota = c => { const d = lectura.estado.fecha_corte || today(); return addMonths(d, -(c.cuota_actual - 1)) }  // la cuota 1 se facturó (cuota_actual−1) cortes antes de este

  const confirmar = async () => {
    setBusy('Guardando…'); setErr('')
    try {
      if (nuevas.length) await insertarVarios('tc_cargos', nuevas.map(c => ({ cuenta_id: tc.id, fecha: c.fecha, descripcion: c.descripcion, monto: c.monto, cuotas: c.cuotas, cuotas_previas: c.cuotas_previas, tasa_mensual: c.tasa_mensual ?? (+tc.tasa_mensual || 0), categoria_id: catDefault, primera_cuota: primeraCuota(c), ref_extracto: c.ref })))
      for (const a of ajustes) await actualizar('tc_cargos', a.cargo.id, { cuotas: a.cuotas, cuotas_previas: a.nuevasPrevias, ref_extracto: a.ref })
      const e = lectura.estado
      if (e.fecha_corte) {
        const prev = db.tc_extractos.find(x => x.cuenta_id === tc.id && x.fecha_corte === e.fecha_corte)
        const fila = { cuenta_id: tc.id, banco: e.banco, periodo_inicio: e.periodo_inicio, periodo_fin: e.periodo_fin, fecha_corte: e.fecha_corte, fecha_limite: e.fecha_limite, cupo: e.cupo, utilizado: e.utilizado, disponible: e.disponible, pago_total: e.pago_total, pago_minimo: e.pago_minimo, intereses: e.intereses, mora: e.mora, cuota_manejo: e.cuota_manejo, seguro: e.seguro, abonos: e.abonos, lineas: { compras: lectura.compras, otros: lectura.otros }, advertencias: lectura.advertencias }
        prev ? await actualizar('tc_extractos', prev.id, fila) : await insertar('tc_extractos', fila)
      }
      if (actualizarCupo && e.cupo && +e.cupo !== +(tc.cupo || 0)) await actualizar('cuentas', tc.id, { cupo: e.cupo })
      await recargar(); onClose()
    } catch (ex) { setErr(ex.message); setBusy(null) }
  }

  return (
    <Modal title={`Cargar extracto · ${tc.nombre}`} onClose={onClose}>
      {fase === 'archivo' && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Aviso tipo="info">Sube el extracto en <b>PDF</b> (el que te manda el banco). El PDF <b>no sale de tu dispositivo</b>: aquí mismo se extrae el texto y se tachan tu nombre, documento, número de tarjeta, dirección, correo y teléfono; solo ese texto se envía para interpretarlo, y no se guarda. Después revisas qué compras se crean; nada entra sin tu confirmación.</Aviso>
        <div style={{ fontSize: 12, color: T.gris, lineHeight: 1.5 }}>Sirve para dos cosas: <b>la primera carga</b> de una tarjeta (trae todas las compras vigentes con las cuotas que ya pagaste) y <b>el cargue mensual</b> (solo entran las compras nuevas; las demás se reconocen y no se duplican).</div>
        <div onClick={() => !busy && fileRef.current.click()} style={{ border: '2px dashed #D9D2EA', borderRadius: 14, padding: '28px 16px', textAlign: 'center', cursor: busy ? 'wait' : 'pointer', background: T.superficie }}>
          <div style={{ color: T.morado, marginBottom: 8 }}><Icon name={busy ? 'clock' : 'upload'} size={30} sw={1.5} /></div><div style={{ fontWeight: 700, fontSize: 14, color: T.moradoOscuro }}>{busy || 'Toca para elegir el PDF'}</div>
          <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={e => { const f = e.target.files[0]; if (f) leer(f); e.target.value = '' }} />
        </div>
        {err && <Aviso tipo="err">{err}</Aviso>}
        {pedirClave && <div style={{ background: T.superficie, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Este PDF tiene contraseña</div>
          <div style={{ fontSize: 12, color: T.gris, marginTop: 4, lineHeight: 1.5 }}>Es la que te pide el banco al abrirlo (en muchos bancos, tu número de cédula). Se usa solo aquí, en tu dispositivo, para abrir el archivo; no se envía ni se guarda.</div>
          <input type="password" inputMode="numeric" autoFocus value={clave} onChange={e => setClave(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && clave) { const f = pedirClave.file; setPedirClave(null); leer(f, clave) } }} placeholder="Contraseña del PDF" style={{ ...inp, background: '#fff', marginTop: 10 }} />
          {pedirClave.error && <div style={{ fontSize: 12, color: T.rojo, fontWeight: 700, marginTop: 6 }}>{pedirClave.error}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}><SmallBtn onClick={() => { setPedirClave(null); setClave('') }} bg="#fff" color={T.gris}>Cancelar</SmallBtn><SmallBtn onClick={() => { const f = pedirClave.file; setPedirClave(null); leer(f, clave) }} bg={T.morado} color="#fff">Abrir y leer</SmallBtn></div>
        </div>}
      </div>}
      {fase === 'revisar' && lectura && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: T.morado, color: '#fff', borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600 }}>{lectura.estado.banco || 'Extracto'} · corte {fmtDate(lectura.estado.fecha_corte)}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
            <div><div style={{ fontSize: 11, opacity: 0.8 }}>Pago total</div><div style={{ fontWeight: 800, fontSize: 18 }}>{fmtCOP(lectura.estado.pago_total)}</div></div>
            <div><div style={{ fontSize: 11, opacity: 0.8 }}>Pago mínimo</div><div style={{ fontWeight: 800, fontSize: 18 }}>{fmtCOP(lectura.estado.pago_minimo)}</div></div>
            <div><div style={{ fontSize: 11, opacity: 0.8 }}>Paga antes del</div><div style={{ fontWeight: 700, fontSize: 14 }}>{fmtDate(lectura.estado.fecha_limite)}</div></div>
            <div><div style={{ fontSize: 11, opacity: 0.8 }}>Utilizado / cupo</div><div style={{ fontWeight: 700, fontSize: 14 }}>{fmtCOP(lectura.estado.utilizado)} / {fmtCOP(lectura.estado.cupo)}</div></div>
          </div>
        </div>
        {dif != null && Math.abs(dif) > 1000 && <Aviso tipo="warn">La app calcula un saldo de <b>{fmtCOP(saldoApp)}</b> y el banco dice <b>{fmtCOP(lectura.estado.utilizado)}</b> (diferencia {fmtCOP(dif)}). Con las compras y ajustes de abajo debería acercarse; lo que quede son intereses, cuota de manejo o seguros que no son compras.</Aviso>}
        {lectura.advertencias?.map((a, i) => <Aviso key={i} tipo="warn">{a}</Aviso>)}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}><Kpi value={nuevas.length} label="Compras nuevas" color={T.verde} /><Kpi value={ajustes.length} label="Ajustes de cuotas" color={T.ambar} /><Kpi value={filas.filter(f => f.estado === 'existente').length} label="Ya registradas" color={T.gris} /></div>
        <div style={{ border: `1px solid ${T.divisor}`, borderRadius: 12, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' }}>
          {filas.length === 0 && <div style={{ padding: 14, fontSize: 12, color: T.gris }}>No se encontraron compras en el extracto.</div>}
          {filas.map((f, i) => <div key={i} data-item={f.descripcion} style={{ padding: '8px 10px', borderBottom: `1px solid ${T.superficie}`, display: 'flex', gap: 10, alignItems: 'flex-start', background: f.estado === 'existente' ? T.superficie : '#fff', opacity: f.estado === 'existente' ? 0.7 : 1 }}>
            {f.estado !== 'existente' ? <input type="checkbox" checked={!!f.incluir} onChange={() => toggle(i)} style={{ marginTop: 3 }} /> : <Icon name="check" size={14} style={{ color: T.gris, marginTop: 3 }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.descripcion}</div>
              <div style={{ fontSize: 10, color: T.gris }}>{fmtDate(f.fecha)} · cuota {f.cuota_actual} de {f.cuotas}{f.tasa_mensual != null ? ` · ${f.tasa_mensual}% m.v.` : ''}{f.moneda_original && f.moneda_original !== 'COP' ? ` · ${f.monto_original} ${f.moneda_original}` : ''}</div>
              {f.estado === 'nueva' && <div style={{ fontSize: 10, color: T.verde, fontWeight: 700 }}>Nueva{f.cuotas_previas ? ` · ${f.cuotas_previas} cuota${f.cuotas_previas > 1 ? 's' : ''} ya pagada${f.cuotas_previas > 1 ? 's' : ''} antes de la app` : ''}</div>}
              {f.estado === 'ajuste' && <div style={{ fontSize: 10, color: T.ambar, fontWeight: 700 }}>Ya existe: la app tiene {f.pagadasApp} cuota{f.pagadasApp === 1 ? '' : 's'} pagada{f.pagadasApp === 1 ? '' : 's'} y el banco {f.deberian}{(+f.cargo.cuotas || 1) !== f.cuotas ? ` · plazo ${f.cargo.cuotas} → ${f.cuotas}` : ''}. Marca para ajustar.</div>}
              {f.estado === 'existente' && <div style={{ fontSize: 10, color: T.gris }}>Ya registrada y al día</div>}
              {f.nota && <div style={{ fontSize: 10, color: T.ambar }}>· {f.nota}</div>}
            </div>
            <div style={{ fontWeight: 800, fontSize: 12, whiteSpace: 'nowrap' }}>{fmtCOP(f.monto)}</div>
          </div>)}
        </div>
        {lectura.otros?.length > 0 && <div style={{ fontSize: 11, color: T.gris }}>Otros cargos del extracto (no se crean como compras; entran como extras al pagar la factura): {lectura.otros.map(o => `${o.descripcion} ${fmtCOP(o.monto)}`).join(' · ')}</div>}
        {lectura.estado.cupo && +lectura.estado.cupo !== +(tc.cupo || 0) && <label style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={actualizarCupo} onChange={e => setActualizarCupo(e.target.checked)} />Actualizar el cupo de la tarjeta a {fmtCOP(lectura.estado.cupo)} (hoy {fmtCOP(tc.cupo || 0)})</label>}
        {err && <Aviso tipo="err">{err}</Aviso>}
        <div style={{ display: 'flex', gap: 10 }}><CancelBtn onClick={() => { setFase('archivo'); setLectura(null) }} /><SaveBtn onClick={confirmar} disabled={!!busy}>{busy || `Aplicar (${nuevas.length} nueva${nuevas.length === 1 ? '' : 's'}, ${ajustes.length} ajuste${ajustes.length === 1 ? '' : 's'})`}</SaveBtn></div>
      </div>}
    </Modal>
  )
}

// Resumen del último extracto en la tarjeta
export function EstadoExtracto({ tc }) {
  const { db } = useData()
  const e = db.tc_extractos.filter(x => x.cuenta_id === tc.id).sort((a, b) => b.fecha_corte.localeCompare(a.fecha_corte))[0]
  if (!e) return null
  const vencido = e.fecha_limite && e.fecha_limite < today()
  return (
    <div style={{ margin: '0 14px 10px', background: '#fff', borderRadius: 12, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <div style={{ minWidth: 0 }}><div style={{ fontSize: 11, color: T.gris, fontWeight: 600 }}>Extracto del {fmtDate(e.fecha_corte)}{e.banco ? ` · ${e.banco}` : ''}</div><div style={{ fontSize: 13, fontWeight: 700, color: T.tinta }}>Pago total {fmtCOP(e.pago_total)} · mínimo {fmtCOP(e.pago_minimo)}</div><div style={{ fontSize: 11, color: vencido ? T.rojo : T.gris, fontWeight: vencido ? 700 : 500 }}>{vencido ? 'Venció el ' : 'Paga antes del '}{fmtDate(e.fecha_limite)}</div></div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}><div style={{ fontSize: 10, color: T.gris }}>utilizado</div><div style={{ fontSize: 13, fontWeight: 800, color: T.tinta }}>{fmtCOP(e.utilizado)}</div></div>
    </div>
  )
}
