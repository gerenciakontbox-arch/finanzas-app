import { useState, useEffect, useRef } from 'react'
import { Chart } from 'chart.js/auto'
import { fmtCOP } from './util'

/* ── Iconos monocromáticos (trazo) ── */
export const ICONS = {
  home:'<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  list:'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M12 11h4M12 16h4M8 11h.01M8 16h.01"/>',
  "list-check":'<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M9 14l2 2 4-4"/>',
  arrows:'<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
  card:'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  landmark:'<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2 2 8h20z"/>',
  calendar:'<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  sliders:'<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  pencil:'<path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
  trash:'<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  x:'<path d="M18 6 6 18M6 6l12 12"/>',
  "chevron-down":'<path d="m6 9 6 6 6-6"/>',
  "chevron-up":'<path d="m18 15-6-6-6 6"/>',
  "arrow-right":'<path d="M5 12h14M12 5l7 7-7 7"/>',
  wallet:'<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/>',
  banknote:'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  coins:'<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M16.71 13.88l.7.71-2.82 2.82"/>',
  dollar:'<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  receipt:'<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1zM14 8H8M16 12H8M13 16H8"/>',
  shield:'<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  wrench:'<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  wifi:'<path d="M12 20h.01M2 8.82a15 15 0 0 1 20 0M5 12.86a10 10 0 0 1 14 0M8.5 16.43a5 5 0 0 1 7 0"/>',
  refresh:'<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>',
  pin:'<path d="M12 17v5M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  car:'<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  bike:'<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
  laptop:'<path d="M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16"/>',
  package:'<path d="M16.5 9.4 7.55 4.24M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/>',
  alert:'<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01"/>',
  clock:'<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  gem:'<path d="M6 3h12l4 6-10 13L2 9zM11 3 8 9l4 13 4-13-3-6M2 9h20"/>',
  cart:'<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  user:'<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  tag:'<path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2zM7 7h.01"/>',
  info:'<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  chart:'<path d="M3 3v18h18M18 17V9M13 17V5M8 17v3"/>',
  "trending-down":'<path d="m22 17-8.5-8.5-5 5L2 7M16 17h6v-6"/>',
  upload:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download:'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  file:'<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5zM14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
}
export const Icon = ({ name, size = 16, sw = 1.75, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }} dangerouslySetInnerHTML={{ __html: ICONS[name] || ICONS.pin }} />
)
export const IcoText = ({ name, children, size = 13, gap = 6 }) => (<span style={{ display: 'inline-flex', alignItems: 'center', gap }}><Icon name={name} size={size} /><span>{children}</span></span>)

