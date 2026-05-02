import React, { useEffect, useState } from 'react';
import api from '../api';

export default function Billetera() {
  const [config, setConfig] = useState({ porcentajeComision: 8, saldoMinimo: 5000, activo: false });
  const [reporte, setReporte] = useState({ billeteras: [], totales: {} });
  const [cargando, setCargando] = useState(true);
  const [editConfig, setEditConfig] = useState(false);
  const [formConfig, setFormConfig] = useState({});
  const [recargaModal, setRecargaModal] = useState(null);
  const [montoRecarga, setMontoRecarga] = useState('');
  const [metodoRecarga, setMetodoRecarga] = useState('efectivo');
  const [refRecarga, setRefRecarga] = useState('');
  const [detalle, setDetalle] = useState(null);
  const [movimientos, setMovimientos] = useState([]);

  const cargar = async () => {
    try {
      const [cRes, rRes] = await Promise.all([
        api.get('/billetera/config'),
        api.get('/billetera/reporte'),
      ]);
      setConfig(cRes.data);
      setFormConfig(cRes.data);
      setReporte(rRes.data);
    } catch {} finally { setCargando(false); }
  };

  useEffect(() => { cargar(); }, []);

  const guardarConfig = async () => {
    try {
      await api.put('/billetera/config', formConfig);
      setEditConfig(false);
      cargar();
      alert('✅ Configuración guardada');
    } catch (e) { alert('Error: ' + (e.response?.data?.error || e.message)); }
  };

  const toggleActivo = async () => {
    const nuevo = !config.activo;
    if (nuevo && !window.confirm('¿Activar el sistema de billetera y comisiones? Se empezará a descontar comisión por cada servicio completado.')) return;
    try {
      await api.put('/billetera/config', { activo: nuevo });
      cargar();
    } catch (e) { alert('Error: ' + (e.response?.data?.error || e.message)); }
  };

  const hacerRecarga = async () => {
    const monto = parseInt(montoRecarga);
    if (!monto || monto < 1000) return alert('Monto mínimo: $1,000');
    try {
      const res = await api.post('/billetera/recargar', {
        conductorUid: recargaModal.uid, monto, metodo: metodoRecarga, referencia: refRecarga,
      });
      alert(res.data.message);
      setRecargaModal(null); setMontoRecarga(''); setRefRecarga('');
      cargar();
    } catch (e) { alert('Error: ' + (e.response?.data?.error || e.message)); }
  };

  const verDetalle = async (uid, nombre) => {
    try {
      const res = await api.get(`/billetera/movimientos/${uid}`);
      setMovimientos(res.data);
      setDetalle({ uid, nombre });
    } catch { alert('Error cargando movimientos'); }
  };

  if (cargando) return <p className="loading">Cargando billetera...</p>;

  // ── DETALLE DE CONDUCTOR ──
  if (detalle) {
    return (
      <div>
        <button onClick={() => setDetalle(null)} style={s.btnVolver}>← Volver</button>
        <h2 className="titulo">💰 Movimientos — {detalle.nombre}</h2>
        <table>
          <thead>
            <tr><th>Fecha</th><th>Tipo</th><th>Monto</th><th>Saldo anterior</th><th>Saldo nuevo</th><th>Detalle</th></tr>
          </thead>
          <tbody>
            {movimientos.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', color: '#999' }}>Sin movimientos</td></tr>}
            {movimientos.map(m => (
              <tr key={m.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(m.creadoEn).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })}</td>
                <td><span style={{ ...s.badge, background: m.tipo === 'recarga' ? '#2E7D32' : '#E53935' }}>{m.tipo === 'recarga' ? '💰 Recarga' : '📊 Comisión'}</span></td>
                <td style={{ fontWeight: 'bold', color: m.monto >= 0 ? '#2E7D32' : '#E53935' }}>
                  {m.monto >= 0 ? '+' : ''}${Math.abs(m.monto).toLocaleString('es-CO')}
                </td>
                <td>${(m.saldoAnterior || 0).toLocaleString('es-CO')}</td>
                <td style={{ fontWeight: 'bold' }}>${(m.saldoNuevo || 0).toLocaleString('es-CO')}</td>
                <td style={{ fontSize: 12, color: '#888' }}>
                  {m.tipo === 'comision' ? `${m.porcentaje}% de $${(m.tarifaViaje || 0).toLocaleString('es-CO')}` : m.metodo || '—'}
                  {m.referencia ? ` — Ref: ${m.referencia}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ── VISTA PRINCIPAL ──
  return (
    <div>
      <h2 className="titulo">💰 Billetera & Comisiones</h2>

      {/* Switch activar/desactivar */}
      <div style={s.activarCard}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 18 }}>{config.activo ? '🟢 Sistema ACTIVO' : '🔴 Sistema INACTIVO'}</h3>
          <p style={{ margin: '4px 0 0', color: '#666', fontSize: 14 }}>
            {config.activo ? 'Se descuenta comisión por cada servicio completado' : 'No se están cobrando comisiones'}
          </p>
        </div>
        <button onClick={toggleActivo} style={{ ...s.btnToggle, background: config.activo ? '#E53935' : '#2E7D32' }}>
          {config.activo ? '⏸ Desactivar' : '▶ Activar'}
        </button>
      </div>

      {/* Configuración */}
      <div style={s.configCard}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>⚙️ Configuración</h3>
          {!editConfig && <button onClick={() => { setFormConfig(config); setEditConfig(true); }} style={s.btnEditar}>✏️ Editar</button>}
        </div>
        {!editConfig ? (
          <div style={s.configGrid}>
            <div style={s.configItem}><span style={s.configLabel}>Comisión</span><span style={s.configValor}>{config.porcentajeComision}%</span></div>
            <div style={s.configItem}><span style={s.configLabel}>Saldo mínimo alerta</span><span style={s.configValor}>${(config.saldoMinimo || 5000).toLocaleString('es-CO')}</span></div>
          </div>
        ) : (
          <div>
            <div style={s.configGrid}>
              <div style={s.configItem}>
                <label style={s.configLabel}>Porcentaje comisión (%)</label>
                <input type="number" value={formConfig.porcentajeComision || ''} onChange={e => setFormConfig(p => ({ ...p, porcentajeComision: e.target.value }))}
                  style={s.input} min="0" max="50" step="0.5" />
              </div>
              <div style={s.configItem}>
                <label style={s.configLabel}>Saldo mínimo alerta ($)</label>
                <input type="number" value={formConfig.saldoMinimo || ''} onChange={e => setFormConfig(p => ({ ...p, saldoMinimo: e.target.value }))}
                  style={s.input} min="0" step="1000" />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              <button onClick={guardarConfig} style={s.btnGuardar}>Guardar</button>
              <button onClick={() => setEditConfig(false)} style={s.btnCancelar}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      {/* Totales */}
      <div className="stats">
        <div className="stat-card"><div className="num" style={{ color: '#2E7D32' }}>${(reporte.totales.totalSaldos || 0).toLocaleString('es-CO')}</div><div className="label">Saldo total en billeteras</div></div>
        <div className="stat-card"><div className="num" style={{ color: '#1565C0' }}>${(reporte.totales.totalRecargas || 0).toLocaleString('es-CO')}</div><div className="label">Total recargado</div></div>
        <div className="stat-card"><div className="num" style={{ color: '#E53935' }}>${(reporte.totales.totalComisiones || 0).toLocaleString('es-CO')}</div><div className="label">Total comisiones cobradas</div></div>
        <div className="stat-card"><div className="num">{reporte.billeteras.length}</div><div className="label">Conductores con billetera</div></div>
      </div>

      {/* Tabla de billeteras */}
      <div style={s.card}>
        <h3 style={{ marginTop: 0 }}>📋 Billeteras por conductor</h3>
        <table>
          <thead>
            <tr><th>Conductor</th><th>Placa</th><th>Saldo</th><th>Total recargado</th><th>Total comisiones</th><th>Acciones</th></tr>
          </thead>
          <tbody>
            {reporte.billeteras.length === 0 && <tr><td colSpan="6" style={{ textAlign: 'center', color: '#999' }}>Sin billeteras registradas</td></tr>}
            {reporte.billeteras.map(b => (
              <tr key={b.uid}>
                <td>{b.nombre}</td>
                <td style={{ color: '#FFC107', fontWeight: 'bold' }}>{b.placa}</td>
                <td style={{ fontWeight: 'bold', color: b.saldo <= 0 ? '#E53935' : b.saldo < 5000 ? '#FF9800' : '#2E7D32' }}>
                  ${b.saldo.toLocaleString('es-CO')}
                </td>
                <td>${(b.totalRecargas || 0).toLocaleString('es-CO')}</td>
                <td style={{ color: '#E53935' }}>${(b.totalComisiones || 0).toLocaleString('es-CO')}</td>
                <td style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setRecargaModal(b)} style={s.btnRecarga}>💰 Recargar</button>
                  <button onClick={() => verDetalle(b.uid, b.nombre)} style={s.btnDetalle}>📋 Detalle</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de recarga */}
      {recargaModal && (
        <div style={s.modalOverlay}>
          <div style={s.modal}>
            <h3>💰 Recargar billetera</h3>
            <p style={{ color: '#666' }}>Conductor: <strong>{recargaModal.nombre}</strong> — Saldo actual: <strong>${recargaModal.saldo.toLocaleString('es-CO')}</strong></p>
            <label style={s.configLabel}>Monto a recargar</label>
            <input type="number" value={montoRecarga} onChange={e => setMontoRecarga(e.target.value)} style={s.input} placeholder="20000" min="1000" step="1000" />
            <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
              {[10000, 20000, 50000, 100000].map(m => (
                <button key={m} onClick={() => setMontoRecarga(m.toString())} style={{ ...s.btnMonto, background: montoRecarga === m.toString() ? '#FFC107' : '#f0f0f0' }}>
                  ${m.toLocaleString('es-CO')}
                </button>
              ))}
            </div>
            <label style={s.configLabel}>Método de pago</label>
            <select value={metodoRecarga} onChange={e => setMetodoRecarga(e.target.value)} style={s.input}>
              <option value="efectivo">Efectivo</option>
              <option value="nequi">Nequi</option>
              <option value="daviplata">Daviplata</option>
              <option value="transferencia">Transferencia</option>
            </select>
            <label style={s.configLabel}>Referencia (opcional)</label>
            <input type="text" value={refRecarga} onChange={e => setRefRecarga(e.target.value)} style={s.input} placeholder="Número de transacción" />
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={hacerRecarga} style={s.btnGuardar}>Confirmar recarga</button>
              <button onClick={() => setRecargaModal(null)} style={s.btnCancelar}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  activarCard: { background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 16 },
  btnToggle: { color: '#fff', border: 'none', borderRadius: 10, padding: '12px 24px', cursor: 'pointer', fontWeight: 'bold', fontSize: 15 },
  configCard: { background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  configGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  configItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  configLabel: { fontSize: 12, color: '#888', textTransform: 'uppercase', fontWeight: '600' },
  configValor: { fontSize: 24, fontWeight: 'bold', color: '#222' },
  input: { border: '2px solid #ddd', borderRadius: 8, padding: '10px 14px', fontSize: 15, width: '100%', boxSizing: 'border-box', marginTop: 4 },
  btnEditar: { background: '#1565C0', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontWeight: 'bold' },
  btnGuardar: { background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 24px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14 },
  btnCancelar: { background: '#eee', color: '#666', border: 'none', borderRadius: 8, padding: '12px 24px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14 },
  card: { background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' },
  btnRecarga: { background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 },
  btnDetalle: { background: '#1565C0', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 },
  btnVolver: { background: 'none', border: 'none', color: '#E53935', cursor: 'pointer', fontSize: 15, marginBottom: 16, fontWeight: 'bold' },
  badge: { color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 'bold' },
  btnMonto: { border: '2px solid #ddd', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontWeight: 'bold', fontSize: 13 },
  modalOverlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 20, padding: 28, width: 440, maxWidth: '90vw' },
};
