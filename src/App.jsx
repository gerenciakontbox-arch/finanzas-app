import { useState } from 'react'
import { configurado } from './lib/supabase'
import { AuthProvider, useAuth, SCHEMA_VERSION } from './lib/auth'
import { DataProvider, useData } from './lib/data'
import { Icon, T } from './lib/ui'
import { Login, SinConfigurar, FaltaMigracion, PrimerNombre } from './modules/Acceso'
import Dashboard from './modules/Dashboard'
import Presupuesto from './modules/Presupuesto'
import Movimientos from './modules/Movimientos'
import Deudas from './modules/Deudas'
import Activos from './modules/Activos'
import Programado from './modules/Programado'
import Config from './modules/Config'

// 5 secciones: Plan agrupa Presupuesto + Programado; Más agrupa Activos + Ajustes.
const TABS = [['dashboard', 'home', 'Inicio'], ['movimientos', 'arrows', 'Movimientos'], ['plan', 'clock', 'Plan'], ['deudas', 'card', 'Deudas'], ['mas', 'dots', 'Más']]
const PADRE = { presupuesto: 'plan', programado: 'plan', activos: 'mas', config: 'mas' }
export const TIPO_ICON = { personal: 'user', hogar: 'home', empresa: 'landmark' }
export const TIPO_LABEL = { personal: 'Personal', hogar: 'Hogar', empresa: 'Empresa' }
const TITULO = { movimientos: 'Movimientos', plan: 'Plan', deudas: 'Deudas', mas: 'Más' }

function Cargando({ texto = 'Cargando…' }) {
  return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 14, background: T.morado, color: '#fff' }}><Icon name="wallet" size={40} sw={1.6} /><div style={{ fontWeight: 600, fontSize: 14, opacity: 0.85 }}>{texto}</div></div>
}

export function SelectorEspacio() {
  const { espacios, espacio, cambiarEspacio } = useAuth()
  const [open, setOpen] = useState(false)
  const orden = { personal: 0, hogar: 1, empresa: 2 }
  const lista = [...espacios].sort((a, b) => orden[a.tipo] - orden[b.tipo] || a.nombre.localeCompare(b.nombre))
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} aria-label="Cambiar de espacio" style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1.5px solid rgba(255,255,255,0.55)', color: '#fff', borderRadius: 18, height: 36, padding: '0 12px', cursor: 'pointer', fontSize: 12, fontWeight: 700, maxWidth: 180, fontFamily: 'inherit' }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{espacio.tipo === 'personal' ? 'Personal' : espacio.nombre}</span><Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} sw={2.5} />
      </button>
      {open && <>
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 150 }} />
        <div data-menu="espacios" style={{ position: 'absolute', right: 0, top: 42, background: '#fff', borderRadius: 16, boxShadow: '0 12px 40px rgba(27,27,31,0.18)', padding: 6, minWidth: 230, zIndex: 151 }}>
          {lista.map(e => <button key={e.id} onClick={() => { setOpen(false); if (e.id !== espacio.id) cambiarEspacio(e.id) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', border: 'none', borderRadius: 12, background: e.id === espacio.id ? T.superficie : 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
            <div style={{ width: 34, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: e.tipo === 'empresa' ? T.tinta : T.morado }}><Icon name={TIPO_ICON[e.tipo]} size={16} /></div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 700, color: T.tinta, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.tipo === 'personal' ? 'Personal' : e.nombre}</div><div style={{ fontSize: 11, color: T.gris }}>{TIPO_LABEL[e.tipo]}</div></div>
            {e.id === espacio.id && <Icon name="check" size={15} sw={2.5} style={{ color: T.morado }} />}
          </button>)}
        </div>
      </>}
    </div>
  )
}

const iniciales = n => (n || '').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '·'

function Segmento({ value, onChange, opciones }) {
  return (
    <div role="tablist" style={{ display: 'flex', background: T.superficie, borderRadius: 22, padding: 4 }}>
      {opciones.map(([k, l]) => <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} style={{ flex: 1, height: 36, border: 'none', borderRadius: 18, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: value === k ? '#fff' : 'transparent', color: value === k ? T.tinta : T.gris, boxShadow: value === k ? '0 1px 3px rgba(27,27,31,0.08)' : 'none' }}>{l}</button>)}
    </div>
  )
}

