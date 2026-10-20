// Eventos de uso (finalidad "analitica"). Solo pantalla y acción, nunca el contenido de formularios.
// Se envían por lotes; si el usuario no autorizó, no se registra nada.
import { supabase } from './supabase'

const ctx = { userId: null, espacioId: null, on: false }
const sesion = Math.random().toString(36).slice(2, 10)
let cola = []; let timer = null; let ultimaPantalla = null

export const configurarEventos = c => { Object.assign(ctx, c); if (!ctx.on) cola = [] }
export function track(tipo, pantalla, props = {}) {
  if (!ctx.on || !ctx.userId) return
  if (tipo === 'pantalla' && pantalla === ultimaPantalla) return
  if (tipo === 'pantalla') ultimaPantalla = pantalla
  cola.push({ user_id: ctx.userId, espacio_id: ctx.espacioId, sesion, tipo, pantalla, props })
  if (cola.length >= 20) flush(); else if (!timer) timer = setTimeout(flush, 8000)
}
export async function flush() {
  clearTimeout(timer); timer = null
  if (!cola.length) return
  const lote = cola; cola = []
  try { await supabase.from('eventos').insert(lote) } catch { /* los eventos no son críticos */ }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush() })
