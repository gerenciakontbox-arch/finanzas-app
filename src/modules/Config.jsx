import { useState, useEffect } from 'react'
import { useData } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Card, Icon, IcoText, Modal, Field, inp, sel, PBtn, SaveBtn, CancelBtn, SmallBtn, Aviso, useForm, T } from '../lib/ui'
import { fmtCOP, fmtDate, today, addDays, TIPOS_CTA, TC, GRUPOS } from '../lib/util'
import { toCSV, descargar } from '../lib/csv'
import { TIPO_ICON, TIPO_LABEL } from '../App'
import { Privacidad } from './Privacidad'
import Etiquetas from './Etiquetas'
import { soportado, configurado, permiso, esIOS, esStandalone, activar, desactivar, suscripcionActual, enviarPrueba } from '../lib/push'

export default function Config({ goTo }) {
  const [sec, setSec] = useState('espacios')
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <PBtn active={sec === 'espacios'} onClick={() => setSec('espacios')}><IcoText name="home" size={13}>Espacios</IcoText></PBtn>
        <PBtn active={sec === 'cuentas'} onClick={() => setSec('cuentas')}><IcoText name="landmark" size={13}>Cuentas</IcoText></PBtn>
        <PBtn active={sec === 'categorias'} onClick={() => setSec('categorias')}><IcoText name="tag" size={13}>Categorías</IcoText></PBtn>
        <PBtn active={sec === 'etiquetas'} onClick={() => setSec('etiquetas')}><IcoText name="tag" size={13}>Etiquetas</IcoText></PBtn>
        <PBtn active={sec === 'avisos'} onClick={() => setSec('avisos')}><IcoText name="alert" size={13}>Avisos</IcoText></PBtn>
        <PBtn active={sec === 'datos'} onClick={() => setSec('datos')}><IcoText name="file" size={13}>Datos</IcoText></PBtn>
        <PBtn active={sec === 'privacidad'} onClick={() => setSec('privacidad')}><IcoText name="shield" size={13}>Privacidad</IcoText></PBtn>
      </div>
      {sec === 'espacios' && <Espacios />}{sec === 'cuentas' && <Cuentas />}{sec === 'categorias' && <Categorias />}{sec === 'etiquetas' && <Etiquetas />}{sec === 'avisos' && <Avisos />}{sec === 'datos' && <Datos />}{sec === 'privacidad' && <Privacidad goTo={goTo} />}
    </div>
  )
}

