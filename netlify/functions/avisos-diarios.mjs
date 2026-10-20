// Tarea programada: todos los días a las 7:00 de Bogotá (12:00 UTC) avisa a cada usuario los
// vencimientos de hoy y los atrasados en sus espacios. Si no tiene nada, no se le envía nada.
import { admin, vapid, hoyBogota, vencimientosPorUsuario, mensaje, enviarA } from './_push.mjs'

export const config = { schedule: '0 12 * * *' }

export default async () => {
  const sb = admin(); vapid(); const hoy = hoyBogota()
  const porUsuario = await vencimientosPorUsuario(sb, hoy)
  const { data: subs, error } = await sb.from('push_suscripciones').select('user_id,endpoint,p256dh,auth'); if (error) throw new Error(error.message)
  let enviados = 0, usuarios = 0
  for (const [uid, items] of Object.entries(porUsuario)) {
    const mias = (subs || []).filter(s => s.user_id === uid); if (!mias.length) continue
    const r = await enviarA(sb, mias, mensaje(items, hoy)); enviados += r.ok; usuarios++
  }
  console.log(`avisos-diarios ${hoy}: ${usuarios} usuarios, ${enviados} avisos`)
  return new Response(JSON.stringify({ hoy, usuarios, enviados }), { headers: { 'content-type': 'application/json' } })
}
