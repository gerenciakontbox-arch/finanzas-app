import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Icon, inp, SaveBtn, Aviso, T } from '../lib/ui'

const wrap = { minHeight: '100vh', background: T.morado, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', padding: 0 }
const card = { background: '#fff', borderRadius: '28px 28px 0 0', padding: '28px 24px', paddingBottom: 'calc(40px + env(safe-area-inset-bottom))', width: '100%', maxWidth: 480 }
const title = { fontSize: 22, fontWeight: 900, color: T.tinta, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 10 }
const Marca = ({ sub }) => (<div style={{ padding: '72px 24px 36px', paddingTop: 'max(72px, calc(env(safe-area-inset-top) + 28px))', color: '#fff', width: '100%', maxWidth: 480 }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 30, fontWeight: 900, letterSpacing: '-1px' }}><Icon name="wallet" size={30} sw={2} />Akontapp</div><div style={{ fontSize: 14, opacity: 0.85, marginTop: 8, lineHeight: 1.5, maxWidth: 320 }}>{sub}</div></div>)

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
    <div style={{ ...wrap, flexDirection: 'column', justifyContent: 'space-between' }}><Marca sub="Tu plata personal, la de tu hogar y la de tu empresa, cada una en su espacio." /><div style={card}>
      <div style={title}>{estado === 'enviado' || estado === 'verificando' ? 'Revisa tu correo' : 'Entrar'}</div>
      <div style={{ fontSize: 13, color: T.gris, marginTop: 6, marginBottom: 22 }}>Sin contraseñas: te enviamos un código de un solo uso.</div>
      {estado === 'enviado' || estado === 'verificando' ? (<>
        <Aviso tipo="ok">Te enviamos un correo a <b>{email}</b> con un <b>código numérico</b>. Escríbelo aquí para entrar (solo el del correo más reciente; no abras el enlace). Revisa spam si no llega en un minuto.</Aviso>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.gris, display: 'block', marginTop: 16 }}>Código</label>
        <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} value={codigo} onChange={e => setCodigo(e.target.value.replace(/\D/g, ''))} onKeyDown={e => e.key === 'Enter' && verificar()} placeholder="000000" autoFocus style={{ ...inp, marginTop: 6, marginBottom: 12, fontSize: 26, letterSpacing: '0.3em', textAlign: 'center', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }} />
        {err && <div style={{ marginBottom: 10 }}><Aviso tipo="err">{err}</Aviso></div>}
        <div style={{ display: 'flex' }}><SaveBtn onClick={verificar} disabled={estado === 'verificando' || codigo.length < 6}>{estado === 'verificando' ? 'Verificando…' : 'Entrar con el código'}</SaveBtn></div>
        <div style={{ fontSize: 12, color: T.gris, marginTop: 14, lineHeight: 1.5 }}>
          {esStandalone() ? 'Estás en la app instalada: usa el código, no el enlace del correo (el enlace abre en el navegador, no aquí).' : 'El correo también trae un enlace; si lo abres desde este mismo navegador, entras sin escribir el código.'}
          {' '}<button onClick={() => { setEstado('idle'); setCodigo(''); setErr('') }} style={{ background: 'none', border: 'none', color: T.morado, cursor: 'pointer', fontSize: 11, padding: 0, fontWeight: 700, fontFamily: 'inherit' }}>Cambiar correo</button>
        </div>
      </>) : (<>
        <label style={{ fontSize: 12, fontWeight: 600, color: T.gris }}>Tu correo</label>
        <input type="email" inputMode="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && enviar()} placeholder="nombre@correo.com" style={{ ...inp, marginTop: 6, marginBottom: 12, fontSize: 16 }} />
        {err && <div style={{ marginBottom: 10 }}><Aviso tipo="err">{err}</Aviso></div>}
        <div style={{ display: 'flex' }}><SaveBtn onClick={enviar} disabled={estado === 'enviando'}>{estado === 'enviando' ? 'Enviando…' : 'Enviarme el código por correo'}</SaveBtn></div>
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
    <div style={{ margin: '16px 20px 0', background: T.superficie, borderRadius: 16, padding: '14px 16px' }}>
      <div style={{ fontWeight: 800, fontSize: 15, color: T.tinta }}>¿Cómo te llamas?</div>
      <div style={{ fontSize: 12, color: T.gris, margin: '4px 0 10px' }}>Así aparecerás en lo que registres y en los espacios que compartas.</div>
      <div style={{ display: 'flex', gap: 8 }}><input value={nombre} onChange={e => setNombre(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} placeholder="Ej. Andrés" style={{ ...inp, flex: 1, background: '#fff' }} /><SaveBtn onClick={go} disabled={busy || !nombre.trim()}>Guardar</SaveBtn></div>
      <button onClick={() => setOculto(true)} style={{ background: 'none', border: 'none', color: T.gris, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 10, fontFamily: 'inherit' }}>Después</button>
    </div>
  )
}

export function FaltaMigracion({ version }) {
  const { salir } = useAuth()
  return (
    <div style={{ ...wrap, flexDirection: 'column', justifyContent: 'space-between' }}><Marca sub="Falta un paso en la base de datos." /><div style={card}>
      <div style={title}><Icon name="alert" size={24} style={{ color: T.ambar }} />Base de datos desactualizada</div>
      <div style={{ fontSize: 13, color: T.tinta, marginTop: 10, lineHeight: 1.6 }}>
        Esta versión de la app necesita el esquema <b>v{version}</b>. En Supabase → <b>SQL Editor</b> ejecuta, en orden, los archivos de <code>supabase/migrations/</code> que falten (hasta <code>000{version}_…sql</code>) del repositorio y vuelve a abrir la app. No se pierde ningún dato.
      </div>
      <div style={{ marginTop: 14 }}><button onClick={() => window.location.reload()} style={{ width: '100%', height: 46, background: T.morado, color: '#fff', border: 'none', borderRadius: 23, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>Ya la ejecuté, reintentar</button></div>
      <button onClick={salir} style={{ background: 'none', border: 'none', color: T.gris, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 12, fontFamily: 'inherit' }}>Cerrar sesión</button>
    </div></div>
  )
}

export function SinConfigurar() {
  return (
    <div style={{ ...wrap, flexDirection: 'column', justifyContent: 'space-between' }}><Marca sub="Falta configurar el despliegue." /><div style={card}>
      <div style={title}><Icon name="alert" size={24} style={{ color: T.ambar }} />Falta configuración</div>
      <div style={{ fontSize: 13, color: T.tinta, marginTop: 10, lineHeight: 1.6 }}>
        La app no tiene las credenciales de Supabase. En Netlify: <b>Project configuration → Environment variables</b> y agrega <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code>. Luego vuelve a desplegar.
      </div>
    </div></div>
  )
}