/* ── Espacios: el activo, invitar, miembros, crear / unirse ── */
function Espacios() {
  const { espacio, espacios, miembros, miembroActual, esAdmin, esPersonal, user, userId, salir, regenerarCodigo, renombrarEspacio, cambiarEspacio, crearEspacio, unirse, expulsar, cambiarRol, abandonar, cambiarMiNombre } = useAuth()
  const [nombre, setNombre] = useState(espacio.nombre); const [msg, setMsg] = useState(''); const [modal, setModal] = useState(null)
  const [f, sf, setF] = useForm({ tipo: 'hogar', nombre: '', nombreMiembro: miembroActual?.nombre || '', codigo: '' }); const [busy, setBusy] = useState(false)
  const [miNombre, setMiNombre] = useState(miembroActual?.nombre || '')
  const copiar = async () => { try { await navigator.clipboard.writeText(espacio.codigo_invitacion); setMsg('Código copiado.') } catch { setMsg(espacio.codigo_invitacion) } }
  const compartir = async () => { const txt = `Únete a "${espacio.nombre}" en Akontapp. Entra a ${window.location.origin}, inicia sesión con tu correo y en Config → Espacios usa el código ${espacio.codigo_invitacion}`; if (navigator.share) { try { await navigator.share({ text: txt }) } catch { } } else copiar() }
  const go = async () => {
    setBusy(true); setMsg('')
    try {
      if (modal === 'crear') { if (!f.nombre.trim() || !f.nombreMiembro.trim()) return; await crearEspacio(f.tipo, f.nombre.trim(), f.nombreMiembro.trim()) }
      else { if (!f.codigo.trim() || !f.nombreMiembro.trim()) return; await unirse(f.codigo.trim(), f.nombreMiembro.trim()) }
      setModal(null)
    } catch (e) { setMsg('Error: ' + (e.message || e)) } finally { setBusy(false) }
  }
  const orden = { personal: 0, hogar: 1, empresa: 2 }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1B1B1F', marginBottom: 10 }}>Mis espacios</div>
        {[...espacios].sort((a, b) => orden[a.tipo] - orden[b.tipo] || a.nombre.localeCompare(b.nombre)).map(e => <div key={e.id} onClick={() => e.id !== espacio.id && cambiarEspacio(e.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 12, background: e.id === espacio.id ? '#F3F1F8' : '#fff', border: `1px solid ${e.id === espacio.id ? '#D9D2EA' : '#EBE9F1'}`, marginBottom: 6, cursor: 'pointer' }}>
          <div style={{ width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: e.tipo === 'personal' ? '#4B1D9E' : e.tipo === 'hogar' ? '#138A5B' : '#0F6E8C' }}><Icon name={TIPO_ICON[e.tipo]} size={16} /></div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#1B1B1F' }}>{e.tipo === 'personal' ? 'Personal' : e.nombre}</div><div style={{ fontSize: 10, color: '#6E6E73' }}>{TIPO_LABEL[e.tipo]}{e.id === espacio.id ? ' · activo' : ''}</div></div>
          {e.id === espacio.id && <Icon name="check" size={16} style={{ color: '#4B1D9E' }} />}
        </div>)}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => { setF({ tipo: 'hogar', nombre: '', nombreMiembro: miembroActual?.nombre || '', codigo: '' }); setModal('crear') }} style={{ flex: 1, height: 40, background: '#4B1D9E', color: '#fff', border: 'none', borderRadius: 20, fontWeight: 800, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}><IcoText name="plus" size={13}>Crear hogar o empresa</IcoText></button>
          <button onClick={() => { setF({ tipo: 'hogar', nombre: '', nombreMiembro: miembroActual?.nombre || '', codigo: '' }); setModal('unirse') }} style={{ flex: 1, padding: 10, background: '#fff', color: '#4B1D9E', border: '1.5px solid #EBE9F1', borderRadius: 20, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Tengo un código</button>
        </div>
      </Card>

      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1B1B1F', marginBottom: 10 }}>{esPersonal ? 'Mi espacio personal' : espacio.tipo === 'hogar' ? 'Este hogar' : 'Esta empresa'}</div>
        {!esPersonal && <div style={{ display: 'flex', gap: 8 }}><input value={nombre} onChange={e => setNombre(e.target.value)} disabled={!esAdmin} style={{ ...inp, flex: 1 }} />{esAdmin && <SmallBtn onClick={async () => { if (nombre.trim()) { await renombrarEspacio(nombre.trim()); setMsg('Nombre actualizado.') } }} bg="#F3F1F8" color="#4B1D9E">Guardar</SmallBtn>}</div>}
        <div style={{ marginTop: esPersonal ? 0 : 10 }}><Field label="Mi nombre"><div style={{ display: 'flex', gap: 8 }}><input value={miNombre} onChange={e => setMiNombre(e.target.value)} style={{ ...inp, flex: 1 }} /><SmallBtn onClick={async () => { if (miNombre.trim()) { await cambiarMiNombre(miNombre.trim()); setMsg('Nombre actualizado.') } }} bg="#F3F1F8" color="#4B1D9E">Guardar</SmallBtn></div></Field></div>
        <div style={{ fontSize: 11, color: '#9A9AA0', marginTop: 8 }}>Sesión: {user.email}{!esPersonal ? ` · ${miembroActual?.rol === 'admin' ? 'administrador' : 'miembro'}` : ''} · <button onClick={salir} style={{ background: 'none', border: 'none', color: '#B42318', cursor: 'pointer', fontSize: 11, padding: 0 }}>cerrar sesión</button></div>
        {esPersonal && <div style={{ marginTop: 10 }}><Aviso tipo="info">Lo que registras aquí solo lo ves tú. Para compartir gastos, activos o deudas con tu familia o tu empresa, muévelos a un espacio compartido (botón "Mover a…") o regístralos directamente allí.</Aviso></div>}
      </Card>

      {!esPersonal && <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1B1B1F', marginBottom: 6 }}>Invitar</div>
        <div style={{ fontSize: 11, color: '#6E6E73', marginBottom: 10 }}>Quien entre con este código verá y podrá registrar todo lo de este espacio. No verá tu espacio personal.</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F3F1F8', borderRadius: 12, padding: '12px 14px' }}><div style={{ flex: 1, fontFamily: 'monospace', fontSize: 22, fontWeight: 800, letterSpacing: '0.2em', color: '#36146F' }}>{espacio.codigo_invitacion}</div><SmallBtn onClick={copiar} bg="#fff" color="#4B1D9E">Copiar</SmallBtn><SmallBtn onClick={compartir} bg="#4B1D9E" color="#fff">Compartir</SmallBtn></div>
        {esAdmin && <button onClick={async () => { if (window.confirm('El código actual dejará de funcionar. ¿Generar uno nuevo?')) { await regenerarCodigo(); setMsg('Código regenerado.') } }} style={{ marginTop: 8, background: 'none', border: 'none', color: '#9A9AA0', fontSize: 11, cursor: 'pointer', padding: 0 }}>Regenerar código</button>}
      </Card>}

      {!esPersonal && <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1B1B1F', marginBottom: 10 }}>Miembros ({miembros.length})</div>
        {miembros.map(m => <div key={m.user_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #F3F1F8', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}><div style={{ width: 32, height: 32, borderRadius: '50%', background: '#4B1D9E', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{m.nombre.slice(0, 2).toUpperCase()}</div><div><div style={{ fontSize: 13, fontWeight: 600 }}>{m.nombre}{m.user_id === userId ? ' (tú)' : ''}</div><div style={{ fontSize: 10, color: '#6E6E73' }}>{m.rol === 'admin' ? 'administrador' : 'miembro'} · desde {fmtDate(m.unido_en?.slice(0, 10))}</div></div></div>
          {esAdmin && m.user_id !== userId && <div style={{ display: 'flex', gap: 4 }}><SmallBtn onClick={() => cambiarRol(m.user_id, m.rol === 'admin' ? 'miembro' : 'admin')} bg="#F3F1F8" color="#6E6E73">{m.rol === 'admin' ? 'Quitar admin' : 'Hacer admin'}</SmallBtn><SmallBtn onClick={async () => { if (window.confirm(`¿Quitar a ${m.nombre}? Lo que registró se conserva.`)) await expulsar(m.user_id) }} bg="#FBEAE7" color="#B42318">Quitar</SmallBtn></div>}
        </div>)}
        {!esAdmin && <button onClick={async () => { if (window.confirm(`¿Salir de "${espacio.nombre}"? Dejarás de ver sus datos.`)) await abandonar() }} style={{ marginTop: 10, background: 'none', border: 'none', color: '#B42318', fontSize: 11, cursor: 'pointer', padding: 0 }}>Salir de este espacio</button>}
      </Card>}
      {msg && <Aviso tipo={msg.startsWith('Error') ? 'err' : 'ok'}>{msg}</Aviso>}

      {modal && <Modal title={modal === 'crear' ? 'Nuevo espacio' : 'Unirme con un código'} onClose={() => setModal(null)}>
        {modal === 'crear' && <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}><PBtn active={f.tipo === 'hogar'} onClick={() => sf('tipo', 'hogar')}><IcoText name="home" size={13}>Hogar</IcoText></PBtn><PBtn active={f.tipo === 'empresa'} onClick={() => sf('tipo', 'empresa')}><IcoText name="landmark" size={13}>Empresa</IcoText></PBtn></div>
          <Field label={f.tipo === 'hogar' ? 'Nombre del hogar' : 'Nombre de la empresa'}><input value={f.nombre} onChange={e => sf('nombre', e.target.value)} placeholder={f.tipo === 'hogar' ? 'Ej. Casa Quijano' : 'Ej. Kontbox'} style={inp} /></Field>
          <div style={{ marginTop: 10 }}><Aviso tipo="info">{f.tipo === 'hogar' ? 'Un hogar no tiene caja propia: los gastos se pagan con las cuentas de sus miembros y quedan como aportes de cada uno.' : 'Una empresa puede tener cuentas propias. Lo que te pague a ti cae en tu espacio personal como ingreso.'}</Aviso></div>
        </>}
        {modal === 'unirse' && <Field label="Código de invitación"><input value={f.codigo} onChange={e => sf('codigo', e.target.value.toUpperCase())} placeholder="8 caracteres" maxLength={8} style={{ ...inp, letterSpacing: '0.2em', fontFamily: 'monospace', fontSize: 18, textAlign: 'center' }} /></Field>}
        <div style={{ marginTop: 10 }}><Field label="Tu nombre en este espacio"><input value={f.nombreMiembro} onChange={e => sf('nombreMiembro', e.target.value)} style={inp} /></Field></div>
        {msg.startsWith('Error') && <div style={{ marginTop: 10 }}><Aviso tipo="err">{msg}</Aviso></div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setModal(null)} /><SaveBtn onClick={go} disabled={busy}>{busy ? 'Un momento…' : modal === 'crear' ? 'Crear' : 'Unirme'}</SaveBtn></div>
      </Modal>}
    </div>
  )
}

function TCF({ v, set }) { return (<><Field label="Cupo (COP)"><input type="number" inputMode="numeric" value={v.cupo ?? ''} onChange={e => set('cupo', e.target.value)} style={inp} /></Field><Field label="Tasa mensual (%) · solo para estimar intereses"><input type="number" inputMode="decimal" step="0.01" value={v.tasa_mensual ?? ''} onChange={e => set('tasa_mensual', e.target.value)} style={inp} /></Field><Field label="Banco"><input value={v.banco || ''} onChange={e => set('banco', e.target.value)} style={inp} /></Field><Field label="Últimos 4"><input value={v.ultimos4 || ''} onChange={e => set('ultimos4', e.target.value)} maxLength={4} style={inp} /></Field><Field label="Día de corte"><input type="number" min={1} max={31} value={v.dia_corte ?? ''} onChange={e => set('dia_corte', e.target.value)} style={inp} /></Field></>) }

/* ── Cuentas: propias del espacio; las personales se habilitan en espacios compartidos ── */
function Cuentas() {
  const { db, insertar, actualizar, borrar, rpc, nombreCuenta, saldoCuenta, duenoCuenta } = useData()
  const { espacio, esPersonal, compartidos, userId, nombreDe } = useAuth()
  const empty = { nombre: '', tipo: 'Bancaria', cupo: '', tasa_mensual: '', banco: '', ultimos4: '', dia_corte: '', saldo_inicial: '', fecha_corte: addDays(today(), -1) }   // saldo al CIERRE de esa fecha: por defecto ayer, para que lo de hoy ya cuente
  const [form, sf, setForm] = useForm(empty); const [edit, setEdit] = useState(null)
  const build = f => ({ nombre: f.nombre.trim(), tipo: f.tipo, saldo_inicial: f.tipo === TC ? 0 : (parseFloat(String(f.saldo_inicial).replace(/[^\d.-]/g, '')) || 0), fecha_corte: f.tipo === TC ? null : (f.fecha_corte || null), cupo: f.tipo === TC ? parseFloat(f.cupo) || null : null, tasa_mensual: f.tipo === TC ? parseFloat(f.tasa_mensual) || 0 : null, banco: f.tipo === TC ? f.banco || null : null, ultimos4: f.tipo === TC && /^\d{4}$/.test(f.ultimos4) ? f.ultimos4 : null, dia_corte: f.tipo === TC ? parseInt(f.dia_corte) || null : null })
  const add = async () => { if (!form.nombre.trim()) return; try { await insertar('cuentas', build(form)); setForm(empty) } catch (e) { alert(e.message) } }
  const save = async () => { try { await actualizar('cuentas', edit.id, build(edit)); setEdit(null) } catch (e) { alert(e.message) } }
  const habilitada = (c, eid) => db.cuentas_espacio.some(x => x.cuenta_id === c.id && x.espacio_id === eid)
  const toggle = async (c, eid, on) => { try { await rpc('habilitar_cuenta', { p_cuenta: c.id, p_espacio: eid, p_on: on }) } catch (e) { alert(e.message) } }
  const ajenas = db.cuentas.filter(c => c.espacio_id !== espacio.id)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1B1B1F', marginBottom: 4 }}>{esPersonal ? 'Mis cuentas y tarjetas' : `Cuentas propias de ${espacio.nombre}`}</div>
        <div style={{ fontSize: 11, color: '#6E6E73', marginBottom: 10 }}>{esPersonal ? 'Son tuyas. Abajo puedes habilitarlas como medio de pago en tus espacios compartidos: los demás verán su nombre, nunca su saldo.' : espacio.tipo === 'hogar' ? 'Normalmente un hogar no tiene cuentas propias: los gastos se pagan con las cuentas personales habilitadas por cada miembro.' : 'Cuentas de la empresa. Lo que pagues desde ellas a un miembro cae en su espacio personal.'}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <Field label="Nombre" full><input value={form.nombre} onChange={e => sf('nombre', e.target.value)} placeholder="Ej. Bancolombia, Visa Bancolombia" style={inp} /></Field>
          <Field label="Tipo"><select value={form.tipo} onChange={e => sf('tipo', e.target.value)} style={sel}>{TIPOS_CTA.map(x => <option key={x}>{x}</option>)}</select></Field>
          {form.tipo === TC && <TCF v={form} set={sf} />}
          {form.tipo !== TC && <><Field label="Saldo al empezar (COP)"><input type="number" inputMode="numeric" value={form.saldo_inicial} onChange={e => sf('saldo_inicial', e.target.value)} placeholder="0" style={inp} /></Field><Field label="Fecha de corte"><input type="date" value={form.fecha_corte || ''} onChange={e => sf('fecha_corte', e.target.value)} style={inp} /></Field><div style={{ gridColumn: '1/-1', fontSize: 11, color: T.gris, marginTop: -4 }}>El saldo es el del <b>cierre</b> de esa fecha: lo que registres con fecha posterior suma o resta; lo anterior queda como historia.</div></>}
        </div>
        {form.tipo === TC && <div style={{ marginBottom: 10 }}><Aviso tipo="info">La tarjeta aparecerá en Deudas con su panel de compras y pago de factura.</Aviso></div>}
        {form.tipo !== TC && <div style={{ marginBottom: 10 }}><Aviso tipo="info">El saldo de la cuenta será el saldo al empezar más los movimientos posteriores a la fecha de corte. Lo anterior al corte (por ejemplo, un histórico importado) queda como historia y no altera el saldo.</Aviso></div>}
        <button onClick={add} style={{ width: '100%', background: '#4B1D9E', color: '#fff', border: 'none', borderRadius: 22, height: 44, fontWeight: 800, cursor: 'pointer', fontSize: 14, fontFamily: 'inherit' }}>Agregar cuenta</button>
        <div style={{ borderTop: '1px solid #EBE9F1', paddingTop: 14, marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {db.cuentasPropias.length === 0 && <div style={{ fontSize: 12, color: '#9A9AA0' }}>Sin cuentas propias.</div>}
          {db.cuentasPropias.map(c => <div key={c.id} style={{ padding: '10px 12px', borderRadius: 10, background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 13 }}>{c.nombre} {c.tipo === TC && <span style={{ background: '#F3F1F8', color: '#4B1D9E', fontSize: 10, padding: '1px 6px', borderRadius: 6, fontWeight: 700, border: '1px solid #D9D2EA' }}>TC</span>}</div><div style={{ fontSize: 10, color: '#6E6E73' }}>{c.tipo}{c.tipo === TC ? ` · cupo ${fmtCOP(c.cupo)} · ${c.tasa_mensual}% · corte ${c.dia_corte || '—'}` : ` · saldo ${fmtCOP(saldoCuenta(c))}`}</div></div>
              <div style={{ display: 'flex', gap: 6 }}><SmallBtn aria-label={'Editar ' + c.nombre} onClick={() => setEdit({ ...c, cupo: c.cupo ?? '', tasa_mensual: c.tasa_mensual ?? '', dia_corte: c.dia_corte ?? '', saldo_inicial: c.saldo_inicial ?? '', fecha_corte: c.fecha_corte || '' })} bg="#F3F1F8" color="#4B1D9E"><Icon name="pencil" size={13} /></SmallBtn><SmallBtn onClick={async () => { if (window.confirm('¿Eliminar cuenta?' + (c.tipo === TC ? ' Se borran también sus compras.' : ''))) { try { await borrar('cuentas', c.id) } catch (e) { alert(e.message) } } }} bg="#FBEAE7" color="#B42318"><Icon name="trash" size={13} /></SmallBtn></div>
            </div>
            {esPersonal && compartidos.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}><span style={{ fontSize: 10, color: '#9A9AA0' }}>Disponible en:</span>{compartidos.map(e => { const on = habilitada(c, e.id); return <button key={e.id} aria-label={`${c.nombre} en ${e.nombre}`} onClick={() => toggle(c, e.id, !on)} style={{ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 8, border: '1px solid', cursor: 'pointer', background: on ? '#E7F5EE' : '#fff', color: on ? '#138A5B' : '#6E6E73', borderColor: on ? '#6ee7b7' : '#EBE9F1' }}>{on ? '✓ ' : ''}{e.nombre}</button> })}</div>}
          </div>)}
        </div>
      </Card>
      {!esPersonal && <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1B1B1F', marginBottom: 4 }}>Medios de pago de los miembros</div>
        <div style={{ fontSize: 11, color: '#6E6E73', marginBottom: 10 }}>Cuentas personales que cada miembro habilitó para este espacio. Cada quien habilita las suyas desde su espacio personal.</div>
        {ajenas.length === 0 && <div style={{ fontSize: 12, color: '#9A9AA0' }}>Nadie ha habilitado cuentas todavía.</div>}
        {ajenas.map(c => <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderRadius: 10, background: '#fff', marginBottom: 6 }}><div><div style={{ fontWeight: 600, fontSize: 13 }}>{c.nombre} {c.tipo === TC && <span style={{ background: '#F3F1F8', color: '#4B1D9E', fontSize: 10, padding: '1px 6px', borderRadius: 6, fontWeight: 700 }}>TC</span>}</div><div style={{ fontSize: 10, color: '#6E6E73' }}>{c.tipo} · de {nombreDe(duenoCuenta(c))}{duenoCuenta(c) === userId ? ' (tú)' : ''}</div></div>{duenoCuenta(c) === userId && <SmallBtn onClick={() => toggle(c, espacio.id, false)} bg="#FBEAE7" color="#B42318">Deshabilitar</SmallBtn>}</div>)}
      </Card>}
      {edit && <Modal title="Editar cuenta" onClose={() => setEdit(null)}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Nombre" full><input value={edit.nombre} onChange={e => setEdit(p => ({ ...p, nombre: e.target.value }))} style={inp} /></Field>
          <Field label="Tipo"><select value={edit.tipo} onChange={e => setEdit(p => ({ ...p, tipo: e.target.value }))} style={sel}>{TIPOS_CTA.map(x => <option key={x}>{x}</option>)}</select></Field>
          {edit.tipo === TC && <TCF v={edit} set={(k, v) => setEdit(p => ({ ...p, [k]: v }))} />}
          {edit.tipo !== TC && <><Field label="Saldo al empezar (COP)"><input type="number" inputMode="numeric" value={edit.saldo_inicial ?? ''} onChange={e => setEdit(p => ({ ...p, saldo_inicial: e.target.value }))} style={inp} /></Field><Field label="Fecha de corte"><input type="date" value={edit.fecha_corte || ''} onChange={e => setEdit(p => ({ ...p, fecha_corte: e.target.value }))} style={inp} /></Field></>}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => setEdit(null)} /><SaveBtn onClick={save}>Guardar</SaveBtn></div>
      </Modal>}
    </div>
  )
}

