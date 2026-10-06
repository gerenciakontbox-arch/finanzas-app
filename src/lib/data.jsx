// Capa de datos: carga todas las tablas del hogar activo, expone CRUD con auditoría
// implícita (triggers en BD) y recarga reactiva. Suscripción en tiempo real para que
// varios miembros vean los cambios de los demás sin refrescar.
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'

const TABLAS = ['entidades', 'categorias', 'cuentas', 'activos', 'presupuesto', 'deudas', 'tc_cargos', 'cuotas_pagadas', 'programado', 'programado_adjuntos', 'movimientos']
const Ctx = createContext(null)
export const useData = () => useContext(Ctx)

export function DataProvider({ children }) {
  const { hogar, user } = useAuth()
  const [db, setDb] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    if (!hogar) { setDb(null); return }
    try {
      const res = await Promise.all(TABLAS.map(t => supabase.from(t).select('*').eq('hogar_id', hogar.id)))
      const out = {}
      TABLAS.forEach((t, i) => { if (res[i].error) throw res[i].error; out[t] = res[i].data })
      setDb(out); setError(null)
    } catch (e) { setError(e.message || String(e)) }
  }, [hogar])

  useEffect(() => { cargar() }, [cargar])

  // Realtime: cualquier cambio en el hogar → recarga la tabla afectada
  useEffect(() => {
    if (!hogar) return
    const ch = supabase.channel('hogar-' + hogar.id)
    TABLAS.forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t, filter: `hogar_id=eq.${hogar.id}` }, async () => {
      const { data } = await supabase.from(t).select('*').eq('hogar_id', hogar.id)
      if (data) setDb(prev => prev ? { ...prev, [t]: data } : prev)
    }))
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [hogar])

  const api = useMemo(() => {
    const h = hogar?.id
    const refrescar = async (t) => { const { data } = await supabase.from(t).select('*').eq('hogar_id', h); if (data) setDb(prev => ({ ...prev, [t]: data })) }
    return {
      db, error, recargar: cargar, hogarId: h, userId: user?.id,
      insertar: async (t, row) => { const { data, error } = await supabase.from(t).insert({ ...row, hogar_id: h }).select().single(); if (error) throw error; await refrescar(t); return data },
      insertarVarios: async (t, rows) => { const { data, error } = await supabase.from(t).insert(rows.map(r => ({ ...r, hogar_id: h }))).select(); if (error) throw error; await refrescar(t); return data },
      actualizar: async (t, id, patch) => { const { error } = await supabase.from(t).update(patch).eq('id', id); if (error) throw error; await refrescar(t) },
      borrar: async (t, id) => { const { error } = await supabase.from(t).delete().eq('id', id); if (error) throw error; await refrescar(t) },
      rpc: async (fn, args) => { const { data, error } = await supabase.rpc(fn, args); if (error) throw error; await cargar(); return data },
      subirAdjunto: async (programadoId, file) => {
        const ruta = `${h}/${programadoId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
        const { error } = await supabase.storage.from('adjuntos').upload(ruta, file, { contentType: file.type })
        if (error) throw error
        return api.insertar('programado_adjuntos', { programado_id: programadoId, ruta, nombre: file.name, mime: file.type, bytes: file.size })
      },
      urlAdjunto: async (ruta) => { const { data } = await supabase.storage.from('adjuntos').createSignedUrl(ruta, 3600); return data?.signedUrl },
      borrarAdjunto: async (adj) => { await supabase.storage.from('adjuntos').remove([adj.ruta]); await api.borrar('programado_adjuntos', adj.id) },
    }
  }, [db, error, cargar, hogar, user])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

// Índices derivados de uso frecuente
export function useIndices() {
  const { db } = useData()
  return useMemo(() => {
    if (!db) return null
    const byId = t => Object.fromEntries(db[t].map(r => [r.id, r]))
    return { ent: byId('entidades'), cat: byId('categorias'), cta: byId('cuentas'), act: byId('activos'), deu: byId('deudas'), pre: byId('presupuesto'), prog: byId('programado') }
  }, [db])
}
