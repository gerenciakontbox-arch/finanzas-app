// Tratamiento de datos: autorizaciones al primer ingreso, Ajustes → Privacidad (derechos del titular),
// "Mi perfil" (lo que la app concluye del usuario) y ofertas de Kontbox.
import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { useData } from '../lib/data'
import { Icon, Modal, Card, Aviso, SaveBtn, CancelBtn, SmallBtn, inp, T } from '../lib/ui'
import { fmtCOP, fmtDate } from '../lib/util'
import { POLITICA, POLITICA_VERSION, FINALIDADES, RESPONSABLE } from '../legal/politica'
import { toCSV, descargar } from '../lib/csv'

const Interruptor = ({ on, onChange, disabled }) => (
  <button role="switch" aria-checked={on} disabled={disabled} onClick={() => onChange(!on)} style={{ width: 48, height: 28, borderRadius: 14, border: 'none', background: on ? T.morado : '#D9D2EA', position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer', flexShrink: 0, opacity: disabled ? 0.6 : 1 }}>
    <span style={{ position: 'absolute', top: 3, left: on ? 23 : 3, width: 22, height: 22, borderRadius: 11, background: '#fff', transition: 'left .15s' }} />
  </button>
)

function FilaFinalidad({ f, on, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderBottom: `1px solid ${T.divisor}` }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: T.tinta }}>{f.titulo}{f.obligatoria && <span style={{ fontSize: 11, color: T.gris, fontWeight: 600 }}> · necesaria</span>}</div>
        <div style={{ fontSize: 12, color: T.gris, marginTop: 3, lineHeight: 1.5 }}>{f.texto}</div>
      </div>
      <Interruptor on={on} onChange={onChange} disabled={f.obligatoria} />
    </div>
  )
}

export function PoliticaModal({ onClose }) {
  return <Modal title="Política de tratamiento de datos" onClose={onClose}><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 12.5, lineHeight: 1.6, color: T.tinta, margin: 0 }}>{POLITICA}</pre></Modal>
}