/* ── Categorías: por espacio; en compartidos solo admin; usadas no se borran (se desactivan) ── */
function Categorias() {
  const { db, insertar, actualizar, borrar } = useData(); const { esAdmin, esPersonal, espacio } = useAuth()
  const [nuevo, setNuevo] = useState(''); const [grupo, setGrupo] = useState('Variable'); const [verInactivas, setVerInactivas] = useState(false); const [msg, setMsg] = useState('')
  const add = async () => { const v = nuevo.trim(); if (!v) return; try { await insertar('categorias', { nombre: v, grupo }); setNuevo(''); setMsg('') } catch (e) { setMsg(e.message.includes('unique') ? 'Ya existe.' : e.message) } }
  const GCLS = { Fijo: '#E6F2F6|#0F6E8C', Variable: '#f3e8ff|#7e22ce', Provisión: '#FBF0DA|#9A5B00', 'Amortización crédito': '#FBEAE7|#B42318', 'Depreciación activo': '#F3F1F8|#6E6E73' }
  const intentar = async fn => { try { await fn(); setMsg('') } catch (e) { setMsg(e.message) } }
  const eliminar = async c => { if (!window.confirm(`¿Eliminar "${c.nombre}"? Si ya tiene registros, se desactivará en su lugar.`)) return; try { await borrar('categorias', c.id); setMsg('') } catch (e) { if (/registros/.test(e.message)) { await actualizar('categorias', c.id, { activa: false }); setMsg(`"${c.nombre}" tiene registros: quedó desactivada (no aparece en los formularios, el historial se conserva).`) } else setMsg(e.message) } }
  return (
    <Card>
      {!esPersonal && !esAdmin && <div style={{ marginBottom: 10 }}><Aviso tipo="info">Solo un administrador de {espacio.nombre} puede crear o modificar categorías.</Aviso></div>}
      {esAdmin && <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}><input value={nuevo} onChange={e => setNuevo(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Nueva categoría…" style={{ ...inp, flex: 1 }} /><select value={grupo} onChange={e => setGrupo(e.target.value)} style={{ ...sel, width: 120 }}>{GRUPOS.map(g => <option key={g}>{g}</option>)}</select><button onClick={add} style={{ background: '#1B1B1F', color: '#fff', border: 'none', borderRadius: 10, padding: '0 14px', cursor: 'pointer' }}><Icon name="plus" size={16} /></button></div>}
      {GRUPOS.map(g => { const cs = db.categorias.filter(c => c.grupo === g && (verInactivas || c.activa !== false)); if (!cs.length) return null; const [bg, cl] = GCLS[g].split('|'); return <div key={g} style={{ marginBottom: 10 }}><div style={{ fontSize: 10, fontWeight: 700, color: cl, marginBottom: 6 }}>{g}</div><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{cs.map(c => <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 4, background: bg, borderRadius: 9, padding: '5px 10px', opacity: c.activa === false ? 0.5 : 1 }}><span style={{ fontSize: 12, fontWeight: 600, color: cl, textDecoration: c.activa === false ? 'line-through' : 'none' }}>{c.nombre}</span>{esAdmin && c.activa !== false && <select value={c.grupo} onChange={e => intentar(() => actualizar('categorias', c.id, { grupo: e.target.value }))} style={{ fontSize: 9, border: 'none', background: 'transparent', color: cl, width: 14 }}>{GRUPOS.map(x => <option key={x}>{x}</option>)}</select>}{esAdmin && c.activa === false && <button onClick={() => intentar(() => actualizar('categorias', c.id, { activa: true }))} style={{ background: 'none', border: 'none', color: cl, fontSize: 10, cursor: 'pointer' }}>reactivar</button>}{esAdmin && c.activa !== false && <button onClick={() => eliminar(c)} style={{ background: 'none', border: 'none', color: cl, fontSize: 15, cursor: 'pointer', lineHeight: 1, opacity: 0.6 }}>×</button>}</div>)}</div></div> })}
      {db.categorias.some(c => c.activa === false) && <button onClick={() => setVerInactivas(v => !v)} style={{ background: 'none', border: 'none', color: '#9A9AA0', fontSize: 11, cursor: 'pointer', padding: 0 }}>{verInactivas ? 'Ocultar desactivadas' : 'Ver desactivadas'}</button>}
      {msg && <div style={{ marginTop: 10 }}><Aviso tipo={/Ya existe|Solo|No se puede/.test(msg) ? 'err' : 'warn'}>{msg}</Aviso></div>}
    </Card>
  )
}