function Shell() {
  const { session, listo, schemaOk, espacio, miembroActual, user } = useAuth()
  const { db, error } = useData()
  const [tab, setTab] = useState('dashboard')
  const [sub, setSub] = useState({ plan: 'presupuesto', mas: 'activos' })
  const [arg, setArg] = useState(null)
  if (session === undefined) return <Cargando />
  if (!session) return <Login />
  if (!listo) return <Cargando texto="Preparando tu espacio…" />
  if (schemaOk === false) return <FaltaMigracion version={SCHEMA_VERSION} />
  if (error) return <Cargando texto={'Error cargando datos: ' + error} />
  if (!espacio || !db) return <Cargando texto="Cargando…" />
  const autoNombre = miembroActual && user?.email && miembroActual.nombre === user.email.split('@')[0]
  const goTo = (k, a = null) => { const p = PADRE[k]; if (p) { setSub(s => ({ ...s, [p]: k })); setTab(p) } else setTab(k); setArg(a ? { ...a, _k: Date.now() } : null) }
  const props = { goTo }
  const vista = tab === 'plan' || tab === 'mas' ? sub[tab] : tab
  const inicio = tab === 'dashboard'
  const nombre = miembroActual?.nombre || '—'
  return (
    <div style={{ minHeight: '100vh', background: '#fff', paddingBottom: 'calc(84px + env(safe-area-inset-bottom))' }}>
      <div className="safe-top" style={{ background: T.morado, color: '#fff', paddingLeft: 20, paddingRight: 20, paddingBottom: inicio ? 0 : 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <button onClick={() => goTo('config')} aria-label="Mi perfil" style={{ width: 40, height: 40, borderRadius: 20, border: 'none', background: 'rgba(255,255,255,0.18)', color: '#fff', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>{iniciales(nombre)}</button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inicio ? `Hola, ${nombre.split(' ')[0]}` : TITULO[tab]}</div>
              <div style={{ fontSize: 12, opacity: 0.8, marginTop: 1 }}>{espacio.tipo === 'personal' ? 'Espacio personal' : `${espacio.nombre} · ${TIPO_LABEL[espacio.tipo]}`}</div>
            </div>
          </div>
          <SelectorEspacio />
        </div>
      </div>
      {autoNombre && <PrimerNombre />}
      {inicio ? <Dashboard {...props} /> : (
        <div style={{ padding: '16px 20px 8px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tab === 'plan' && <Segmento value={sub.plan} onChange={k => setSub(s => ({ ...s, plan: k }))} opciones={[['presupuesto', 'Presupuesto'], ['programado', 'Programado']]} />}
          {tab === 'mas' && <Segmento value={sub.mas} onChange={k => setSub(s => ({ ...s, mas: k }))} opciones={[['activos', 'Activos'], ['config', 'Ajustes']]} />}
          {vista === 'presupuesto' && <Presupuesto {...props} />}
          {vista === 'movimientos' && <Movimientos {...props} inicial={arg} />}
          {vista === 'deudas' && <Deudas {...props} />}
          {vista === 'activos' && <Activos {...props} />}
          {vista === 'programado' && <Programado {...props} />}
          {vista === 'config' && <Config {...props} />}
        </div>
      )}
      <nav aria-label="Secciones" className="safe-bot" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', paddingTop: 10, paddingLeft: 6, paddingRight: 6, zIndex: 100, boxShadow: '0 -8px 24px rgba(27,27,31,0.06)' }}>
        {TABS.map(([k, icon, label]) => { const on = tab === k; return (
          <button key={k} onClick={() => { setTab(k); setArg(null) }} aria-current={on ? 'page' : undefined} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '2px 0 6px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit', color: on ? T.morado : T.gris, minWidth: 0 }}>
            <Icon name={icon} size={22} sw={on ? 2.2 : 2} />
            <span style={{ fontSize: 10, fontWeight: on ? 700 : 600 }}>{label}</span>
          </button>) })}
      </nav>
    </div>
  )
}

export default function App() {
  if (!configurado) return <SinConfigurar />
  return <AuthProvider><DataProvider><Shell /></DataProvider></AuthProvider>
}
