import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Icon, inp, SaveBtn, Aviso, PBtn } from '../lib/ui'

const wrap = { minHeight: '100vh', background: 'linear-gradient(160deg,#7c3aed,#4338ca)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }
const card = { background: '#fff', borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }
const title = { fontSize: 22, fontWeight: 900, color: '#111', letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 10 }

const esStandalone = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)

export function Login() {
  const { enviarEnlace, verificarCodigo } = useAuth()
  const [email, setEmail] = useState(''); const [estado, setEstado] = useState('idle'); const [err, setErr] = useState(''); const [codigo, setCodigo] = useState('')
  const enviar = async () => {
    if (!/\S+@\S+\.\S+/.test(email)) { setErr('Escribe un correo válido.'); return }
    setEstado('enviando'); setErr('')
    const { error } = await enviarEnlace(email.trim().toLowerCase())
    if (error) { setErr(error.message === 'email rate limit exceeded' ? 'Se alcanzó el límite de correos por hora. Espera unos minutos e intenta de nuevo.' : error.message); setEstado('idle') } else setEstado('enviado')
  }
  const verificar = async () => {
    const t = codigo.replace(/\D/g, ''); if (t.length < 6) { setErr('El código tiene entre 6 y 10 dígitos.'); return }
    setEstado('verificando'); setErr('')
    const { error } = await verificarCodigo(email.trim().toLowerCase(), t)
    if (error) { setErr(/expired|invalid/i.test(error.message) ? 'Código inválido o vencido. Pide uno nuevo.' : error.message); setEstado('enviado') }
  }
  return (
    <div style={wrap}><div style={card}>
      <div style={title}><Icon name="wallet" size={26} style={{ color: '#7c3aed' }} />Finanzas Integradas</div>
      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6, marginBottom: 22 }}>Presupuesto, deudas y patrimonio del hogar, en un solo lugar.</div>
      {estado === 'enviado' || estado === 'verificando' ? (<>
        <Aviso tipo="ok">Te enviamos un correo a <b>{email}</b> con un <b>código numérico</b>. Escríbelo aquí para entrar (solo el del correo más reciente; no abras el enlace). Revisa spam si no llega en un minuto.</Aviso>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginTop: 16 }}>Código</label>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && verificar()} placeholder="código" autoFocus style={{ ...inp, marginTop: 6, marginBottom: 12, fontSize: 26, letterSpacing: '0.4em', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700 }} />
        {err && <div style={{ marginBottom: 10 }}><Aviso tipo="err">{err}</Aviso></div>}
        <div style={{ display: 'flex' }}><SaveBtn onClick={verificar} disabled={estado === 'verificando' || codigo.length < 6}>{estado === 'verificando' ? 'Verificando…' : 'Entrar con el código'}</SaveBtn></div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 14, lineHeight: 1.5 }}>
          {esStandalone() ? 'Estás en la app instalada: usa el código, no el enlace del correo (el enlace abre en el navegador, no aquí).' : 'El correo también trae un enlace; si lo abres desde este mismo navegador, entras sin escribir el código.'}
          {' '}<button onClick={() => { setEstado('idle'); setCodigo(''); setErr('') }} style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 11, padding: 0 }}>Cambiar correo</button>
        </div>
      </>) : (<>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Tu correo</label>
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="nombre@correo.com" style={{ ...inp, marginTop: 6, marginBottom: 12, fontSize: 16 }} />
        {err && <div style={{ marginBottom: 10 }}><Aviso tipo="err">{err}</Aviso></div>}
        <div style={{ display: 'flex' }}><SaveBtn onClick={enviar} disabled={estado === 'enviando'}>{estado === 'enviando' ? 'Enviando…' : 'Enviarme el código por correo'}</SaveBtn></div>
        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 14, lineHeight: 1.5 }}>Sin contraseñas. Te llega un código de un solo uso a tu correo.</div>
      </>)}
    </div></div>
  )
}

export function Onboarding() {
  const { crearHogar, unirseHogar, user, salir } = useAuth()
  const [modo, setModo] = useState('crear'); const [nombre, setNombre] = useState(''); const [hogar, setHogar] = useState(''); const [codigo, setCodigo] = useState('')
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false)
  const go = async () => {
    setErr('')
    if (!nombre.trim()) { setErr('Escribe tu nombre: así aparecerás en lo que registres.'); return }
    setBusy(true)
    try { modo === 'crear' ? await crearHogar(hogar.trim() || `Hogar de ${nombre.trim()}`, nombre.trim()) : await unirseHogar(codigo, nombre.trim()) }
    catch (e) { setErr(e.message || String(e)) } finally { setBusy(false) }
  }
  return (
    <div style={wrap}><div style={card}>
      <div style={title}><Icon name="home" size={26} style={{ color: '#7c3aed' }} />Tu hogar</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, marginBottom: 16 }}>Sesión: {user?.email} · <button onClick={salir} style={{ background: 'none', border: 'none', color: '#7c3aed', cursor: 'pointer', fontSize: 12, padding: 0 }}>salir</button></div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}><PBtn active={modo === 'crear'} onClick={() => setModo('crear')}>Crear un hogar</PBtn><PBtn active={modo === 'unir'} onClick={() => setModo('unir')}>Tengo un código</PBtn></div>
      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Tu nombre</label>
      <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Andrés" style={{ ...inp, marginTop: 6, marginBottom: 12 }} />
      {modo === 'crear' ? (<>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Nombre del hogar</label>
        <input value={hogar} onChange={e => setHogar(e.target.value)} placeholder="Ej. Casa Quijano" style={{ ...inp, marginTop: 6, marginBottom: 12 }} />
        <Aviso tipo="info">Serás el dueño. Luego podrás invitar a tu familia con un código desde Config.</Aviso>
      </>) : (<>
        <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Código de invitación</label>
        <input value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())} placeholder="8 caracteres" maxLength={8} style={{ ...inp, marginTop: 6, marginBottom: 12, letterSpacing: '0.2em', fontFamily: 'monospace', fontSize: 18, textAlign: 'center' }} />
        <Aviso tipo="info">Pídele el código al dueño del hogar (está en Config → Hogar).</Aviso>
      </>)}
      {err && <div style={{ marginTop: 10 }}><Aviso tipo="err">{err}</Aviso></div>}
      <div style={{ display: 'flex', marginTop: 16 }}><SaveBtn onClick={go} disabled={busy}>{busy ? 'Un momento…' : modo === 'crear' ? 'Crear mi hogar' : 'Unirme al hogar'}</SaveBtn></div>
    </div></div>
  )
}

export function SinConfigurar() {
  return (
    <div style={wrap}><div style={card}>
      <div style={title}><Icon name="alert" size={26} style={{ color: '#d97706' }} />Falta configuración</div>
      <div style={{ fontSize: 13, color: '#374151', marginTop: 10, lineHeight: 1.6 }}>
        La app no tiene las credenciales de Supabase. En Netlify: <b>Site configuration → Environment variables</b> y agrega <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Luego vuelve a desplegar.
      </div>
    </div></div>
  )
}
