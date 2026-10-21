// Sesión + espacios del usuario. Cada usuario tiene un espacio personal (se crea solo);
// hogares y empresas son espacios compartidos con miembros (admin / miembro).
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

export const SCHEMA_VERSION = '8'
// Estado vigente por finalidad (última fila) + versión de política con la que se aceptó el servicio
const resumirConsent = rows => { const out = { version: null, servicio: false, analitica: false, perfil: false, comercial: false }; const visto = {}; for (const r of rows) { if (visto[r.finalidad]) continue; visto[r.finalidad] = true; out[r.finalidad] = !!r.aceptado; if (r.finalidad === 'servicio') out.version = r.version } return out }
const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [perfil, setPerfil] = useState(null)
  const [espacios, setEspacios] = useState([])
  const [miembros, setMiembros] = useState([])      // de TODOS mis espacios
  const [schemaOk, setSchemaOk] = useState(null)    // null = sin verificar
  const [consent, setConsent] = useState({ version: null, servicio: false, analitica: false, perfil: false, comercial: false })
  const [esOperador, setEsOperador] = useState(false)
  const [listo, setListo] = useState(false)

  const cargarContexto = useCallback(async (s) => {
    if (!s) { setPerfil(null); setEspacios([]); setMiembros([]); setListo(false); return }
    const { data: meta } = await supabase.from('app_meta').select('valor').eq('clave', 'schema_version').maybeSingle()
    const ok = meta?.valor === SCHEMA_VERSION; setSchemaOk(ok)
    if (!ok) { setListo(true); return }
    await supabase.rpc('asegurar_personal')
    const [{ data: p }, { data: es }, { data: ms }, { data: cs }, { data: adm }] = await Promise.all([
      supabase.from('perfiles').select('*').eq('user_id', s.user.id).maybeSingle(),
      supabase.from('espacios').select('*'),
      supabase.from('espacio_miembros').select('*'),
      supabase.from('consentimientos').select('finalidad,aceptado,version,creado_en,id').order('creado_en', { ascending: false }).order('id', { ascending: false }),
      supabase.from('app_admins').select('user_id').eq('user_id', s.user.id).maybeSingle(),
    ])
    setPerfil(p); setEspacios(es || []); setMiembros(ms || []); setConsent(resumirConsent(cs || [])); setEsOperador(!!adm); setListo(true)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); cargarContexto(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); cargarContexto(s) })
    return () => sub.subscription.unsubscribe()
  }, [cargarContexto])

  const userId = session?.user?.id || null
  const personal = espacios.find(e => e.tipo === 'personal' && e.dueno_id === userId) || null
  const espacio = espacios.find(e => e.id === perfil?.espacio_activo) || personal || espacios[0] || null
  const miembrosDe = id => miembros.filter(m => m.espacio_id === id)
  const nombreDe = uid => { const m = miembros.find(x => x.user_id === uid && x.espacio_id === espacio?.id) || miembros.find(x => x.user_id === uid); return m?.nombre || (uid === userId ? 'Yo' : '—') }
  const miembroActual = espacio ? miembrosDe(espacio.id).find(m => m.user_id === userId) || null : null

  const api = {
    session, user: session?.user || null, userId, perfil, schemaOk, listo,
    espacios, espacio, personal, esPersonal: espacio?.tipo === 'personal', compartidos: espacios.filter(e => e.tipo !== 'personal'),
    miembros: espacio ? miembrosDe(espacio.id) : [], miembrosDe, miembrosTodos: miembros, miembroActual, nombreDe,
    esAdmin: miembroActual?.rol === 'admin' || espacio?.tipo === 'personal',
    recargar: () => cargarContexto(session),
    consent, esOperador,
    registrarConsentimientos: async (obj, version) => { const { error } = await supabase.rpc('registrar_consentimientos', { p: obj, p_version: version, p_user_agent: navigator.userAgent }); if (error) throw error; const { data: cs } = await supabase.from('consentimientos').select('finalidad,aceptado,version,creado_en,id').order('creado_en', { ascending: false }).order('id', { ascending: false }); setConsent(resumirConsent(cs || [])) },
    eliminarMiCuenta: async () => { const { error } = await supabase.rpc('eliminar_mi_cuenta'); if (error) throw error; await supabase.auth.signOut() },
    enviarEnlace: async (email) => supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }),
    verificarCodigo: async (email, token) => supabase.auth.verifyOtp({ email, token: String(token).replace(/\D/g, ''), type: 'email' }),
    salir: () => supabase.auth.signOut(),
    cambiarEspacio: async (id) => { await supabase.from('perfiles').update({ espacio_activo: id }).eq('user_id', userId); await cargarContexto(session) },
    crearEspacio: async (tipo, nombre, nombreMiembro) => { const { data, error } = await supabase.rpc('crear_espacio', { p_tipo: tipo, p_nombre: nombre, p_nombre_miembro: nombreMiembro }); if (error) throw error; await cargarContexto(session); return data },
    unirse: async (codigo, nombreMiembro) => { const { data, error } = await supabase.rpc('unirse_espacio', { p_codigo: codigo, p_nombre_miembro: nombreMiembro }); if (error) throw error; await cargarContexto(session); return data },
    regenerarCodigo: async () => { const { data, error } = await supabase.rpc('regenerar_codigo', { p_espacio: espacio.id }); if (error) throw error; await cargarContexto(session); return data },
    renombrarEspacio: async (nombre) => { const { error } = await supabase.from('espacios').update({ nombre }).eq('id', espacio.id); if (error) throw error; await cargarContexto(session) },
    cambiarMiNombre: async (nombre) => { const { error } = await supabase.rpc('cambiar_mi_nombre', { p_nombre: nombre }); if (error) throw error; await cargarContexto(session) },
    expulsar: async (uid) => { const { error } = await supabase.from('espacio_miembros').delete().eq('espacio_id', espacio.id).eq('user_id', uid); if (error) throw error; await cargarContexto(session) },
    cambiarRol: async (uid, rol) => { const { error } = await supabase.from('espacio_miembros').update({ rol }).eq('espacio_id', espacio.id).eq('user_id', uid); if (error) throw error; await cargarContexto(session) },
    abandonar: async () => { const { error } = await supabase.from('espacio_miembros').delete().eq('espacio_id', espacio.id).eq('user_id', userId); if (error) throw error; await supabase.from('perfiles').update({ espacio_activo: personal?.id || null }).eq('user_id', userId); await cargarContexto(session) },
  }
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
