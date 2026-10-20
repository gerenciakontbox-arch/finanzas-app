// Recalcula el perfil del usuario autenticado bajo demanda (botón "Calcular ahora" en Mi perfil).
import { admin } from './_push.mjs'
import { calcularPara } from './_perfil.mjs'

export default async (req) => {
  if (req.method !== 'POST') return new Response('Método no permitido', { status: 405 })
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); if (!token) return new Response('Sin sesión', { status: 401 })
  let sb; try { sb = admin() } catch (e) { return new Response(e.message, { status: 500 }) }
  const { data: { user }, error } = await sb.auth.getUser(token); if (error || !user) return new Response('Sesión inválida', { status: 401 })
  try { const r = await calcularPara(sb, user.id); return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } }) }
  catch (e) { return new Response(e.message, { status: 500 }) }
}
