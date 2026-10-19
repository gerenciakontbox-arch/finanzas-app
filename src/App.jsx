import { useState } from 'react'
import { configurado } from './lib/supabase'
import { AuthProvider, useAuth, SCHEMA_VERSION } from './lib/auth'
import { DataProvider, useData } from './lib/data'
import { Icon } from './lib/ui'
import { Login, SinConfigurar, FaltaMigracion, PrimerNombre } from './modules/Acceso'
import Dashboard from './modules/Dashboard'
import Presupuesto from './modules/Presupuesto'
import Movimientos from './modules/Movimientos'
import Deudas from './modules/Deudas'
import Activos from './modules/Activos'
import Programado from './modules/Programado'
import Config from './modules/Config'

const TABS = [['dashboard', 'home', 'Inicio'], ['presupuesto', 'list', 'Presup.'], ['movimientos', 'arrows', 'Movim.'], ['deudas', 'card', 'Deudas'], ['activos', 'landmark', 'Activos'], ['programado', 'calendar', 'Progr.'], ['config', 'sliders', 'Config']]
export const TIPO_ICON = { personal: 'user', hogar: 'home', empresa: 'landmark' }
export const TIPO_LABEL = { personal: 'Personal', hogar: 'Hogar', empresa: 'Empresa' }

function Cargando({ texto = 'Cargando…' }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12, background: '#f8f7ff' }}><Icon name="wallet" size={48} sw={1.4} style={{ color: '#7c3aed' }} /><div style={{ color: '#6b7280', fontWeight: 600 }}>{texto}</div></div>
}

function SelectorEspacio() {
  const { espacios, espacio, cambiarEspacio } = useAuth()
  const [open, setOpen] = useState(false)
  const orden = { personal: 0, hogar: 1, empresa: 2 }
  const lista = [...espacios].sort((a, b) => orden[a.tipo] - orden[b.tipo] || a.nombre.localeCompare(b.nombre))
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-label="Cambiar de espacio" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', borderRadius: 20, padding: '5px 10px 5px 8px', cursor: 'pointer', fontSize: 12, fontWeight: 700, maxWidth: 190 }}>
        <Icon name={TIPO_ICON[espacio.tipo]} size={13} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{espacio.tipo === 'personal' ? 'Personal' : espacio.nombre}</span><Icon name={open ? 'chevron-up' : 'chevron-down'} size={13} />
      </button>
      {open && <>
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
        <div data-menu="espacios" style={{ position: 'absolute', right: 0, top: 36, background: '#fff', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', padding: 6, minWidth: 220, zIndex: 151 }}>
          {lista.map(e => <button key={e.id} onClick={() => { setOpen(false); if (e.id !== espacio.id) cambiarEspacio(e.id) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', border: 'none', borderRadius: 10, background: e.id === espacio.id ? '#f5f3ff' : 'transparent', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: e.tipo === 'personal' ? '#7c3aed' : e.tipo === 'hogar' ? '#059669' : '#0891b2' }}><Icon name={TIPO_ICON[e.tipo]} size={15} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.tipo === 'personal' ? 'Personal' : e.nombre}</div><div style={{ fontSize: 10, color: '#6b7280' }}>{TIPO_LABEL[e.tipo]}</div></div>
            {e.id === espacio.id && <Icon name="check" size={14} style={{ color: '#7c3aed' }} />}
          </button>)}
        </div>
      </>}
    </div>
  )
}

function Shell() {
  const { session, listo, schemaOk, espacio, miembroActual, user } = useAuth()
  const { db, error } = useData()
  const [tab, setTab] = useState('dashboard')
  if (session === undefined) return <Cargando />
  if (!session) return <Login />
  if (!listo) return <Cargando texto="Preparando tu espacio…" />
  if (schemaOk === false) return <FaltaMigracion version={SCHEMA_VERSION} />
  if (error) return <Cargando texto={'Error cargando datos: ' + error} />
  if (!espacio || !db) return <Cargando texto="Cargando…" />
  const autoNombre = miembroActual && user?.email && miembroActual.nombre === user.email.split('@')[0]
  const props = { goTo: setTab }
  const grad = espacio.tipo === 'personal' ? 'linear-gradient(135deg,#7c3aed,#4338ca)' : espacio.tipo === 'hogar' ? 'linear-gradient(135deg,#059669,#0f766e)' : 'linear-gradient(135deg,#0891b2,#1e40af)'
  return (
    <div style={{ minHeight: '100vh', background: '#f8f7ff', paddingBottom: 72 }}>
      <div className="safe-top" style={{ background: grad, color: '#fff', paddingLeft: 18, paddingRight: 18, paddingBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="wallet" size={18} />Akontapp</div>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>{miembroActual?.nombre || '—'} · {new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}</div>
          </div>
          <SelectorEspacio />
        </div>
      </div>
      {autoNombre && <PrimerNombre />}
      <div style={{ padding: '16px 14px 8px' }}>
        {tab === 'dashboard' && <Dashboard {...props} />}
        {tab === 'presupuesto' && <Presupuesto {...props} />}
        {tab === 'movimientos' && <Movimientos {...props} />}
        {tab === 'deudas' && <Deudas {...props} />}
        {tab === 'activos' && <Activos {...props} />}
        {tab === 'programado' && <Programado {...props} />}
        {tab === 'config' && <Config {...props} />}
      </div>
      <div className="safe-bot" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #e5e7eb', display: 'flex', zIndex: 100 }}>
        {TABS.map(([k, icon, label]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 0 6px', border: 'none', background: 'transparent', cursor: 'pointer', borderTop: `2px solid ${tab === k ? '#7c3aed' : 'transparent'}` }}>
            <Icon name={icon} size={22} sw={tab === k ? 2 : 1.6} style={{ color: tab === k ? '#7c3aed' : '#9ca3af' }} />
            <span style={{ fontSize: 9, fontWeight: tab === k ? 700 : 500, color: tab === k ? '#7c3aed' : '#9ca3af', marginTop: 2 }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function App() {
  if (!configurado) return <SinConfigurar />
  return <AuthProvider><DataProvider><Shell /></DataProvider></AuthProvider>
}