/* ── Primitivas ── */
export const inp = { width: '100%', border: '1px solid #e5e7eb', borderRadius: 10, padding: '9px 12px', fontSize: 14, outline: 'none', boxSizing: 'border-box', background: '#fff' }
export const sel = { ...inp }
export const PBtn = ({ active, onClick, children }) => (<button onClick={onClick} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, border: '1px solid', cursor: 'pointer', background: active ? '#7c3aed' : 'transparent', color: active ? '#fff' : '#6b7280', borderColor: active ? '#7c3aed' : '#d1d5db' }}>{children}</button>)
export const Badge = ({ val, map }) => { const [bg, cl] = ((map || {})[val] || '#f1f5f9|#64748b').split('|'); return <span style={{ background: bg, color: cl, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{val}</span> }
export const Kpi = ({ icon, value, sub, label, color, grad }) => (
  <div style={{ background: grad || '#fff', borderRadius: 16, padding: '14px 12px', border: grad ? 'none' : '1px solid #f0f0f0', textAlign: 'center', color: grad ? '#fff' : 'inherit' }}>
    {icon && <div style={{ display: 'flex', justifyContent: 'center', color: grad ? 'rgba(255,255,255,0.9)' : '#6b7280', marginBottom: 2 }}><Icon name={icon} size={20} sw={1.6} /></div>}
    <div style={{ fontWeight: 800, fontSize: 15, color: grad ? '#fff' : (color || '#111'), marginTop: icon ? 3 : 0, lineHeight: 1.2 }}>{value}</div>
    {sub && <div style={{ fontSize: 9, opacity: grad ? 0.75 : 1, color: grad ? '#fff' : '#9ca3af', marginTop: 2 }}>{sub}</div>}
    <div style={{ fontSize: 10, fontWeight: 600, marginTop: 3, opacity: grad ? 0.9 : 1, color: grad ? '#fff' : '#6b7280' }}>{label}</div>
  </div>
)
export const Field = ({ label, full, children }) => (<div style={{ gridColumn: full ? '1/-1' : 'auto' }}><label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{label}</label>{children}</div>)
export function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 999, display: 'flex', alignItems: 'flex-end' }}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e5e7eb', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{title}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 26, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: '16px 18px 36px' }}>{children}</div>
      </div>
    </div>
  )
}
export const SaveBtn = ({ onClick, disabled, children }) => (<button onClick={onClick} disabled={disabled} style={{ flex: 2, padding: '11px', background: disabled ? '#c4b5fd' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', fontSize: 14 }}>{children}</button>)
export const CancelBtn = ({ onClick }) => (<button onClick={onClick} style={{ flex: 1, padding: '11px', border: '1px solid #d1d5db', borderRadius: 10, background: '#fff', cursor: 'pointer', fontSize: 14 }}>Cancelar</button>)
export const SmallBtn = ({ onClick, bg, color, children }) => (<button onClick={onClick} style={{ fontSize: 11, background: bg, color, border: 'none', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 5 }}>{children}</button>)
export const PrimaryBtn = ({ onClick, children, style, title }) => (<button onClick={onClick} title={title} style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 16px', fontWeight: 700, fontSize: 14, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, ...style }}>{children}</button>)
export const Card = ({ children, style }) => (<div style={{ background: '#fff', borderRadius: 16, padding: 16, border: '1px solid #f0f0f0', ...style }}>{children}</div>)
export const Aviso = ({ tipo = 'info', children }) => { const c = { info: ['#f5f3ff', '#4c1d95', 'info'], warn: ['#fef3c7', '#92400e', 'alert'], ok: ['#f0fdf4', '#065f46', 'check'], err: ['#fee2e2', '#991b1b', 'alert'] }[tipo]; return <div style={{ background: c[0], borderRadius: 12, padding: '10px 14px', fontSize: 12, color: c[1], display: 'flex', gap: 8, alignItems: 'flex-start', lineHeight: 1.5 }}><Icon name={c[2]} size={15} style={{ marginTop: 1 }} /><span>{children}</span></div> }
export function useForm(init) { const [form, setForm] = useState(init); const sf = (k, v) => setForm(f => ({ ...f, [k]: v })); return [form, sf, setForm] }

/* ── Charts ── */
export function BarChartCJ({ labels, datasets, height = 180 }) {
  const ref = useRef(); const chart = useRef()
  useEffect(() => { if (chart.current) chart.current.destroy()
    chart.current = new Chart(ref.current, { type: 'bar', data: { labels, datasets }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtCOP(ctx.raw)}` } } }, scales: { x: { ticks: { font: { size: 9 } } }, y: { ticks: { font: { size: 9 }, callback: v => '$' + Math.round(v / 1e6) + 'M' } } } } })
    return () => { if (chart.current) chart.current.destroy() } }, [JSON.stringify({ labels, datasets })])
  return <div style={{ position: 'relative', height }}><canvas ref={ref} /></div>
}
export const COLORS = ['#8b5cf6', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#3b82f6', '#84cc16']
export function PieChartCJ({ labels, data, height = 180 }) {
  const ref = useRef(); const chart = useRef()
  useEffect(() => { if (chart.current) chart.current.destroy()
    chart.current = new Chart(ref.current, { type: 'doughnut', data: { labels, datasets: [{ data, backgroundColor: COLORS, borderWidth: 1 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmtCOP(ctx.raw)}` } } } } })
    return () => { if (chart.current) chart.current.destroy() } }, [JSON.stringify({ labels, data })])
  return <div style={{ position: 'relative', height }}><canvas ref={ref} /></div>
}
