// Aviso de prueba bajo demanda: el usuario autenticado recibe en sus dispositivos lo que recibiría hoy
// (o un mensaje de prueba si no tiene vencimientos). Se llama desde Ajustes → Avisos → "Enviar prueba".
import { admin, vapid, hoyBogota, vencimientosPorUsuario, mensaje, enviarA } from './_push.mjs'

export default async (req) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); if (!token) return new Response('Sin sesión', { status: 401 })
  let sb; try { sb = admin(); vapid() } catch (e) { return new Response(e.message, { status: 500 }) }
  const { data: { user }, error } = await sb.auth.getUser(token); if (error || !user) return new Response('Sesión inválida', { status: 401 })
  const { data: subs } = await sb.from('push_suscripciones').select('user_id,endpoint,p256dh,auth').eq('user_id', user.id)
  if (!subs?.length) return new Response('Este dispositivo no tiene avisos activados.', { status: 400 })
  const hoy = hoyBogota(); const items = (await vencimientosPorUsuario(sb, hoy))[user.id] || []
  const payload = items.length ? mensaje(items, hoy) : { title: 'Akontapp · prueba', body: 'Los avisos funcionan. Hoy no tienes vencimientos pendientes.', tag: 'prueba', url: '/?ir=programado' }
  const r = await enviarA(sb, subs, payload)
  return new Response(r.ok ? `Enviado a ${r.ok} dispositivo${r.ok > 1 ? 's' : ''}.` : 'No se pudo entregar; vuelve a activar los avisos en este dispositivo.', { status: r.ok ? 200 : 400 })
}
