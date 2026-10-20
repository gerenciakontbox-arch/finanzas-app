// Capa de datos: carga TODO lo que el usuario puede ver (RLS filtra en el servidor) y
// expone una vista filtrada por el espacio activo (db) más la vista cruzada (all).
// CRUD con auditoría implícita (triggers), recarga reactiva y tiempo real.
import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from './supabase'
import { useAuth } from './auth'
import { TC } from './util'

const TABLAS = ['categorias', 'cuentas', 'cuentas_espacio', 'activos', 'presupuesto', 'deudas', 'tc_cargos', 'cuotas_pagadas', 'abonos_capital', 'programado', 'programado_adjuntos', 'movimientos']
const Ctx = createContext(null)
export const useData = () => useContext(Ctx)

export function DataProvider({ children }) {
  const { espacio, espacios, userId, listo, schemaOk, miembrosTodos } = useAuth()
  const [all, setAll] = useState(null)
  const [error, setError] = useState(null)

  const cargar = useCallback(async () => {
    if (!listo || !schemaOk || !espacio) { setAll(null); return }
    try {
      const res = await Promise.all(TABLAS.map(t => supabase.from(t).select('*')))
      const out = {}
      TABLAS.forEach((t, i) => { if (res[i].error) throw res[i].error; out[t] = res[i].data })
      setAll(out); setError(null)
    } catch (e) { setError(e.message || String(e)) }
  }, [listo, schemaOk, espacio?.id])

  useEffect(() => { cargar() }, [cargar])

  // Tiempo real: cualquier cambio visible → recarga la tabla afectada
  useEffect(() => {
    if (!listo || !schemaOk || !userId) return
    const ch = supabase.channel('akontapp-' + userId)
    TABLAS.forEach(t => ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, async () => {
      const { data } = await supabase.from(t).select('*')
      if (data) setAll(prev => prev ? { ...prev, [t]: data } : prev)
    }))
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [listo, schemaOk, userId])

  const api = useMemo(() => {
    const e = espacio?.id
    const refrescar = async (t) => { const { data } = await supabase.from(t).select('*'); if (data) setAll(prev => ({ ...prev, [t]: data })) }
    const espacioDe = id => espacios.find(x => x.id === id) || null
    // Cuentas disponibles como medio de pago en un espacio: las propias del espacio + las personales habilitadas
    const cuentasDe = (eid) => {
      if (!all) return []
      const habil = new Set(all.cuentas_espacio.filter(x => x.espacio_id === eid).map(x => x.cuenta_id))
      return all.cuentas.filter(c => c.activo !== false && (c.espacio_id === eid || habil.has(c.id))).sort((a, b) => (a.espacio_id === eid ? 0 : 1) - (b.espacio_id === eid ? 0 : 1) || a.nombre.localeCompare(b.nombre))
    }
    const duenoCuenta = c => c?.dueno_id || null
    const nombreMiembro = (uid, eid) => { const m = miembrosTodos.find(x => x.user_id === uid && x.espacio_id === (eid || e)) || miembrosTodos.find(x => x.user_id === uid); return m?.nombre || '—' }
    const nombreCuenta = c => { if (!c) return '—'; const d = duenoCuenta(c); return d && d !== userId ? `${c.nombre} · ${nombreMiembro(d)}` : c.nombre }
    // Saldo de una cuenta: solo movimientos de SU espacio (los de espacios compartidos no tocan caja; sus espejos sí)
    const saldoCuenta = c => {
      if (!all || !c || c.tipo === TC) return 0
      let s = 0
      for (const m of all.movimientos) {
        if (m.espacio_id !== c.espacio_id) continue
        const monto = +m.monto
        if (m.tipo === 'Ingreso' && m.cuenta_id === c.id) s += monto
        else if (m.tipo === 'Salida' && m.cuenta_id === c.id) s -= monto
        else if (m.tipo === 'Transferencia') {
          if (m.subtipo === 'aporte' && m.cuenta_id === c.id) s -= monto
          else if ((m.subtipo === 'recibido' || m.subtipo === 'devolucion') && m.cuenta_id === c.id) s += monto
          else if (m.subtipo === 'traslado') { if (m.cuenta_id === c.id) s -= monto; if (m.cuenta_destino_id === c.id) s += monto }
        }
      }
      return s
    }
    const db = all && e ? {
      categorias: all.categorias.filter(x => x.espacio_id === e),
      cuentas: cuentasDe(e),
      cuentasPropias: all.cuentas.filter(x => x.espacio_id === e),
      cuentas_espacio: all.cuentas_espacio,
      activos: all.activos.filter(x => x.espacio_id === e),
      presupuesto: all.presupuesto.filter(x => x.espacio_id === e),
      deudas: all.deudas.filter(x => x.espacio_id === e),
      tc_cargos: all.tc_cargos.filter(x => x.espacio_id === e),
      cuotas_pagadas: all.cuotas_pagadas.filter(x => x.espacio_id === e),
      abonos_capital: (all.abonos_capital || []).filter(x => x.espacio_id === e),
      programado: all.programado.filter(x => x.espacio_id === e),
      programado_adjuntos: all.programado_adjuntos.filter(x => x.espacio_id === e),
      movimientos: all.movimientos.filter(x => x.espacio_id === e),
      entidades: [],
    } : null
    return {
      db, all, error, recargar: cargar, espacioId: e, userId, espacioDe, cuentasDe, duenoCuenta, nombreCuenta, nombreMiembro, saldoCuenta,
      insertar: async (t, row) => { const { data, error } = await supabase.from(t).insert({ espacio_id: e, ...row }).select().single(); if (error) throw error; await refrescar(t); if (t === 'movimientos') await refrescar('cuotas_pagadas'); return data },
      insertarVarios: async (t, rows) => { const { data, error } = await supabase.from(t).insert(rows.map(r => ({ espacio_id: e, ...r }))).select(); if (error) throw error; await refrescar(t); return data },
      actualizar: async (t, id, patch) => { const { error } = await supabase.from(t).update(patch).eq('id', id); if (error) throw error; await refrescar(t); if (t === 'movimientos') await refrescar('movimientos') },
      borrar: async (t, id) => { const { error } = await supabase.from(t).delete().eq('id', id); if (error) throw error; await cargar() },
      rpc: async (fn, args) => { const { data, error } = await supabase.rpc(fn, args); if (error) throw error; await cargar(); return data },
      subirAdjunto: async (programadoId, file) => {
        const ruta = `${e}/${programadoId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, '_')}`
        const { error } = await supabase.storage.from('adjuntos').upload(ruta, file, { contentType: file.type })
        if (error) throw error
        const { data, error: e2 } = await supabase.from('programado_adjuntos').insert({ espacio_id: e, programado_id: programadoId, ruta, nombre: file.name, mime: file.type, bytes: file.size }).select().single(); if (e2) throw e2
        await refrescar('programado_adjuntos'); return data
      },
      urlAdjunto: async (ruta) => { const { data } = await supabase.storage.from('adjuntos').createSignedUrl(ruta, 3600); return data?.signedUrl },
      borrarAdjunto: async (adj) => { await supabase.storage.from('adjuntos').remove([adj.ruta]); await supabase.from('programado_adjuntos').delete().eq('id', adj.id); await refrescar('programado_adjuntos') },
    }
  }, [all, error, cargar, espacio, espacios, userId, miembrosTodos])

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>
}

// Índices por id sobre TODO lo visible (para resolver nombres de otros espacios, p. ej. espejos)
export function useIndices() {
  const { all } = useData()
  return useMemo(() => {
    if (!all) return null
    const byId = t => Object.fromEntries(all[t].map(r => [r.id, r]))
    return { cat: byId('categorias'), cta: byId('cuentas'), act: byId('activos'), deu: byId('deudas'), pre: byId('presupuesto'), prog: byId('programado'), ent: {} }
  }, [all])
}
