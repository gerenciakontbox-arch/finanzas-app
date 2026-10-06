// Backend en memoria con la interfaz mínima de supabase-js que usa la app.
// Replica la lógica de las funciones RPC del esquema SQL para pruebas de UI.
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const addMonths = (d, n) => { const dt = new Date(d + 'T12:00:00'); dt.setMonth(dt.getMonth() + n); return dt.toISOString().slice(0, 10) }
const addDays = (d, n) => { const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10) }

export function crearMock({ userId = 'u-andres', email = 'andres@test.co' } = {}) {
  const T = {}; const tablas = ['hogares', 'miembros', 'perfiles', 'entidades', 'categorias', 'cuentas', 'activos', 'presupuesto', 'deudas', 'tc_cargos', 'cuotas_pagadas', 'programado', 'programado_adjuntos', 'movimientos', 'bitacora']
  tablas.forEach(t => T[t] = [])
  let session = null; const listeners = []
  const me = () => session?.user?.id
  const misHogares = () => T.miembros.filter(m => m.user_id === me()).map(m => m.hogar_id)
  const can = row => !row.hogar_id || misHogares().includes(row.hogar_id)

  const q = (t) => {
    const st = { filters: [], op: 'select', payload: null, single: false, maybe: false, selecting: false }
    const run = () => {
      let rows = T[t].filter(r => st.filters.every(([k, v]) => String(r[k]) === String(v)))
      if (t !== 'hogares' && t !== 'perfiles') rows = rows.filter(can)
      if (t === 'hogares') rows = rows.filter(r => misHogares().includes(r.id))
      if (t === 'perfiles') rows = rows.filter(r => r.user_id === me())
      if (st.op === 'insert') {
        const arr = Array.isArray(st.payload) ? st.payload : [st.payload]
        const DEF = { programado: () => ({ estado: 'Pendiente', serie_id: uid(), ficha_valores: {} }), movimientos: () => ({ origen: 'manual', desglose: {} }), cuentas: () => ({ activo: true }), entidades: () => ({ tipo: 'persona', activo: true }), categorias: () => ({ grupo: 'Variable', afecta_caja: true }), presupuesto: () => ({ estado: 'Planificado' }), deudas: () => ({ estado: 'Activo', tasa_mensual: 0 }) }
        const out = arr.map(r => { const row = { id: uid(), creado_por: me(), creado_en: now(), actualizado_por: me(), actualizado_en: now(), ...(DEF[t] ? DEF[t]() : {}), ...r }; if (!can(row)) throw new Error('RLS: hogar ajeno'); T[t].push(row); return row })
        return Array.isArray(st.payload) ? out : out[0]
      }
      if (st.op === 'update') { rows.forEach(r => Object.assign(r, st.payload, { actualizado_por: me(), actualizado_en: now() })); return rows }
      if (st.op === 'delete') { rows.forEach(r => { cascade(t, r); T[t].splice(T[t].indexOf(r), 1) }); return rows }
      return rows
    }
    const cascade = (t, r) => { if (t === 'cuentas') { T.tc_cargos.filter(c => c.cuenta_id === r.id).forEach(c => cascade('tc_cargos', c)); T.tc_cargos = T.tc_cargos.filter(c => c.cuenta_id !== r.id) } if (t === 'tc_cargos') T.cuotas_pagadas = T.cuotas_pagadas.filter(c => c.cargo_id !== r.id); if (t === 'deudas') T.cuotas_pagadas = T.cuotas_pagadas.filter(c => c.deuda_id !== r.id); if (t === 'movimientos') { T.cuotas_pagadas.forEach(c => { if (c.movimiento_id === r.id) c.movimiento_id = null }) } if (t === 'programado') T.programado_adjuntos = T.programado_adjuntos.filter(a => a.programado_id !== r.id) }
    const fin = () => { try { let d = run(); if (st.single || st.maybe) d = Array.isArray(d) ? (d[0] ?? null) : d; if (st.single && d == null) return { data: null, error: { message: 'no rows' } }; return { data: d, error: null } } catch (e) { return { data: null, error: { message: e.message } } } }
    const b = {
      select() { st.selecting = true; return b }, eq(k, v) { st.filters.push([k, v]); return b },
      insert(p) { st.op = 'insert'; st.payload = p; return b }, update(p) { st.op = 'update'; st.payload = p; return b }, delete() { st.op = 'delete'; return b },
      single() { st.single = true; return b }, maybeSingle() { st.maybe = true; return b },
      then(res, rej) { return Promise.resolve(fin()).then(res, rej) },
    }
    return b
  }

  const rpcs = {
    crear_hogar: ({ p_nombre, p_nombre_miembro }) => {
      const h = { id: uid(), nombre: p_nombre, codigo_invitacion: Math.random().toString(16).slice(2, 10).toUpperCase(), moneda: 'COP', creado_por: me(), creado_en: now() }
      T.hogares.push(h); T.miembros.push({ hogar_id: h.id, user_id: me(), rol: 'dueño', nombre: p_nombre_miembro, unido_en: now() })
      const p = T.perfiles.find(x => x.user_id === me()); if (p) p.hogar_activo = h.id; else T.perfiles.push({ user_id: me(), nombre: p_nombre_miembro, hogar_activo: h.id })
      const seed = (t, rows) => rows.forEach(r => T[t].push({ id: uid(), hogar_id: h.id, creado_por: me(), creado_en: now(), ...r }))
      seed('entidades', [{ nombre: p_nombre_miembro, tipo: 'persona', orden: 0 }, { nombre: 'Familia', tipo: 'grupo', orden: 1 }])
      seed('categorias', [['Arriendo', 'Fijo'], ['Servicios públicos', 'Fijo'], ['Mercado', 'Variable'], ['Transporte', 'Variable'], ['Cuota crédito', 'Amortización crédito'], ['Pago tarjeta crédito', 'Amortización crédito'], ['Honorarios', 'Variable'], ['Otro', 'Variable']].map(([n, g], i) => ({ nombre: n, grupo: g, afecta_caja: true, orden: i })))
      seed('cuentas', [{ nombre: 'Efectivo', tipo: 'Efectivo' }])
      return h.id
    },
    unirse_hogar: ({ p_codigo, p_nombre_miembro }) => {
      const h = T.hogares.find(x => x.codigo_invitacion === p_codigo.toUpperCase().trim()); if (!h) throw new Error('Código de invitación inválido')
      if (!T.miembros.some(m => m.hogar_id === h.id && m.user_id === me())) T.miembros.push({ hogar_id: h.id, user_id: me(), rol: 'miembro', nombre: p_nombre_miembro, unido_en: now() })
      const p = T.perfiles.find(x => x.user_id === me()); if (p) p.hogar_activo = h.id; else T.perfiles.push({ user_id: me(), nombre: p_nombre_miembro, hogar_activo: h.id })
      if (!T.entidades.some(e => e.hogar_id === h.id && e.nombre === p_nombre_miembro)) T.entidades.push({ id: uid(), hogar_id: h.id, nombre: p_nombre_miembro, tipo: 'persona' })
      return h.id
    },
    regenerar_codigo: ({ p_hogar }) => { const m = T.miembros.find(x => x.hogar_id === p_hogar && x.user_id === me()); if (m?.rol !== 'dueño') throw new Error('Solo el dueño puede regenerar el código'); const h = T.hogares.find(x => x.id === p_hogar); h.codigo_invitacion = Math.random().toString(16).slice(2, 10).toUpperCase(); return h.codigo_invitacion },
    completar_programado: ({ p_id, p_fecha, p_monto, p_cuenta_id, p_desglose }) => {
      const r = T.programado.find(x => x.id === p_id && can(x)); if (!r) throw new Error('Programado no encontrado'); if (r.estado !== 'Pendiente') throw new Error('Ya completada')
      const m = { id: uid(), hogar_id: r.hogar_id, fecha: p_fecha, tipo: r.flujo === 'ingreso' ? 'Ingreso' : 'Salida', descripcion: r.nombre, monto: p_monto, entidad_id: r.entidad_id, categoria_id: r.categoria_id, cuenta_id: p_cuenta_id || r.cuenta_id, activo_id: r.activo_id, programado_id: r.id, deuda_id: r.deuda_id, desglose: p_desglose || {}, origen: 'programado', creado_por: me(), creado_en: now() }
      T.movimientos.push(m); Object.assign(r, { estado: 'Completado', completado_en: p_fecha, movimiento_id: m.id })
      if (r.periodicidad !== 'Puntual') { const sig = { Semanal: addDays(r.vencimiento, 7), Quincenal: addDays(r.vencimiento, 15), Mensual: addMonths(r.vencimiento, 1), Bimestral: addMonths(r.vencimiento, 2), Trimestral: addMonths(r.vencimiento, 3), Semestral: addMonths(r.vencimiento, 6), Anual: addMonths(r.vencimiento, 12) }[r.periodicidad]; const { id, estado, completado_en, movimiento_id, ...rest } = r; T.programado.push({ ...rest, id: uid(), vencimiento: sig, estado: 'Pendiente', completado_en: null, movimiento_id: null, creado_por: me(), creado_en: now() }) }
      return m.id
    },
    deshacer_programado: ({ p_id }) => { const r = T.programado.find(x => x.id === p_id); if (!r || r.estado !== 'Completado') throw new Error('No hay nada que deshacer'); T.programado = T.programado.filter(x => !(x.serie_id === r.serie_id && x.estado === 'Pendiente' && x.vencimiento > r.vencimiento)); T.movimientos = T.movimientos.filter(x => x.id !== r.movimiento_id); Object.assign(r, { estado: 'Pendiente', completado_en: null, movimiento_id: null }) },
  }

  const client = {
    _T: T, _login: (id = userId, mail = email) => { session = { user: { id, email: mail } }; listeners.forEach(f => f('SIGNED_IN', session)) }, _logout: () => { session = null; listeners.forEach(f => f('SIGNED_OUT', null)) },
    from: q,
    rpc: async (fn, args) => { try { return { data: rpcs[fn](args), error: null } } catch (e) { return { data: null, error: { message: e.message } } } },
    auth: { getSession: async () => ({ data: { session } }), onAuthStateChange: f => { listeners.push(f); return { data: { subscription: { unsubscribe() { } } } } }, signInWithOtp: async ({ email }) => { client._otp = email; return { error: null } }, signOut: async () => { client._logout(); return { error: null } } },
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async ruta => ({ data: { signedUrl: 'blob:' + ruta } }), remove: async () => ({ error: null }) }) },
    channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() { },
  }
  return client
}
