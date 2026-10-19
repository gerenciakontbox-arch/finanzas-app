// Mover un ítem (activo, deuda, programación, compra TC, rubro) a otro de mis espacios.
import { useState } from 'react'
import { useData } from '../lib/data'
import { useAuth } from '../lib/auth'
import { Modal, Aviso, SaveBtn, CancelBtn, Icon } from '../lib/ui'
import { TIPO_ICON, TIPO_LABEL } from '../App'

const QUE = { activos: 'el activo', deudas: 'el crédito', programado: 'la programación', tc_cargos: 'la compra', presupuesto: 'el rubro' }

export default function MoverA({ item, onClose }) {
  const { rpc } = useData(); const { espacio, espacios } = useAuth()
  const [dest, setDest] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('')
  const otros = espacios.filter(e => e.id !== espacio.id)
  const go = async () => { if (!dest) return; setBusy(true); setErr(''); try { await rpc('mover_item', { p_tabla: item.tabla, p_id: item.id, p_destino: dest }); onClose(true) } catch (e) { setErr(e.message) } finally { setBusy(false) } }
  return (
    <Modal title={`Mover ${QUE[item.tabla] || 'ítem'}`} onClose={() => onClose(false)}>
      <div style={{ fontSize: 13, color: '#1B1B1F', marginBottom: 10 }}><b>{item.nombre}</b> está en <b>{espacio.tipo === 'personal' ? 'tu espacio personal' : espacio.nombre}</b>. ¿A dónde lo mueves?</div>
      {otros.length === 0 && <Aviso tipo="info">No tienes otros espacios. Crea un hogar o una empresa en Config → Espacios.</Aviso>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {otros.map(e => <button key={e.id} onClick={() => setDest(e.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, border: `1px solid ${dest === e.id ? '#4B1D9E' : '#EBE9F1'}`, background: dest === e.id ? '#F3F1F8' : '#fff', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', background: e.tipo === 'personal' ? '#4B1D9E' : e.tipo === 'hogar' ? '#138A5B' : '#0F6E8C' }}><Icon name={TIPO_ICON[e.tipo]} size={15} /></div>
          <div><div style={{ fontSize: 13, fontWeight: 700, color: '#1B1B1F' }}>{e.tipo === 'personal' ? 'Mi espacio personal' : e.nombre}</div><div style={{ fontSize: 10, color: '#6E6E73' }}>{TIPO_LABEL[e.tipo]}</div></div>
        </button>)}
      </div>
      {item.tabla === 'activos' && <div style={{ marginTop: 10 }}><Aviso tipo="warn">Se mueven con el activo: su crédito vinculado (con las cuotas pagadas), sus programaciones pendientes y sus compras con tarjeta activas. El historial de movimientos se queda donde está.</Aviso></div>}
      {item.tabla === 'deudas' && <div style={{ marginTop: 10 }}><Aviso tipo="warn">Se mueven las cuotas pagadas y las programaciones pendientes del crédito. El historial de movimientos se queda donde está.</Aviso></div>}
      {err && <div style={{ marginTop: 10 }}><Aviso tipo="err">{err}</Aviso></div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}><CancelBtn onClick={() => onClose(false)} /><SaveBtn onClick={go} disabled={!dest || busy}>{busy ? 'Moviendo…' : 'Mover'}</SaveBtn></div>
    </Modal>
  )
}
