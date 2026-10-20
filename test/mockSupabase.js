// Backend en memoria con la interfaz mínima de supabase-js que usa la app.
// Replica el esquema 0002 (espacios, RLS por espacio, cuentas habilitadas, espejos, RPC).
const uid = () => crypto.randomUUID()
const now = () => new Date().toISOString()
const addMonths = (d, n) => { const dt = new Date(d + 'T12:00:00'); dt.setMonth(dt.getMonth() + n); return dt.toISOString().slice(0, 10) }
const today = () => new Date().toISOString().slice(0, 10)
const addDays = (d, n) => { const dt = new Date(d + 'T12:00:00'); dt.setDate(dt.getDate() + n); return dt.toISOString().slice(0, 10) }
const CATS = [['Arriendo', 'Fijo'], ['Servicios públicos', 'Fijo'], ['Internet', 'Fijo'], ['Mercado', 'Variable'], ['Transporte', 'Variable'], ['Restaurantes', 'Variable'], ['Salud', 'Variable'], ['Cuota crédito', 'Amortización crédito'], ['Pago tarjeta crédito', 'Amortización crédito'], ['Honorarios', 'Variable'], ['Seguro', 'Provisión'], ['Otro', 'Variable']]
const CATS_EMP = [['Arriendo', 'Fijo'], ['Nómina', 'Fijo'], ['Honorarios', 'Variable'], ['Software y suscripciones', 'Fijo'], ['Impuestos', 'Provisión'], ['Cuota crédito', 'Amortización crédito'], ['Pago tarjeta crédito', 'Amortización crédito'], ['Ventas', 'Variable'], ['Otro', 'Variable']]