/* ── Datos: exportar, importar respaldo local (versión anterior) ── */
function Datos() {
  const { db } = useData(); const { espacio } = useAuth(); const hogar = { nombre: espacio.tipo === 'personal' ? 'Personal' : espacio.nombre }
  const [msg, setMsg] = useState('')
  const exportar = () => { const data = { app: 'akontapp', version: 3, hogar: hogar.nombre, exportadoEn: new Date().toISOString(), tablas: db }; descargar(`respaldo-${hogar.nombre.replace(/\s+/g, '-')}-${today()}.json`, JSON.stringify(data, null, 2), 'application/json'); setMsg('Respaldo descargado.') }
  const exportarCSV = () => {
    const nom = (t, id) => db[t].find(x => x.id === id)?.nombre || ''
    descargar(`movimientos-${today()}.csv`, toCSV([['fecha', 'tipo', 'subtipo', 'descripcion', 'categoria', 'cuenta', 'monto', 'origen'], ...db.movimientos.map(m => [fmtDate(m.fecha), m.tipo, m.subtipo || '', m.descripcion, nom('categorias', m.categoria_id), nom('cuentas', m.cuenta_id), m.monto, m.origen])]))
    setTimeout(() => descargar(`presupuesto-${today()}.csv`, toCSV([['periodo', 'concepto', 'categoria', 'monto', 'fecha', 'estado', 'cuenta', 'notas'], ...db.presupuesto.map(p => [fmtDate(p.periodo), p.concepto, nom('categorias', p.categoria_id), p.monto, fmtDate(p.fecha_tentativa), p.estado, nom('cuentas', p.cuenta_id), p.notas || ''])])), 400)
    setMsg('Descargados 2 CSV.')
  }
  const stats = ['presupuesto', 'movimientos', 'deudas', 'tc_cargos', 'programado', 'activos'].map(t => [t, db[t].length])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <div style={{ fontWeight: 700, fontSize: 13, color: '#1B1B1F', marginBottom: 10 }}>Datos de {hogar.nombre}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>{stats.map(([t, n]) => <div key={t} style={{ background: '#fff', borderRadius: 12, padding: '8px 10px' }}><div style={{ fontWeight: 800, fontSize: 15 }}>{n}</div><div style={{ fontSize: 10, color: '#6E6E73' }}>{t.replace('_', ' ')}</div></div>)}</div>
        <button onClick={exportar} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, background: '#4B1D9E', color: '#fff', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 700, marginBottom: 8 }}><Icon name="download" size={16} />Descargar respaldo (JSON)</button>
        <button onClick={exportarCSV} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 11, background: '#fff', color: '#1B1B1F', border: '1px solid #D9D2EA', borderRadius: 12, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}><Icon name="file" size={16} />Exportar movimientos y presupuesto (CSV)</button>
        <div style={{ fontSize: 10, color: '#9A9AA0', marginTop: 8 }}>Tus datos viven en la nube y se sincronizan entre tus dispositivos. El respaldo es opcional.</div>
      </Card>
      {msg && <Aviso tipo={msg.startsWith('Error') ? 'err' : 'ok'}>{msg}</Aviso>}

    </div>
  )
}


