// Avisos push (Web Push). En iPhone solo funciona con la app instalada en la pantalla de inicio (iOS 16.4+).
import { supabase } from './supabase'

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
const b64 = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = (s + p).replace(/-/g, '+').replace(/_/g, '/'); const raw = atob(r); return Uint8Array.from([...raw].map(c => c.charCodeAt(0))) }

export const esIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const esStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
export const soportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!VAPID
export const configurado = () => !!VAPID
export const permiso = () => ('Notification' in window ? Notification.permission : 'unsupported')

export async function registrarSW() { if (!('serviceWorker' in navigator)) return null; try { return await navigator.serviceWorker.register('/sw.js') } catch { return null } }

export async function suscripcionActual() {
  if (!('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.getRegistration('/'); if (!reg) return null
  return reg.pushManager.getSubscription()
}

// Pide permiso (debe llamarse desde un toque del usuario), se suscribe y guarda la suscripción en Supabase.
export async function activar(userId) {
  if (!soportado()) throw new Error('Este navegador no soporta avisos push.')
  const reg = (await navigator.serviceWorker.getRegistration('/')) || (await registrarSW())
  if (!reg) throw new Error('No se pudo registrar el service worker.')
  await navigator.serviceWorker.ready
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('No diste permiso para notificaciones. Puedes cambiarlo en los ajustes del sistema.')
  let sub = await reg.pushManager.getSubscription()
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) })
  const j = sub.toJSON()
  const { error } = await supabase.from('push_suscripciones').upsert({ user_id: userId, endpoint: sub.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' })
  if (error) throw error
  return sub
}

export async function desactivar() {
  const sub = await suscripcionActual(); if (!sub) return
  await supabase.from('push_suscripciones').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// Pide al servidor un aviso de prueba para este usuario (valida que todo el camino funcione).
export async function enviarPrueba() {
  const { data: { session } } = await supabase.auth.getSession()
  const r = await fetch('/.netlify/functions/aviso-prueba', { method: 'POST', headers: { Authorization: 'Bearer ' + session.access_token } })
  const t = await r.text(); if (!r.ok) throw new Error(t || ('Error ' + r.status))
  return t
}
