import { crearMock } from './mockSupabase'
export const configurado = true
export const supabase = crearMock()
if (typeof window !== 'undefined') window.__sb = supabase