// Avisos push: un aviso diario (7:00) con los vencimientos de hoy y los atrasados de Programado, en todos los espacios del usuario.
function Avisos() {
  const { userId } = useAuth()
  const [activo, setActivo] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null)
  useEffect(() => { let on = true; suscripcionActual().then(s => { if (on) setActivo(!!s) }).catch(() => setActivo(false)); return () => { on = false } }, [])
  const ios = esIOS(), instalada = esStandalone(), perm = permiso()
  const bloqueado = ios && !instalada
  const toggle = async () => {
    setBusy(true); setMsg(null)
    try { if (activo) { await desactivar(); setActivo(false); setMsg(['ok', 'Avisos desactivados en este dispositivo.']) } else { await activar(userId); setActivo(true); setMsg(['ok', 'Listo. Cada día a las 7:00 recibirás los vencimientos del día.']) } }
    catch (e) { setMsg(['err', e.message]) } finally { setBusy(false) }
  }
  const prueba = async () => { setBusy(true); setMsg(null); try { setMsg(['ok', await enviarPrueba()]) } catch (e) { setMsg(['err', e.message]) } finally { setBusy(false) } }
  return (
    <Card>
      <div style={{ fontWeight: 800, fontSize: 15, color: T.tinta }}>Avisos de vencimientos</div>
      <div style={{ fontSize: 12, color: T.gris, marginTop: 4, lineHeight: 1.5 }}>Cada día a las 7:00 a. m. te llega una notificación con lo que vence hoy y lo que quedó atrasado en Programado, de todos tus espacios. Si no hay nada, no te molesta.</div>
      {!configurado() && <div style={{ marginTop: 12 }}><Aviso tipo="warn">El servidor aún no tiene configuradas las llaves de avisos (VAPID). Falta un paso de despliegue.</Aviso></div>}
      {configurado() && !soportado() && <div style={{ marginTop: 12 }}><Aviso tipo="warn">Este navegador no soporta avisos push.</Aviso></div>}
      {bloqueado && <div style={{ marginTop: 12 }}><Aviso tipo="info">En iPhone los avisos solo funcionan con la app instalada: en Safari toca <b>Compartir → Añadir a pantalla de inicio</b>, ábrela desde ahí y activa los avisos.</Aviso></div>}
      {perm === 'denied' && <div style={{ marginTop: 12 }}><Aviso tipo="err">Las notificaciones están bloqueadas para Akontapp en este dispositivo. Actívalas en los ajustes del sistema y vuelve aquí.</Aviso></div>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button onClick={toggle} disabled={busy || !soportado() || bloqueado || perm === 'denied' || activo === null} style={{ flex: 1, height: 44, borderRadius: 22, border: 'none', background: activo ? '#fff' : T.morado, color: activo ? T.tinta : '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', outline: activo ? `1.5px solid ${T.divisor}` : 'none', opacity: busy ? 0.6 : 1 }}>{activo === null ? '…' : activo ? 'Desactivar en este dispositivo' : 'Activar avisos en este dispositivo'}</button>
        {activo && <SmallBtn onClick={prueba} bg={T.superficie} color={T.morado}><Icon name="alert" size={12} />Enviar prueba</SmallBtn>}
      </div>
      {msg && <div style={{ marginTop: 10 }}><Aviso tipo={msg[0]}>{msg[1]}</Aviso></div>}
      <div style={{ fontSize: 11, color: T.grisClaro, marginTop: 12 }}>Se activa por dispositivo: hazlo en cada teléfono donde quieras recibirlos.</div>
    </Card>
  )
}
