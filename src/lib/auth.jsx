import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = cargando
  const [perfil, setPerfil] = useState(null)
  const [hogar, setHogar] = useState(null)
  const [miembros, setMiembros] = useState([])
  const [hogares, setHogares] = useState([])

  const cargarContexto = useCallback(async (s) => {
    if (!s) { setPerfil(null); setHogar(null); setMiembros([]); setHogares([]); return }
    const { data: p } = await supabase.from('perfiles').select('*').eq('user_id', s.user.id).maybeSingle()
    const { data: hs } = await supabase.from('hogares').select('id,nombre,codigo_invitacion,moneda,creado_en')
    setPerfil(p); setHogares(hs || [])
    const activo = (hs || []).find(h => h.id === p?.hogar_activo) || (hs || [])[0] || null
    setHogar(activo)
    if (activo) {
      const { data: ms } = await supabase.from('miembros').select('user_id,rol,nombre,unido_en').eq('hogar_id', activo.id)
      setMiembros(ms || [])
    } else setMiembros([])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); cargarContexto(data.session) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); cargarContexto(s) })
    return () => sub.subscription.unsubscribe()
  }, [cargarContexto])

  const api = {
    session, user: session?.user || null, perfil, hogar, hogares, miembros,
    miembroActual: miembros.find(m => m.user_id === session?.user?.id) || null,
    esDueño: miembros.some(m => m.user_id === session?.user?.id && m.rol === 'dueño'),
    recargar: () => cargarContexto(session),
    enviarEnlace: async (email) => supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }),
    salir: () => supabase.auth.signOut(),
    crearHogar: async (nombreHogar, nombreMiembro) => { const { data, error } = await supabase.rpc('crear_hogar', { p_nombre: nombreHogar, p_nombre_miembro: nombreMiembro }); if (error) throw error; await cargarContexto(session); return data },
    unirseHogar: async (codigo, nombreMiembro) => { const { data, error } = await supabase.rpc('unirse_hogar', { p_codigo: codigo, p_nombre_miembro: nombreMiembro }); if (error) throw error; await cargarContexto(session); return data },
    cambiarHogar: async (id) => { await supabase.from('perfiles').update({ hogar_activo: id }).eq('user_id', session.user.id); await cargarContexto(session) },
    regenerarCodigo: async () => { const { data, error } = await supabase.rpc('regenerar_codigo', { p_hogar: hogar.id }); if (error) throw error; await cargarContexto(session); return data },
  }
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}
