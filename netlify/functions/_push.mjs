// Utilidades compartidas por las funciones de avisos. Corren en el servidor de Netlify: aquí sí se usa la
// service_role key de Supabase (nunca llega al navegador). Variables necesarias en Netlify:
//   SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY (o VITE_VAPID_PUBLIC_KEY),
//   VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:tu-correo) — opcional.
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

export const env = k => process.env[k] || ''
export function admin() {
  const url = env('SUPABASE_URL') || env('VITE_SUPABASE_URL'); const key = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Netlify')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
export function vapid() {
  const pub = env('VAPID_PUBLIC_KEY') || env('VITE_VAPID_PUBLIC_KEY'); const priv = env('VAPID_PRIVATE_KEY')
  if (!pub || !priv) throw new Error('Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en Netlify')
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:soporte@akontapp.app', pub, priv)
}
export const fmtCOP = v => '$ ' + Math.round(Number(v) || 0).toLocaleString('es-CO')
export const hoyBogota = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

// Envía un payload a todas las suscripciones de un usuario; borra las que ya no existen (404/410).
export async function enviarA(sb, subs, payload) {
  let ok = 0, muertas = 0
  for (const s of subs) {
    try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 }); ok++ }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) { muertas++; await sb.from('push_suscripciones').delete().eq('endpoint', s.endpoint) } else console.error('push error', e.statusCode, e.body || e.message) }
  }
  return { ok, muertas }
}

// Vencimientos pendientes (hoy y atrasados) agrupados por usuario, según los espacios de cada uno.
export async function vencimientosPorUsuario(sb, hoy) {
  const [{ data: prog, error: e1 }, { data: miembros, error: e2 }, { data: espacios, error: e3 }] = await Promise.all([
    sb.from('programado').select('id,nombre,monto,vencimiento,flujo,espacio_id').eq('estado', 'Pendiente').lte('vencimiento', hoy),
    sb.from('espacio_miembros').select('espacio_id,user_id'),
    sb.from('espacios').select('id,nombre,tipo'),
  ])
  if (e1 || e2 || e3) throw new Error((e1 || e2 || e3).message)
  const esp = Object.fromEntries((espacios || []).map(e => [e.id, e]))
  const porUsuario = {}
  for (const m of miembros || []) {
    const items = (prog || []).filter(p => p.espacio_id === m.espacio_id)
    if (items.length) (porUsuario[m.user_id] ||= []).push(...items.map(p => ({ ...p, espacio: esp[p.espacio_id] })))
  }
  return porUsuario
}

export function mensaje(items, hoy) {
  const deHoy = items.filter(p => p.vencimiento === hoy), atras = items.filter(p => p.vencimiento < hoy)
  const linea = p => `${p.flujo === 'ingreso' ? 'Cobrar' : 'Pagar'} ${p.nombre} · ${fmtCOP(p.monto)}${p.espacio && p.espacio.tipo !== 'personal' ? ` · ${p.espacio.nombre}` : ''}`
  const lineas = [...deHoy.slice(0, 4).map(linea)]
  if (deHoy.length > 4) lineas.push(`y ${deHoy.length - 4} más hoy`)
  if (atras.length) lineas.push(`${atras.length} vencido${atras.length > 1 ? 's' : ''} sin pagar: ${atras.slice(0, 2).map(p => p.nombre).join(', ')}${atras.length > 2 ? '…' : ''}`)
  const title = deHoy.length ? `Hoy: ${deHoy.length} vencimiento${deHoy.length > 1 ? 's' : ''}` : `Tienes ${atras.length} vencimiento${atras.length > 1 ? 's' : ''} atrasado${atras.length > 1 ? 's' : ''}`
  return { title, body: lineas.join('\n'), tag: 'vencimientos-' + hoy, url: '/?ir=programado' }
}