// Primer ingreso (o nueva versión de la política): no se puede usar la app sin aceptar la finalidad de servicio.
export function Autorizaciones() {
  const { consent, registrarConsentimientos, salir } = useAuth()
  const primera = !consent.version
  const [v, setV] = useState({ servicio: true, analitica: primera ? true : consent.analitica, perfil: primera ? true : consent.perfil, comercial: primera ? false : consent.comercial })
  const [ver, setVer] = useState(false); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const nuevaVersion = consent.servicio && consent.version && consent.version !== POLITICA_VERSION
  const go = async () => { setBusy(true); setErr(''); try { await registrarConsentimientos(v, POLITICA_VERSION) } catch (e) { setErr(e.message); setBusy(false) } }
  return (
    <div style={{ minHeight: '100vh', background: T.morado, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ padding: '0 24px 24px', paddingTop: 'max(60px, calc(env(safe-area-inset-top) + 24px))', color: '#fff' }}>
        <div style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-0.8px' }}>{nuevaVersion ? 'Actualizamos la política' : 'Tus datos, tus reglas'}</div>
        <div style={{ fontSize: 14, opacity: 0.85, marginTop: 8, lineHeight: 1.5 }}>Akontapp guarda información financiera tuya. Antes de empezar, decide para qué puede usarse. Puedes cambiarlo cuando quieras en Ajustes → Privacidad.</div>
      </div>
      <div style={{ background: '#fff', borderRadius: '28px 28px 0 0', padding: '12px 24px 0', paddingBottom: 'calc(20px + env(safe-area-inset-bottom))', maxHeight: '74vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
          {FINALIDADES.map(f => <FilaFinalidad key={f.k} f={f} on={!!v[f.k]} onChange={x => setV(s => ({ ...s, [f.k]: x }))} />)}
          <div style={{ fontSize: 12, color: T.gris, marginTop: 12, lineHeight: 1.5 }}>Responsable: {RESPONSABLE.nombre}. <button onClick={() => setVer(true)} style={{ background: 'none', border: 'none', color: T.morado, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 12 }}>Leer la política completa</button></div>
          {err && <div style={{ marginTop: 10 }}><Aviso tipo="err">{err}</Aviso></div>}
        </div>
        <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: `1px solid ${T.divisor}` }}>
          <button onClick={salir} style={{ flex: 1, height: 46, border: `1.5px solid ${T.divisor}`, borderRadius: 23, background: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', color: T.tinta }}>No acepto, salir</button>
          <SaveBtn onClick={go} disabled={busy}>{busy ? 'Guardando…' : 'Aceptar y continuar'}</SaveBtn>
        </div>
      </div>
      {ver && <PoliticaModal onClose={() => setVer(false)} />}
    </div>
  )
}

// Ajustes → Privacidad: derechos del titular desde la app.
export function Privacidad({ goTo }) {
  const { consent, registrarConsentimientos, eliminarMiCuenta, user, esOperador } = useAuth()
  const { all } = useData()
  const [ver, setVer] = useState(false); const [borrar, setBorrar] = useState(false); const [conf, setConf] = useState(''); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null)
  const cambiar = async (k, x) => { setBusy(true); setMsg(null); try { await registrarConsentimientos({ [k]: x }, POLITICA_VERSION); setMsg(['ok', x ? 'Autorización registrada.' : 'Autorización retirada; los datos derivados se borraron.']) } catch (e) { setMsg(['err', e.message]) } finally { setBusy(false) } }
  const descargarDatos = () => {
    const paquete = { exportado_en: new Date().toISOString(), correo: user?.email, autorizaciones: consent, datos: all }
    descargar('akontapp-mis-datos.json', JSON.stringify(paquete, null, 2))
    const movs = (all?.movimientos || []).map(m => [m.fecha, m.tipo, m.subtipo || '', m.descripcion, m.monto, m.espacio_id])
    descargar('akontapp-movimientos.csv', toCSV([['fecha', 'tipo', 'subtipo', 'descripcion', 'monto', 'espacio_id'], ...movs]))
  }
  const eliminar = async () => { if (conf !== 'ELIMINAR') return; setBusy(true); try { await eliminarMiCuenta() } catch (e) { setMsg(['err', e.message]); setBusy(false); setBorrar(false) } }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Card>
        <div style={{ fontWeight: 800, fontSize: 15, color: T.tinta }}>Para qué puede usarse tu información</div>
        <div style={{ fontSize: 12, color: T.gris, marginTop: 4 }}>Política versión {consent.version || POLITICA_VERSION} · <button onClick={() => setVer(true)} style={{ background: 'none', border: 'none', color: T.morado, fontWeight: 700, cursor: 'pointer', padding: 0, fontFamily: 'inherit', fontSize: 12 }}>leer completa</button></div>
        <div style={{ marginTop: 6 }}>{FINALIDADES.map(f => <FilaFinalidad key={f.k} f={f} on={f.obligatoria ? true : !!consent[f.k]} onChange={x => cambiar(f.k, x)} />)}</div>
        {msg && <div style={{ marginTop: 10 }}><Aviso tipo={msg[0]}>{msg[1]}</Aviso></div>}
      </Card>
      <Card>
        <div style={{ fontWeight: 800, fontSize: 15, color: T.tinta }}>Tus derechos</div>
        <div style={{ fontSize: 12, color: T.gris, marginTop: 4, lineHeight: 1.5 }}>Conocer, corregir, descargar y suprimir tus datos. Lo que no puedas resolver aquí: {RESPONSABLE.correo} (consultas 10 días hábiles, reclamos 15).</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <button onClick={() => goTo('perfil')} style={btn()}><Icon name="user" size={15} />Ver lo que la app concluye de mí (Mi perfil)</button>
          <button onClick={descargarDatos} style={btn()}><Icon name="download" size={15} />Descargar mis datos (JSON + CSV)</button>
          <button onClick={() => setBorrar(true)} style={btn(T.rojo)}><Icon name="trash" size={15} />Eliminar mi cuenta y mis datos</button>
        </div>
      </Card>
      {esOperador && <Card><div style={{ fontWeight: 800, fontSize: 15, color: T.tinta }}>Operador</div><div style={{ fontSize: 12, color: T.gris, marginTop: 4 }}>Tu usuario tiene rol de operador de la app.</div><div style={{ marginTop: 10 }}><button onClick={() => goTo('operador')} style={btn()}><Icon name="chart" size={15} />Abrir el panel del operador</button></div></Card>}
      {ver && <PoliticaModal onClose={() => setVer(false)} />}
      {borrar && <Modal title="Eliminar mi cuenta" onClose={() => setBorrar(false)}>
        <Aviso tipo="err">Se borran tu espacio personal con todo su contenido, tus membresías y tu usuario. Los espacios compartidos donde haya otros miembros se conservan para ellos. Esto no se puede deshacer.</Aviso>
        <div style={{ marginTop: 14, fontSize: 13, color: T.tinta }}>Escribe <b>ELIMINAR</b> para confirmar.</div>
        <input value={conf} onChange={e => setConf(e.target.value.toUpperCase())} style={{ ...inp, marginTop: 8 }} placeholder="ELIMINAR" />
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setBorrar(false)} /><SaveBtn onClick={eliminar} disabled={conf !== 'ELIMINAR' || busy}>{busy ? 'Eliminando…' : 'Eliminar definitivamente'}</SaveBtn></div>
      </Modal>}
    </div>
  )
}
const btn = (color = T.tinta) => ({ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '12px 14px', borderRadius: 12, border: 'none', background: '#fff', color, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' })

// Mi perfil: lo mismo que ve el operador (seudonimizado), sin asimetría.
const IND = [
  ['salud', 'Salud financiera', v => `${v} / 100`],
  ['puntualidad_pct', 'Pagos a tiempo (6 meses)', v => `${v} %`],
  ['atraso_promedio_dias', 'Atraso promedio', v => `${v} días`],
  ['presupuesto_ejecucion_pct', 'Ejecución del presupuesto (3 meses)', v => `${v} %`],
  ['meses_desbordados', 'Meses con presupuesto desbordado', v => v],
  ['ingresos_mes', 'Ingresos promedio mensual', v => fmtCOP(v)],
  ['carga_deuda_pct', 'Cuotas sobre ingresos', v => `${v} %`],
  ['creditos_activos', 'Créditos activos', v => v],
  ['tc_uso_pct', 'Uso del cupo de tarjetas', v => `${v} %`],
  ['patrimonio_neto', 'Patrimonio neto', v => fmtCOP(v)],
  ['registro_mismo_dia_pct', 'Gastos anotados el mismo día', v => `${v} %`],
  ['dias_activos_30', 'Días con actividad (30 días)', v => v],
  ['aportes_mes', 'Aportes a espacios compartidos (mes)', v => fmtCOP(v)],
]
export function MiPerfil({ goTo }) {
  const { consent, userId } = useAuth(); const { db, actualizar, recargar } = useData()
  const p = db.perfil_usuario.find(x => x.user_id === userId); const ind = p?.indicadores || {}
  const defs = Object.fromEntries(db.senales_def.map(s => [s.codigo, s]))
  const ofertas = db.ofertas.filter(o => o.user_id === userId)
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null)
  const responder = async (o, estado) => { setBusy(true); try { await actualizar('ofertas', o.id, { estado, actualizado_en: new Date().toISOString() }); setMsg(['ok', estado === 'aceptada' ? 'Listo. Kontbox te escribirá al correo con el que entras a la app.' : 'Entendido; no volverás a ver esta oferta.']) } catch (e) { setMsg(['err', e.message]) } finally { setBusy(false) } }
  const calcular = async () => {
    setBusy(true); setMsg(null)
    try { const { supabase } = await import('../lib/supabase'); const { data: { session } } = await supabase.auth.getSession(); const r = await fetch('/.netlify/functions/perfil-ahora', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token } }); const t = await r.text(); if (!r.ok) throw new Error(t); await recargar(); setMsg(['ok', 'Perfil actualizado.']) }
    catch (e) { setMsg(['err', e.message]) } finally { setBusy(false) }
  }
  if (!consent.perfil) return <Card><div style={{ fontWeight: 800, fontSize: 15 }}>Mi perfil</div><div style={{ fontSize: 13, color: T.gris, marginTop: 6, lineHeight: 1.5 }}>No autorizaste que la app construya tu perfil financiero. Puedes activarlo en Ajustes → Privacidad.</div><div style={{ marginTop: 12 }}><SmallBtn onClick={() => goTo('config')} bg={T.morado} color="#fff">Ir a Privacidad</SmallBtn></div></Card>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontSize: 12, color: T.gris, lineHeight: 1.5 }}>Esto es todo lo que la app concluye de ti con tus propios datos. Se recalcula cada noche. {p ? `Última vez: ${fmtDate(p.calculado_en?.slice(0, 10))}.` : 'Aún no se ha calculado.'} El operador de la app ve estas mismas cifras bajo el código <b>{p?.codigo || '—'}</b>, sin tu nombre.</div>
      {!p && <Card><div style={{ fontSize: 13, color: T.gris }}>Tu perfil se calcula esta noche. Si quieres verlo ya:</div><div style={{ marginTop: 10 }}><SmallBtn onClick={calcular} bg={T.morado} color="#fff">Calcular ahora</SmallBtn></div></Card>}
      {p && <>
        <div style={{ background: T.morado, color: '#fff', borderRadius: 16, padding: '18px 20px' }}>
          <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 600 }}>Salud financiera</div>
          <div style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-2px', lineHeight: 1.05 }}>{ind.salud ?? '—'}<span style={{ fontSize: 18, opacity: 0.7 }}> / 100</span></div>
          <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6, lineHeight: 1.5 }}>{ind.salud_explicacion || 'Puntualidad, presupuesto, carga de deuda, hábito de registro y patrimonio.'}</div>
        </div>
        <Card>
          {IND.filter(([k]) => k !== 'salud' && ind[k] != null).map(([k, l, f]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 0', borderBottom: `1px solid ${T.divisor}`, fontSize: 13 }}><span style={{ color: T.gris }}>{l}</span><b style={{ color: T.tinta, fontVariantNumeric: 'tabular-nums' }}>{f(ind[k])}</b></div>)}
          <div style={{ marginTop: 10 }}><SmallBtn onClick={calcular} bg={T.superficie} color={T.morado}>Recalcular ahora</SmallBtn></div>
        </Card>
        <Card>
          <div style={{ fontWeight: 800, fontSize: 14, color: T.tinta }}>Situaciones detectadas</div>
          {!p.senales?.length && <div style={{ fontSize: 13, color: T.gris, marginTop: 6 }}>Ninguna por ahora.</div>}
          {(p.senales || []).map(s => <div key={s} style={{ padding: '8px 0', borderBottom: `1px solid ${T.divisor}` }}><div style={{ fontWeight: 700, fontSize: 13 }}>{defs[s]?.nombre || s}</div><div style={{ fontSize: 12, color: T.gris, marginTop: 2 }}>{defs[s]?.descripcion}</div></div>)}
          <div style={{ fontSize: 11, color: T.grisClaro, marginTop: 8 }}>{consent.comercial ? 'Autorizaste recibir ofertas de Kontbox por estas situaciones.' : 'No autorizaste ofertas comerciales: estas situaciones solo las ves tú.'}</div>
        </Card>
      </>}
      {ofertas.length > 0 && <Card>
        <div style={{ fontWeight: 800, fontSize: 14, color: T.tinta }}>Ofertas de Kontbox</div>
        {ofertas.map(o => { const d = defs[o.senal]; return <div key={o.id} style={{ padding: '10px 0', borderBottom: `1px solid ${T.divisor}` }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{d?.servicio || o.senal}</div><div style={{ fontSize: 12, color: T.gris, marginTop: 2 }}>{d?.descripcion}</div>
          {o.estado === 'mostrada' || o.estado === 'tocada' ? <div style={{ display: 'flex', gap: 8, marginTop: 8 }}><SmallBtn onClick={() => responder(o, 'aceptada')} bg={T.morado} color="#fff">Me interesa, que me contacten</SmallBtn><SmallBtn onClick={() => responder(o, 'rechazada')} bg="#fff" color={T.gris}>No, gracias</SmallBtn></div>
            : <div style={{ fontSize: 12, color: o.estado === 'rechazada' ? T.gris : T.verde, fontWeight: 700, marginTop: 6 }}>{o.estado === 'rechazada' ? 'Rechazada' : o.estado === 'convertida' ? 'Contratada' : 'Aceptada · Kontbox te contactará'}</div>}
        </div> })}
        {msg && <div style={{ marginTop: 10 }}><Aviso tipo={msg[0]}>{msg[1]}</Aviso></div>}
      </Card>}
    </div>
  )
}

// Tarjeta de oferta en Inicio (solo con finalidad comercial y oferta pendiente)
export function OfertaInicio({ goTo }) {
  const { consent, userId } = useAuth(); const { db, actualizar } = useData()
  const o = consent.comercial ? db.ofertas.find(x => x.user_id === userId && x.estado === 'mostrada') : null
  if (!o) return null
  const d = db.senales_def.find(s => s.codigo === o.senal)
  return (
    <div onClick={async () => { try { await actualizar('ofertas', o.id, { estado: 'tocada', actualizado_en: new Date().toISOString() }) } catch {} goTo('perfil') }} style={{ margin: '24px 20px 0', background: T.superficie, borderRadius: 16, padding: '14px 16px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', gap: 12, alignItems: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: T.tinta, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="landmark" size={22} sw={2} /></div>
      <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700 }}>Kontbox puede ayudarte</div><div style={{ fontSize: 12, color: T.gris, marginTop: 2 }}>{d?.servicio || o.senal}</div></div>
      <Icon name="chevron-right" size={18} sw={2.2} style={{ color: T.gris }} />
    </div>
  )
}

// Panel del operador: agregados anónimos, perfiles seudonimizados, identificación con motivo y resultado de ofertas.
export function Operador() {
  const { rpc } = useData()
  const [res, setRes] = useState(null); const [perfiles, setPerfiles] = useState(null); const [err, setErr] = useState(''); const [ident, setIdent] = useState(null); const [motivo, setMotivo] = useState(''); const [quien, setQuien] = useState(null)
  const cargar = async () => { setErr(''); try { setRes(await rpc('operador_resumen')); setPerfiles(await rpc('operador_perfiles')) } catch (e) { setErr(e.message) } }
  const identificar = async () => { try { setQuien(await rpc('operador_identificar', { p_codigo: ident, p_motivo: motivo })) } catch (e) { setErr(e.message) } }
  const resultado = async (codigo, senal, r) => { try { await rpc('operador_resultado', { p_codigo: codigo, p_senal: senal, p_resultado: r }); await cargar() } catch (e) { setErr(e.message) } }
  const kv = o => Object.entries(o || {}).map(([k, v]) => `${k}: ${v}`).join(' · ') || '—'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Aviso tipo="info">Todo acceso desde aquí queda registrado. Los perfiles se muestran con código; la identidad solo se revela para usuarios que autorizaron la finalidad comercial y respondieron a una oferta, y exige motivo.</Aviso>
      {!res && <SmallBtn onClick={cargar} bg={T.morado} color="#fff">Cargar panel</SmallBtn>}
      {err && <Aviso tipo="err">{err}</Aviso>}
      {res && <Card>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Resumen (anónimo)</div>
        {[['Usuarios', res.usuarios], ['Activos 7 / 30 días', `${res.activos_7d} / ${res.activos_30d}`], ['Autorizaciones vigentes', kv(res.consentimientos)], ['Espacios', kv(res.espacios)], ['Perfiles calculados', res.perfiles], ['Señales', kv(res.senales)], ['Ofertas', kv(res.ofertas)], ['Pantallas 30 días', kv(res.pantallas_30d)]].map(([l, v]) => <div key={l} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, padding: '7px 0', borderBottom: `1px solid ${T.divisor}` }}><span style={{ color: T.gris }}>{l}</span><b style={{ textAlign: 'right' }}>{String(v)}</b></div>)}
        <div style={{ marginTop: 8 }}><SmallBtn onClick={cargar} bg={T.superficie} color={T.morado}>Actualizar</SmallBtn></div>
      </Card>}
      {perfiles && <Card>
        <div style={{ fontWeight: 800, fontSize: 14 }}>Perfiles con finalidad comercial ({perfiles.length})</div>
        {perfiles.length === 0 && <div style={{ fontSize: 12, color: T.gris, marginTop: 6 }}>Ningún usuario ha autorizado ofertas comerciales.</div>}
        {perfiles.map(p => <div key={p.codigo} style={{ padding: '10px 0', borderBottom: `1px solid ${T.divisor}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 13 }}>{p.codigo}</b><span style={{ fontSize: 11, color: T.gris }}>salud {p.indicadores?.salud ?? '—'} · {fmtDate(p.calculado_en?.slice(0, 10))}</span></div>
          <div style={{ fontSize: 12, color: T.gris, marginTop: 4 }}>Señales: {p.senales?.join(', ') || '—'}</div>
          {(p.ofertas || []).map(o => <div key={o.senal} style={{ fontSize: 12, marginTop: 4, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}><span>{o.senal}: <b>{o.estado}</b>{o.resultado ? ` · ${o.resultado}` : ''}</span>{['tocada', 'aceptada'].includes(o.estado) && <><SmallBtn onClick={() => resultado(p.codigo, o.senal, 'venta')} bg={T.verdeFondo} color={T.verde}>Venta</SmallBtn><SmallBtn onClick={() => resultado(p.codigo, o.senal, 'sin_venta')} bg="#fff" color={T.gris}>Sin venta</SmallBtn></>}</div>)}
          {(p.ofertas || []).some(o => ['tocada', 'aceptada', 'convertida'].includes(o.estado)) && <div style={{ marginTop: 6 }}><SmallBtn onClick={() => { setIdent(p.codigo); setQuien(null); setMotivo('') }} bg={T.morado} color="#fff">Identificar para contactar</SmallBtn></div>}
        </div>)}
      </Card>}
      {ident && <Modal title={`Identificar ${ident}`} onClose={() => setIdent(null)}>
        <Aviso tipo="warn">Queda registrado quién, cuándo y por qué. Úsalo solo para el contacto que el usuario aceptó.</Aviso>
        <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (ej. seguimiento a oferta aceptada)" style={{ ...inp, marginTop: 12 }} />
        {quien && <div style={{ marginTop: 12 }}><Aviso tipo="ok">{quien.nombre || '—'} · {quien.email}</Aviso></div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}><CancelBtn onClick={() => setIdent(null)} /><SaveBtn onClick={identificar} disabled={!motivo.trim()}>Revelar identidad</SaveBtn></div>
      </Modal>}
    </div>
  )
}
