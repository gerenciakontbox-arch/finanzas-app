import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Icon, inp, SaveBtn, Aviso } from '../lib/ui'

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
      <div style={title}><Icon name="wallet" size={26} style={{ color: '#7c3aed' }} />Akontapp</div>
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

// Primer ingreso: el nombre se tomó del correo; se pide uno real una sola vez.
export function PrimerNombre() {
  const { cambiarMiNombre } = useAuth()
  const [nombre, setNombre] = useState(''); const [busy, setBusy] = useState(false); const [oculto, setOculto] = useState(false)
  if (oculto) return null
  const go = async () => { if (!nombre.trim()) return; setBusy(true); try { await cambiarMiNombre(nombre.trim()) } finally { setBusy(false) } }
  return (
    <div style={{ margin: '14px 14px 0', background: '#fff', borderRadius: 16, padding: '14px 16px', border: '1px solid #e9d5ff', boxShadow: '0 6px 20px rgba(124,58,237,0.08)' }}>
      <div style={{ fontWeight: 800, fontSize: 14, color: '#111' }}>¿Cómo te llamas?</div>
      <div style={{ fontSize: 11, color: '#6b7280', margin: '4px 0 10px' }}>Así aparecerás en lo que registres y en los espacios que compartas.</div>
      <div style={{ display: 'flex', gap: 8 }}><input value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder="Ej. Andrés" style={{ ...inp, flex: 1 }} /><SaveBtn onClick={go} disabled={busy || !nombre.trim()}>Guardar</SaveBtn></div>
      <button onClick={() => setOculto(true)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer', padding: 0, marginTop: 8 }}>Después</button>
    </div>
  )
}

export function FaltaMigracion({ version }) {
  const { salir } = useAuth()
  return (
    <div style={wrap}><div style={card}>
      <div style={title}><Icon name="alert" size={26} style={{ color: '#d97706' }} />Base de datos desactualizada</div>
      <div style={{ fontSize: 13, color: '#374151', marginTop: 10, lineHeight: 1.6 }}>
        Esta versión de la app necesita el esquema <b>v{version}</b>. En Supabase → <b>SQL Editor</b> ejecuta el archivo <code>supabase/migrations/0002_espacios.sql</code> del repositorio y vuelve a abrir la app. No se pierde ningún dato.
      </div>
      <div style={{ marginTop: 14 }}><button onClick={() => window.location.reload()} style={{ width: '100%', padding: 12, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 12, fontWeight: 700, cursor: 'pointer' }}>Ya la ejecuté, reintentar</button></div>
      <button onClick={salir} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer', padding: 0, marginTop: 10 }}>Cerrar sesión</button>
    </div></div>
  )
}

export function SinConfigurar() {
  return (
    <div style={wrap}><div style={card}>
      <div style={title}><Icon name="alert" size={26} style={{ color: '#d97706' }} />Falta configuración</div>
      <div style={{ fontSize: 13, color: '#374151', marginTop: 10, lineHeight: 1.6 }}>
        La app no tiene las credenciales de Supabase. En Netlify: <b>Project configuration → Environment variables</b> y agrega <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Luego vuelve a desplegar.
      </div>
    </div></div>
  )
}
