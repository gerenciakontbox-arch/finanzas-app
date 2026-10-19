import { useState } from 'react'
import { configurado } from './lib/supabase'
import { AuthProvider, useAuth } from './lib/auth'
import { DataProvider, useData } from './lib/data'
import { Icon } from './lib/ui'
import { Login, Onboarding, SinConfigurar } from './modules/Acceso'
import Dashboard from './modules/Dashboard'
import Presupuesto from './modules/Presupuesto'
import Movimientos from './modules/Movimientos'
import Deudas from './modules/Deudas'
import Activos from './modules/Activos'
import Programado from './modules/Programado'
import Config from './modules/Config'

const TABS = [['dashboard', 'home', 'Inicio'], ['presupuesto', 'list', 'Presup.'], ['movimientos', 'arrows', 'Movim.'], ['deudas', 'card', 'Deudas'], ['activos', 'landmark', 'Activos'], ['programado', 'calendar', 'Progr.'], ['config', 'sliders', 'Config']]

function Cargando({ texto = 'Cargando…' }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12, background: '#f8f7ff' }}><Icon name="wallet" size={48} sw={1.4} style={{ color: '#7c3aed' }} /><div style={{ color: '#6b7280', fontWeight: 600 }}>{texto}</div></div>
}

function Shell() {
  const { session, hogar, miembroActual } = useAuth()
  const { db, error } = useData()
  const [tab, setTab] = useState('dashboard')
  if (session === undefined) return <Cargando />
  if (!session) return <Login />
  if (!hogar) return <Onboarding />
  if (error) return <Cargando texto={'Error cargando datos: ' + error} />
  if (!db) return <Cargando texto="Cargando tu hogar…" />
  const props = { goTo: setTab }
  return (
    <div style={{ minHeight: '100vh', background: '#f8f7ff', paddingBottom: 72 }}>
      <div className="safe-top" style={{ background: 'linear-gradient(135deg,#7c3aed,#4338ca)', color: '#fff', paddingLeft: 18, paddingRight: 18, paddingBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="wallet" size={18} />Akontapp</div>
            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>{hogar.nombre} · {new Date().toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}</div>
          </div>
          <div style={{ fontSize: 11, opacity: 0.85, background: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 5 }}><Icon name="user" size={12} />{miembroActual?.nombre || '—'}</div>
        </div>
      </div>
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