export function crearMock({ userId = 'u-andres', email = 'andres@test.co' } = {}) {
  const T = {}; const tablas = ['app_meta', 'espacios', 'espacio_miembros', 'perfiles', 'categorias', 'cuentas', 'cuentas_espacio', 'activos', 'presupuesto', 'deudas', 'tc_cargos', 'cuotas_pagadas', 'abonos_capital', 'programado', 'programado_adjuntos', 'movimientos', 'bitacora']
  tablas.forEach(t => T[t] = [])
  T.app_meta.push({ clave: 'schema_version', valor: '3' })
  let session = null; const listeners = []
  const me = () => session?.user?.id
  const misEspacios = (u = me()) => T.espacio_miembros.filter(m => m.user_id === u).map(m => m.espacio_id)
  const esp = id => T.espacios.find(e => e.id === id)
  const tipoEsp = id => esp(id)?.tipo
  const esAdmin = (e, u = me()) => T.espacio_miembros.some(m => m.espacio_id === e && m.user_id === u && m.rol === 'admin')
  const duenoCuenta = cid => T.cuentas.find(x => x.id === cid)?.dueno_id || null
  const setDueno = c => { const e = esp(c.espacio_id); c.dueno_id = e?.tipo === 'personal' ? e.dueno_id : null; return c }
  const personalDe = (u, nombre) => {
    let e = T.espacios.find(x => x.tipo === 'personal' && x.dueno_id === u)
    if (!e) {
      e = { id: uid(), tipo: 'personal', nombre: 'Personal', codigo_invitacion: null, moneda: 'COP', dueno_id: u, creado_por: u, creado_en: now() }; T.espacios.push(e)
      const n = nombre || T.perfiles.find(p => p.user_id === u)?.nombre || (u === me() ? session.user.email.split('@')[0] : u)
      T.espacio_miembros.push({ espacio_id: e.id, user_id: u, rol: 'admin', nombre: n, unido_en: now() })
      const p = T.perfiles.find(x => x.user_id === u); if (p) { p.espacio_personal = e.id; p.espacio_activo ||= e.id } else T.perfiles.push({ user_id: u, nombre: n, espacio_personal: e.id, espacio_activo: e.id })
      sembrar(e.id, 'personal'); T.cuentas.push(setDueno({ id: uid(), espacio_id: e.id, nombre: 'Efectivo', tipo: 'Efectivo', activo: true, creado_por: u, creado_en: now() }))
    }
    return e.id
  }
  const sembrar = (e, t) => (t === 'empresa' ? CATS_EMP : CATS).forEach(([n, g], i) => T.categorias.push({ id: uid(), espacio_id: e, nombre: n, grupo: g, afecta_caja: true, activo: true, activa: true, orden: i, creado_en: now() }))
  const catEquiv = (c, dest) => { if (!c) return null; const src = T.categorias.find(x => x.id === c); if (!src) return null; if (src.espacio_id === dest) return c; let d = T.categorias.find(x => x.espacio_id === dest && x.nombre.toLowerCase() === src.nombre.toLowerCase()); if (!d) { d = { id: uid(), espacio_id: dest, nombre: src.nombre, grupo: src.grupo, afecta_caja: true, activo: true, activa: true, orden: src.orden, creado_en: now() }; T.categorias.push(d) } return d.id }
  const catEnUso = c => T.movimientos.some(m => m.categoria_id === c) || T.presupuesto.some(p => p.categoria_id === c) || T.programado.some(p => p.categoria_id === c) || T.tc_cargos.some(p => p.categoria_id === c)

  // ── visibilidad (RLS) ──
  const visible = (t, r) => {
    const mine = misEspacios()
    if (t === 'app_meta') return true
    if (t === 'espacios') return mine.includes(r.id)
    if (t === 'perfiles') return r.user_id === me()
    if (t === 'espacio_miembros') return mine.includes(r.espacio_id)
    if (t === 'cuentas') return mine.includes(r.espacio_id) || T.cuentas_espacio.some(x => x.cuenta_id === r.id && mine.includes(x.espacio_id))
    if (t === 'cuentas_espacio') return mine.includes(r.espacio_id) || mine.includes(T.cuentas.find(c => c.id === r.cuenta_id)?.espacio_id)
    return mine.includes(r.espacio_id)
  }

  // ── espejos ──
  const sincronizarEspejos = m => {
    T.movimientos = T.movimientos.filter(x => x.espejo_de !== m.id)
    if (m.espejo_de) return
    const e = esp(m.espacio_id); if (!e || e.tipo === 'personal') return
    const mk = (pers, tipo, subtipo, desc, cuenta, d, extra = {}) => T.movimientos.push({ id: uid(), espacio_id: pers, fecha: m.fecha, tipo, subtipo, descripcion: desc, monto: m.monto, cuenta_id: cuenta, categoria_id: null, espacio_contraparte: m.espacio_id, espejo_de: m.id, origen: 'espejo', pagador_id: d, desglose: {}, creado_por: m.creado_por, creado_en: now(), ...extra })
    const d = duenoCuenta(m.cuenta_id)
    if (d) { const pers = personalDe(d); if (m.tipo === 'Salida' || (m.tipo === 'Transferencia' && m.subtipo === 'traslado')) mk(pers, 'Transferencia', 'aporte', `Aporte a ${e.nombre} · ${m.descripcion}`, m.cuenta_id, d); else if (m.tipo === 'Ingreso') mk(pers, 'Transferencia', 'recibido', `Recibido de ${e.nombre} · ${m.descripcion}`, m.cuenta_id, d) }
    const d2 = duenoCuenta(m.cuenta_destino_id)
    if (d2 && m.tipo === 'Salida') { const pers2 = personalDe(d2); const modo = m.modo_destino || (e.tipo === 'empresa' ? 'ingreso' : 'devolucion'); if (modo === 'ingreso') mk(pers2, 'Ingreso', null, `${e.nombre} · ${m.descripcion}`, m.cuenta_destino_id, d2, { categoria_id: catEquiv(m.categoria_id, pers2) }); else mk(pers2, 'Transferencia', 'devolucion', `Devolución de ${e.nombre} · ${m.descripcion}`, m.cuenta_destino_id, d2) }
  }
  const cascade = (t, r) => {
    if (t === 'cuentas') { T.tc_cargos.filter(c => c.cuenta_id === r.id).forEach(c => cascade('tc_cargos', c)); T.tc_cargos = T.tc_cargos.filter(c => c.cuenta_id !== r.id); T.cuentas_espacio = T.cuentas_espacio.filter(x => x.cuenta_id !== r.id) }
    if (t === 'tc_cargos') T.cuotas_pagadas = T.cuotas_pagadas.filter(c => c.cargo_id !== r.id)
    if (t === 'deudas') { T.cuotas_pagadas = T.cuotas_pagadas.filter(c => c.deuda_id !== r.id); T.abonos_capital = T.abonos_capital.filter(a => a.deuda_id !== r.id) }
    if (t === 'movimientos') { T.cuotas_pagadas.forEach(c => { if (c.movimiento_id === r.id) c.movimiento_id = null }); T.abonos_capital = T.abonos_capital.filter(a => a.movimiento_id !== r.id); T.movimientos = T.movimientos.filter(x => x.espejo_de !== r.id) }
    if (t === 'programado') T.programado_adjuntos = T.programado_adjuntos.filter(a => a.programado_id !== r.id)
    if (t === 'espacio_miembros') { }
  }

  const q = (t) => {
    const st = { filters: [], op: 'select', payload: null, single: false, maybe: false }
    const run = () => {
      let rows = T[t].filter(r => st.filters.every(([k, v]) => String(r[k]) === String(v))).filter(r => visible(t, r))
      if (st.op === 'insert') {
        const arr = Array.isArray(st.payload) ? st.payload : [st.payload]
        const DEF = { programado: () => ({ estado: 'Pendiente', serie_id: uid(), ficha_valores: {} }), movimientos: () => ({ origen: 'manual', desglose: {} }), cuentas: () => ({ activo: true }), categorias: () => ({ grupo: 'Variable', afecta_caja: true, activa: true }), presupuesto: () => ({ estado: 'Planificado' }), deudas: () => ({ estado: 'Activo', tasa_mensual: 0 }) }
        const out = arr.map(r => {
          const row = { id: uid(), creado_por: me(), creado_en: now(), actualizado_por: me(), actualizado_en: now(), ...(DEF[t] ? DEF[t]() : {}), ...r }
          if (t === 'movimientos') { if (row.espejo_de) throw new Error('new row violates row-level security policy for table "movimientos"'); row.pagador_id = duenoCuenta(row.cuenta_id) || row.pagador_id || null; if (row.tipo === 'Transferencia') { row.subtipo ||= 'traslado'; if (row.subtipo === 'traslado' && !row.cuenta_destino_id) throw new Error('Un traslado necesita cuenta destino') } }
          if (t === 'categorias' && tipoEsp(row.espacio_id) !== 'personal' && !esAdmin(row.espacio_id)) throw new Error('Solo un administrador del espacio puede modificar las categorías')
          if (t === 'cuentas' && T.cuentas.some(c => c.espacio_id === row.espacio_id && c.nombre === row.nombre)) throw new Error('duplicate key value violates unique constraint "cuentas_espacio_id_nombre_key"')
          if (!visible(t, row)) throw new Error('new row violates row-level security policy for table "' + t + '"'); if (t === 'cuentas') setDueno(row); T[t].push(row)
          if (t === 'movimientos') sincronizarEspejos(row)
          return row
        })
        return Array.isArray(st.payload) ? out : out[0]
      }
      if (st.op === 'update') {
        rows.forEach(r => {
          if (t === 'movimientos' && r.espejo_de) return
          if (t === 'categorias') { if (tipoEsp(r.espacio_id) !== 'personal' && !esAdmin(r.espacio_id)) throw new Error('Solo un administrador del espacio puede modificar las categorías'); if (st.payload.grupo && st.payload.grupo !== r.grupo && catEnUso(r.id)) throw new Error(`No se puede cambiar el grupo de "${r.nombre}" porque ya tiene registros`) }
          if (t === 'espacios' && (!esAdmin(r.id) || r.tipo === 'personal')) return
          if (t === 'espacio_miembros' && !esAdmin(r.espacio_id)) return
          if (t === 'presupuesto' && r.programado_id && ['monto', 'fecha_tentativa', 'estado', 'concepto', 'categoria_id', 'cuenta_id', 'activo_id', 'periodo'].some(k => k in st.payload && String(st.payload[k]) !== String(r[k]))) throw new Error('Este rubro está programado: se edita y se paga desde Programado. Desprográmalo para cambiarlo aquí.')
          Object.assign(r, st.payload, { actualizado_por: me(), actualizado_en: now() }); if (t === 'movimientos') sincronizarEspejos(r)
        }); return rows
      }
      if (st.op === 'delete') {
        rows = rows.filter(r => !(t === 'movimientos' && r.espejo_de)).filter(r => !(t === 'espacio_miembros' && !(esAdmin(r.espacio_id) && r.user_id !== me()) && !(r.user_id === me() && tipoEsp(r.espacio_id) !== 'personal' && r.rol !== 'admin')))
        rows.forEach(r => { if (t === 'presupuesto' && r.programado_id) throw new Error('Este rubro está programado. Desprográmalo antes de eliminarlo.'); if (t === 'programado') liberarPresupuesto(r); if (t === 'categorias') { if (tipoEsp(r.espacio_id) !== 'personal' && !esAdmin(r.espacio_id)) throw new Error('Solo un administrador del espacio puede modificar las categorías'); if (catEnUso(r.id)) throw new Error(`La categoría "${r.nombre}" ya tiene registros: desactívala en lugar de borrarla`) } cascade(t, r); T[t].splice(T[t].indexOf(r), 1) }); return rows
      }
      return rows
    }
    const fin = () => { try { let d = run(); if (st.single || st.maybe) d = Array.isArray(d) ? (d[0] ?? null) : d; if (st.single && d == null) return { data: null, error: { message: 'no rows' } }; return { data: d, error: null } } catch (e) { return { data: null, error: { message: e.message } } } }
    const b = {
      select() { return b }, eq(k, v) { st.filters.push([k, v]); return b },
      insert(p) { st.op = 'insert'; st.payload = p; return b }, update(p) { st.op = 'update'; st.payload = p; return b }, delete() { st.op = 'delete'; return b },
      single() { st.single = true; return b }, maybeSingle() { st.maybe = true; return b },
      then(res, rej) { return Promise.resolve(fin()).then(res, rej) },
    }
    return b
  }

  const SIG = { Semanal: d => addDays(d, 7), Quincenal: d => addDays(d, 15), Mensual: d => addMonths(d, 1), Bimestral: d => addMonths(d, 2), Trimestral: d => addMonths(d, 3), Semestral: d => addMonths(d, 6), Anual: d => addMonths(d, 12) }
  const siguienteOcurrencia = r => { if (r.periodicidad === 'Puntual' || !SIG[r.periodicidad]) return null; const { id, estado, completado_en, movimiento_id, presupuesto_id, creado_en, ...rest } = r; const n = { ...rest, id: uid(), vencimiento: SIG[r.periodicidad](r.vencimiento), estado: 'Pendiente', presupuesto_id: null, creado_por: me(), creado_en: now() }; T.programado.push(n); return n }
  const vincularOcurrencia = (o, modeloId) => {
    const base = T.presupuesto.find(p => p.id === modeloId); const mes = o.vencimiento.slice(0, 7) + '-01'
    let r = T.presupuesto.find(p => p.espacio_id === o.espacio_id && p.periodo === mes && ['Planificado', 'Programado'].includes(p.estado) && !p.programado_id && p.programado_serie_id === o.serie_id)
      || T.presupuesto.find(p => p.espacio_id === o.espacio_id && p.periodo === mes && ['Planificado', 'Programado'].includes(p.estado) && !p.programado_id && !p.programado_serie_id && (p.concepto || '').trim().toLowerCase() === (base?.concepto || o.nombre).trim().toLowerCase())
    if (!r) { r = { id: uid(), espacio_id: o.espacio_id, periodo: mes, concepto: base?.concepto || o.nombre, pagador_id: base?.pagador_id ?? o.pagador_id ?? null, categoria_id: o.categoria_id, activo_id: o.activo_id, cuenta_id: o.cuenta_id, monto: o.monto, fecha_tentativa: o.vencimiento, estado: 'Programado', notas: base?.notas || null, periodicidad: o.periodicidad, programado_serie_id: o.serie_id, programado_id: o.id, auto_creado: true, creado_por: o.creado_por, creado_en: now() }; T.presupuesto.push(r) }
    else Object.assign(r, { estado: 'Programado', programado_serie_id: o.serie_id, programado_id: o.id, periodicidad: o.periodicidad, fecha_tentativa: r.fecha_tentativa || o.vencimiento })
    o.presupuesto_id = r.id
  }
  const liberarPresupuesto = o => { if (!o.presupuesto_id) return; const pr = T.presupuesto.find(p => p.id === o.presupuesto_id && p.programado_id === o.id); if (pr) Object.assign(pr, { estado: 'Planificado', programado_id: null }) }

  const rpcs = {
    asegurar_personal: ({ p_nombre } = {}) => personalDe(me(), p_nombre),
    crear_espacio: ({ p_tipo, p_nombre, p_nombre_miembro }) => {
      personalDe(me(), p_nombre_miembro)
      const e = { id: uid(), tipo: p_tipo, nombre: p_nombre, codigo_invitacion: Math.random().toString(16).slice(2, 10).toUpperCase(), moneda: 'COP', dueno_id: null, creado_por: me(), creado_en: now() }
      T.espacios.push(e); T.espacio_miembros.push({ espacio_id: e.id, user_id: me(), rol: 'admin', nombre: p_nombre_miembro, unido_en: now() })
      const p = T.perfiles.find(x => x.user_id === me()); p.espacio_activo = e.id
      sembrar(e.id, p_tipo); if (p_tipo === 'empresa') T.cuentas.push({ id: uid(), espacio_id: e.id, nombre: 'Caja ' + p_nombre, tipo: 'Efectivo', activo: true, creado_en: now() })
      return e.id
    },
    unirse_espacio: ({ p_codigo, p_nombre_miembro }) => {
      personalDe(me(), p_nombre_miembro)
      const e = T.espacios.find(x => x.codigo_invitacion === p_codigo.toUpperCase().trim() && x.tipo !== 'personal'); if (!e) throw new Error('Código de invitación inválido')
      if (!T.espacio_miembros.some(m => m.espacio_id === e.id && m.user_id === me())) T.espacio_miembros.push({ espacio_id: e.id, user_id: me(), rol: 'miembro', nombre: p_nombre_miembro, unido_en: now() })
      T.perfiles.find(x => x.user_id === me()).espacio_activo = e.id
      return e.id
    },
    cambiar_mi_nombre: ({ p_nombre }) => { if (!p_nombre?.trim()) throw new Error('El nombre no puede estar vacío'); const p = T.perfiles.find(x => x.user_id === me()); if (p) p.nombre = p_nombre.trim(); T.espacio_miembros.filter(m => m.user_id === me()).forEach(m => m.nombre = p_nombre.trim()) },
    regenerar_codigo: ({ p_espacio }) => { if (!esAdmin(p_espacio)) throw new Error('Solo un administrador puede regenerar el código'); const e = esp(p_espacio); e.codigo_invitacion = Math.random().toString(16).slice(2, 10).toUpperCase(); return e.codigo_invitacion },
    habilitar_cuenta: ({ p_cuenta, p_espacio, p_on }) => { if (duenoCuenta(p_cuenta) !== me()) throw new Error('Solo el dueño de la cuenta puede habilitarla'); if (!misEspacios().includes(p_espacio)) throw new Error('No eres miembro de ese espacio'); if (p_on) { if (!T.cuentas_espacio.some(x => x.cuenta_id === p_cuenta && x.espacio_id === p_espacio)) T.cuentas_espacio.push({ cuenta_id: p_cuenta, espacio_id: p_espacio, creado_por: me(), creado_en: now() }) } else T.cuentas_espacio = T.cuentas_espacio.filter(x => !(x.cuenta_id === p_cuenta && x.espacio_id === p_espacio)) },
    mover_item: ({ p_tabla, p_id, p_destino }) => {
      if (!misEspacios().includes(p_destino)) throw new Error('No eres miembro del espacio destino')
      const mv = (t, id) => { const r = T[t].find(x => x.id === id); if (!r || !misEspacios().includes(r.espacio_id)) throw new Error(t + ' no encontrado'); r.espacio_id = p_destino; if ('categoria_id' in r && t !== 'activos' && t !== 'deudas') r.categoria_id = catEquiv(r.categoria_id, p_destino); return r }
      if (p_tabla === 'activos') { mv('activos', p_id); T.deudas.filter(d => d.activo_id === p_id && d.estado === 'Activo').forEach(d => rpcs.mover_item({ p_tabla: 'deudas', p_id: d.id, p_destino })); T.programado.filter(p => p.activo_id === p_id && p.estado === 'Pendiente').forEach(p => rpcs.mover_item({ p_tabla: 'programado', p_id: p.id, p_destino })); T.tc_cargos.filter(c => c.activo_id === p_id && T.cuotas_pagadas.filter(x => x.cargo_id === c.id).length < c.cuotas).forEach(c => rpcs.mover_item({ p_tabla: 'tc_cargos', p_id: c.id, p_destino })) }
      else if (p_tabla === 'deudas') { mv('deudas', p_id); T.cuotas_pagadas.filter(c => c.deuda_id === p_id).forEach(c => c.espacio_id = p_destino); T.abonos_capital.filter(c => c.deuda_id === p_id).forEach(c => c.espacio_id = p_destino); T.programado.filter(p => p.deuda_id === p_id && p.estado === 'Pendiente').forEach(p => rpcs.mover_item({ p_tabla: 'programado', p_id: p.id, p_destino })) }
      else if (p_tabla === 'programado') { mv('programado', p_id); T.programado_adjuntos.filter(a => a.programado_id === p_id).forEach(a => a.espacio_id = p_destino) }
      else if (p_tabla === 'tc_cargos') { mv('tc_cargos', p_id); T.cuotas_pagadas.filter(c => c.cargo_id === p_id).forEach(c => c.espacio_id = p_destino) }
      else if (p_tabla === 'presupuesto') mv('presupuesto', p_id)
      else throw new Error('Tabla no soportada: ' + p_tabla)
    },
    completar_programado: ({ p_id, p_fecha, p_monto, p_cuenta_id, p_desglose, p_motivo }) => {
      const r = T.programado.find(x => x.id === p_id && misEspacios().includes(x.espacio_id)); if (!r) throw new Error('Programado no encontrado'); if (r.estado !== 'Pendiente') throw new Error('Esta ocurrencia ya fue completada')
      const m = { id: uid(), espacio_id: r.espacio_id, fecha: p_fecha, tipo: r.flujo === 'ingreso' ? 'Ingreso' : 'Salida', descripcion: r.nombre, monto: p_monto, categoria_id: r.categoria_id, cuenta_id: p_cuenta_id || r.cuenta_id, cuenta_destino_id: r.cuenta_destino_id || null, modo_destino: r.modo_destino || null, activo_id: r.activo_id, programado_id: r.id, deuda_id: r.deuda_id, presupuesto_id: r.presupuesto_id || null, desglose: p_desglose || {}, origen: 'programado', motivo: p_motivo || null, creado_por: me(), creado_en: now() }
      m.pagador_id = duenoCuenta(m.cuenta_id); T.movimientos.push(m); sincronizarEspejos(m); Object.assign(r, { estado: 'Completado', completado_en: p_fecha, movimiento_id: m.id })
      if (r.presupuesto_id) { const pr = T.presupuesto.find(x => x.id === r.presupuesto_id); if (pr) Object.assign(pr, { estado: 'Pagado', fecha_efectiva: p_fecha, programado_id: null }) }
      const nuevo = siguienteOcurrencia(r); if (nuevo && r.presupuesto_id) vincularOcurrencia(nuevo, r.presupuesto_id)
      return m.id
    },
    omitir_programado: ({ p_id }) => {
      const r = T.programado.find(x => x.id === p_id && misEspacios().includes(x.espacio_id)); if (!r) throw new Error('Programado no encontrado'); if (r.estado !== 'Pendiente') throw new Error('Esta ocurrencia ya fue cerrada')
      Object.assign(r, { estado: 'Omitido', completado_en: today() }); liberarPresupuesto(r)
      const nuevo = siguienteOcurrencia(r); if (nuevo && r.presupuesto_id) vincularOcurrencia(nuevo, r.presupuesto_id)
      return nuevo?.id || null
    },
    programar_presupuesto: ({ p_id, p_periodicidad = 'Mensual', p_vencimiento = null }) => {
      const r = T.presupuesto.find(x => x.id === p_id && misEspacios().includes(x.espacio_id)); if (!r) throw new Error('Rubro no encontrado')
      if (r.programado_id) throw new Error('Este rubro ya está programado'); if (['Pagado', 'Cancelado'].includes(r.estado)) throw new Error(`Un rubro ${r.estado.toLowerCase()} no se puede programar`)
      const cat = T.categorias.find(c => c.id === r.categoria_id); const nm = (cat?.nombre || '').toLowerCase()
      const tipo = nm === 'cuota crédito' ? 'Cuota crédito' : /seguro/.test(nm) ? 'Seguro' : /arriendo/.test(nm) ? 'Arriendo' : /impuesto|predial/.test(nm) ? 'Impuesto' : /servicio/.test(nm) ? 'Servicio' : /suscripci/.test(nm) ? 'Suscripción' : 'Otro'
      const o = { id: uid(), espacio_id: r.espacio_id, serie_id: uid(), flujo: 'salida', tipo, nombre: r.concepto, categoria_id: r.categoria_id, activo_id: r.activo_id, cuenta_id: r.cuenta_id, pagador_id: r.pagador_id, monto: r.monto, periodicidad: p_periodicidad, vencimiento: p_vencimiento || r.fecha_tentativa || r.periodo, estado: 'Pendiente', notas: r.notas, presupuesto_id: r.id, ficha_valores: {}, creado_por: me(), creado_en: now() }
      T.programado.push(o); Object.assign(r, { estado: 'Programado', programado_id: o.id, programado_serie_id: o.serie_id, periodicidad: p_periodicidad })
      return o.id
    },
    desprogramar_presupuesto: ({ p_id }) => {
      const r = T.presupuesto.find(x => x.id === p_id && misEspacios().includes(x.espacio_id)); if (!r) throw new Error('Rubro no encontrado'); if (!r.programado_id) throw new Error('Este rubro no está programado')
      T.programado = T.programado.filter(x => !(x.id === r.programado_id && x.estado === 'Pendiente')); Object.assign(r, { estado: 'Planificado', programado_id: null, programado_serie_id: null, periodicidad: null })
    },
    deshacer_programado: ({ p_id }) => { const r = T.programado.find(x => x.id === p_id); if (!r || r.estado !== 'Completado') throw new Error('No hay nada que deshacer'); for (const sx of T.programado.filter(x => x.serie_id === r.serie_id && x.estado === 'Pendiente' && x.vencimiento > r.vencimiento)) { if (sx.presupuesto_id) { const pr = T.presupuesto.find(p => p.id === sx.presupuesto_id); if (pr && pr.auto_creado && !T.movimientos.some(m => m.presupuesto_id === pr.id)) T.presupuesto = T.presupuesto.filter(p => p.id !== pr.id); else if (pr) Object.assign(pr, { estado: 'Planificado', programado_id: null }) } } T.programado = T.programado.filter(x => !(x.serie_id === r.serie_id && x.estado === 'Pendiente' && x.vencimiento > r.vencimiento)); if (r.presupuesto_id) { const pr = T.presupuesto.find(p => p.id === r.presupuesto_id); if (pr) Object.assign(pr, { estado: 'Programado', fecha_efectiva: null, programado_id: r.id }) } const m = T.movimientos.find(x => x.id === r.movimiento_id); if (m) { cascade('movimientos', m); T.movimientos = T.movimientos.filter(x => x.id !== m.id) } Object.assign(r, { estado: 'Pendiente', completado_en: null, movimiento_id: null }) },
    pagar_factura_tc: ({ p_tc, p_fecha, p_cuenta_pago, p_items, p_extras = {}, p_presupuesto_id = null }) => {
      const tc = T.cuentas.find(c => c.id === p_tc); if (!tc) throw new Error('Tarjeta no encontrada'); if (!misEspacios().includes(tc.espacio_id)) throw new Error('Solo el dueño de la tarjeta paga su factura')
      const pers = tc.espacio_id; const extras = ['cuota_manejo', 'mora', 'seguros', 'otros'].reduce((a, k) => a + (+p_extras[k] || 0), 0)
      const espacios = [...new Set(p_items.map(i => T.tc_cargos.find(c => c.id === i.cargo_id)?.espacio_id).filter(Boolean))]; if (!espacios.includes(pers) && extras > 0) espacios.push(pers)
      const out = []
      for (const e of espacios) {
        const items = p_items.filter(i => T.tc_cargos.find(c => c.id === i.cargo_id)?.espacio_id === e); let total = items.reduce((a, i) => a + +i.pagado, 0); if (e === pers) total += extras; if (total <= 0) continue
        const cat = T.categorias.find(c => c.espacio_id === e && c.nombre === 'Pago tarjeta crédito')?.id || null
        const m = { id: uid(), espacio_id: e, fecha: p_fecha, tipo: 'Salida', descripcion: `Pago factura ${tc.nombre} · ` + items.map(i => `${T.tc_cargos.find(c => c.id === i.cargo_id).descripcion} ${i.n}/${T.tc_cargos.find(c => c.id === i.cargo_id).cuotas}`).join(', '), monto: total, categoria_id: cat, cuenta_id: p_cuenta_pago, tc_cuenta_id: p_tc, presupuesto_id: e === pers ? p_presupuesto_id : null, origen: 'tarjeta', desglose: { items, extras: e === pers ? p_extras : {}, capital: items.reduce((a, i) => a + +i.capital, 0), interes: items.reduce((a, i) => a + +i.interes, 0), esperado: items.reduce((a, i) => a + +i.esperado, 0), diferencia: items.reduce((a, i) => a + (+i.pagado - +i.esperado), 0) }, creado_por: me(), creado_en: now() }
        m.pagador_id = duenoCuenta(m.cuenta_id); T.movimientos.push(m); sincronizarEspejos(m)
        items.forEach(i => T.cuotas_pagadas.push({ id: uid(), espacio_id: e, cargo_id: i.cargo_id, numero: i.n, fecha_pago: p_fecha, monto_esperado: i.esperado, monto_pagado: i.pagado, movimiento_id: m.id, creado_por: me(), creado_en: now() }))
        out.push({ espacio_id: e, movimiento_id: m.id, monto: total })
      }
      return out
    },
    pagar_cuota_credito: ({ p_deuda, p_numero, p_fecha, p_cuenta, p_capital, p_interes, p_extras = {}, p_motivo = null, p_seguro = 0 }) => {
      const d = T.deudas.find(x => x.id === p_deuda && misEspacios().includes(x.espacio_id)); if (!d) throw new Error('Crédito no encontrado')
      if (T.cuotas_pagadas.some(c => c.deuda_id === d.id && c.numero === p_numero)) throw new Error(`La cuota ${p_numero} ya está pagada`)
      const extras = ['cuota_manejo', 'mora', 'seguros', 'otros'].reduce((a, k) => a + (+p_extras[k] || 0), 0); const total = p_capital + p_interes + (+p_seguro || 0) + extras
      const cat = T.categorias.find(c => c.espacio_id === d.espacio_id && c.nombre === 'Cuota crédito')?.id || null
      const m = { id: uid(), espacio_id: d.espacio_id, fecha: p_fecha, tipo: 'Salida', descripcion: `${d.nombre} — cuota ${p_numero}`, monto: total, categoria_id: cat, cuenta_id: p_cuenta || d.cuenta_pago_id, activo_id: d.activo_id, deuda_id: d.id, origen: 'credito', motivo: p_motivo, desglose: { cuota: p_numero, capital: p_capital, interes: p_interes, seguro: +p_seguro || 0, esperado: p_capital + p_interes + (+p_seguro || 0), diferencia: extras, ...p_extras }, creado_por: me(), creado_en: now() }
      m.pagador_id = duenoCuenta(m.cuenta_id); T.movimientos.push(m); sincronizarEspejos(m)
      T.cuotas_pagadas.push({ id: uid(), espacio_id: d.espacio_id, deuda_id: d.id, numero: p_numero, fecha_pago: p_fecha, monto_esperado: p_capital + p_interes + (+p_seguro || 0), monto_pagado: total, capital: p_capital, interes: p_interes, seguro: +p_seguro || 0, movimiento_id: m.id, creado_por: me(), creado_en: now() })
      return m.id
    },
    abonar_capital: ({ p_deuda, p_fecha, p_monto, p_cuenta, p_modo, p_motivo = null }) => {
      const d = T.deudas.find(x => x.id === p_deuda && misEspacios().includes(x.espacio_id)); if (!d) throw new Error('Crédito no encontrado')
      if (d.estado !== 'Activo') throw new Error('El crédito no está activo'); if (!(p_monto > 0)) throw new Error('El abono debe ser mayor que cero'); if (!['plazo', 'cuota'].includes(p_modo)) throw new Error('Modo inválido: ' + p_modo)
      const n = T.cuotas_pagadas.filter(c => c.deuda_id === d.id).length
      const cat = T.categorias.find(c => c.espacio_id === d.espacio_id && c.nombre === 'Cuota crédito')?.id || null
      const m = { id: uid(), espacio_id: d.espacio_id, fecha: p_fecha, tipo: 'Salida', descripcion: `${d.nombre} — abono a capital`, monto: p_monto, categoria_id: cat, cuenta_id: p_cuenta || d.cuenta_pago_id, activo_id: d.activo_id, deuda_id: d.id, origen: 'credito', motivo: p_motivo, desglose: { abono: true, capital: p_monto, interes: 0, modo: p_modo }, creado_por: me(), creado_en: now() }
      m.pagador_id = duenoCuenta(m.cuenta_id); T.movimientos.push(m); sincronizarEspejos(m)
      T.abonos_capital.push({ id: uid(), espacio_id: d.espacio_id, deuda_id: d.id, fecha: p_fecha, monto: p_monto, modo: p_modo, despues_de_cuota: n, movimiento_id: m.id, motivo: p_motivo, creado_por: me(), creado_en: now() })
      return m.id
    },
  }

  const client = {
    _T: T, _login: (id = userId, mail = email) => { session = { user: { id, email: mail } }; listeners.forEach(f => f('SIGNED_IN', session)) }, _logout: () => { session = null; listeners.forEach(f => f('SIGNED_OUT', null)) },
    _uidFor: mail => 'u-' + mail.split('@')[0],
    from: q,
    rpc: async (fn, args) => { try { if (!rpcs[fn]) throw new Error('RPC no existe: ' + fn); return { data: rpcs[fn](args || {}), error: null } } catch (e) { return { data: null, error: { message: e.message } } } },
    auth: { getSession: async () => ({ data: { session } }), onAuthStateChange: f => { listeners.push(f); return { data: { subscription: { unsubscribe() { } } } } }, signInWithOtp: async ({ email }) => { client._otp = email; return { error: null } }, verifyOtp: async ({ email, token }) => { if (email !== client._otp || token !== '123456') return { data: null, error: { message: 'Token has expired or is invalid' } }; client._login(client._uidFor(email), email); return { data: { session }, error: null } }, signOut: async () => { client._logout(); return { error: null } } },
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async ruta => ({ data: { signedUrl: 'blob:' + ruta } }), remove: async () => ({ error: null }) }) },
    channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() { },
  }
  return client
}
