// Tarea programada: todos los días a la 1:00 de Bogotá (06:00 UTC) recalcula el perfil de cada usuario que lo
// autorizó, evalúa señales y crea ofertas para quienes autorizaron la finalidad comercial; poda eventos > 90 días.
import { admin } from './_push.mjs'
import { calcularTodos } from './_perfil.mjs'

export const config = { schedule: '0 6 * * *' }

export default async () => {
  const r = await calcularTodos(admin())
  console.log('perfil-diario', JSON.stringify(r))
  return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json' } })
}
