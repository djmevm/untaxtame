import React, { useEffect, useState } from 'react';
import api from '../api';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

export default function Servicios() {
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [detalle, setDetalle] = useState(null);
  const [ofertas, setOfertas] = useState([]);
  const [chat, setChat] = useState([]);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);

  const cargar = () => {
    api.get('/services/todos')
      .then(res => setServicios(res.data))
      .catch(() => {})
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  const totales = {
    total: servicios.length,
    pendientes: servicios.filter(s => s.estado === 'pendiente').length,
    completados: servicios.filter(s => s.estado === 'completado').length,
    cancelados: servicios.filter(s => s.estado === 'cancelado').length,
    promedio: (() => {
      const cal = servicios.filter(s => s.calificacion?.estrellas);
      if (!cal.length) return '—';
      return (cal.reduce((a, s) => a + s.calificacion.estrellas, 0) / cal.length).toFixed(1);
    })(),
  };

  const cancelarServicio = async (servicio) => {
    const motivo = window.prompt(`Motivo para cancelar el servicio de ${servicio.clienteNombre}:`, 'Cancelado por administrador');
    if (motivo === null) return;
    try {
      await api.put(`/services/admin-cancelar/${servicio.id}`, { motivo });
      alert('✅ Servicio cancelado');
      cargar();
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    }
  };

  const verDetalle = async (servicio) => {
    setDetalle(servicio);
    setCargandoDetalle(true);
    try {
      const [ofertasRes, chatRes] = await Promise.all([
        api.get(`/ofertas/${servicio.id}`).catch(() => ({ data: [] })),
        api.get(`/chat/${servicio.id}`).catch(() => ({ data: [] })),
      ]);
      setOfertas(ofertasRes.data || []);
      setChat(chatRes.data || []);
    } catch {} finally {
      setCargandoDetalle(false);
    }
  };

  const filtrados = filtroEstado === 'todos'
    ? servicios
    : servicios.filter(s => s.estado === filtroEstado);

  const exportarCSV = () => {
    const headers = ['Cliente', 'Conductor', 'Origen', 'Destino', 'Pago', 'Estado', 'Calificación', 'Comentario', 'Tarifa Estimada', 'Fecha'];
    const filas = filtrados.map(s => [
      s.clienteNombre || '',
      s.conductorNombre || '',
      `"${(s.origen || '').replace(/"/g, '""')}"`,
      `"${(s.destino || '').replace(/"/g, '""')}"`,
      s.metodoPago?.toUpperCase() || '',
      s.estado || '',
      s.calificacion?.estrellas || '',
      `"${(s.calificacion?.comentario || '').replace(/"/g, '""')}"`,
      s.tarifaEstimada?.tarifaEstimada || '',
      new Date(s.creadoEn).toLocaleString('es-CO'),
    ]);

    const csv = [headers.join(','), ...filas.map(f => f.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `servicios_untaxtame_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (cargando) return <p className="loading">Cargando servicios...</p>;

  // ── VISTA DETALLE DEL SERVICIO ──
  if (detalle) {
    const ESTADO_COLORES = {
      pendiente: '#FFC107', aceptado: '#1565C0', conductor_en_sitio: '#FF9800',
      completado: '#2E7D32', cancelado: '#E53935',
    };

    return (
      <div>
        <button onClick={() => { setDetalle(null); setOfertas([]); setChat([]); }} style={estilos.btnVolver}>
          ← Volver a la lista
        </button>

        <h2 style={{ marginBottom: 20 }}>🚕 Seguimiento del Servicio</h2>

        {/* Estado actual */}
        <div style={{ ...estilos.estadoBanner, backgroundColor: ESTADO_COLORES[detalle.estado] || '#999' }}>
          <span style={{ fontSize: 28 }}>
            {detalle.estado === 'pendiente' ? '🔍' : detalle.estado === 'aceptado' ? '🚕' : detalle.estado === 'conductor_en_sitio' ? '📍' : detalle.estado === 'completado' ? '✅' : '❌'}
          </span>
          <span style={{ color: '#fff', fontWeight: 'bold', fontSize: 18 }}>
            {detalle.estado === 'pendiente' ? 'Buscando conductor...' : detalle.estado === 'aceptado' ? 'Conductor en camino' : detalle.estado === 'conductor_en_sitio' ? 'Conductor en el punto' : detalle.estado === 'completado' ? 'Servicio completado' : 'Servicio cancelado'}
          </span>
        </div>

        {/* Mapa en tiempo real */}
        {(detalle.ubicacionGPS || detalle.destinoLat) && (
          <div style={estilos.seccionDetalle}>
            <h3>🗺️ Mapa del servicio</h3>
            <div style={{ borderRadius: 14, overflow: 'hidden', height: 350 }}>
              <MapContainer
                center={[
                  detalle.ubicacionGPS?.lat || detalle.destinoLat || 4.6097,
                  detalle.ubicacionGPS?.lng || detalle.destinoLng || -74.0817
                ]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {/* Marcador del cliente (origen) */}
                {detalle.ubicacionGPS && (
                  <Marker position={[detalle.ubicacionGPS.lat, detalle.ubicacionGPS.lng]}
                    icon={L.divIcon({ className: '', html: '<div style="font-size:28px">👤</div>', iconSize: [30, 30], iconAnchor: [15, 30] })}>
                    <Popup>📍 Cliente: {detalle.clienteNombre}<br/>{detalle.origen}</Popup>
                  </Marker>
                )}
                {/* Marcador del destino */}
                {detalle.destinoLat && detalle.destinoLng && (
                  <Marker position={[detalle.destinoLat, detalle.destinoLng]}
                    icon={L.divIcon({ className: '', html: '<div style="font-size:28px">🏁</div>', iconSize: [30, 30], iconAnchor: [15, 30] })}>
                    <Popup>🏁 Destino: {detalle.destino}</Popup>
                  </Marker>
                )}
                {/* Marcador del conductor */}
                {detalle.conductorUbicacion && (
                  <Marker position={[detalle.conductorUbicacion.lat, detalle.conductorUbicacion.lng]}
                    icon={L.divIcon({ className: '', html: '<div style="font-size:28px">🚕</div>', iconSize: [30, 30], iconAnchor: [15, 30] })}>
                    <Popup>🚕 Conductor: {detalle.conductorNombre}<br/>{detalle.conductorPlaca}</Popup>
                  </Marker>
                )}
              </MapContainer>
            </div>
            {detalle.tarifaEstimada && (
              <div style={{ display: 'flex', gap: 20, marginTop: 12, justifyContent: 'center' }}>
                <span style={estilos.mapaBadge}>📏 {detalle.tarifaEstimada.distanciaKm} km</span>
                <span style={estilos.mapaBadge}>⏱️ ~{detalle.tarifaEstimada.tiempoEstimadoMin} min</span>
                <span style={{ ...estilos.mapaBadge, background: '#2E7D32', color: '#fff' }}>💰 ${detalle.tarifaEstimada.tarifaEstimada?.toLocaleString('es-CO')}</span>
              </div>
            )}
          </div>
        )}

        {/* Info del servicio */}
        <div style={estilos.detalleGrid}>
          {/* Cliente */}
          <div style={estilos.detalleCard}>
            <h3 style={estilos.detalleCardTitulo}>👤 Cliente</h3>
            <p style={estilos.detalleInfo}><strong>{detalle.clienteNombre}</strong></p>
            <p style={estilos.detalleInfo}>📞 {detalle.clienteCelular || '—'}</p>
            <p style={estilos.detalleInfo}>💳 {detalle.metodoPago?.toUpperCase() || '—'}</p>
          </div>

          {/* Conductor */}
          <div style={estilos.detalleCard}>
            <h3 style={estilos.detalleCardTitulo}>🚕 Conductor</h3>
            {detalle.conductorNombre ? (
              <>
                <p style={estilos.detalleInfo}><strong>{detalle.conductorNombre}</strong></p>
                <p style={estilos.detalleInfo}>🚗 {detalle.conductorPlaca || '—'}</p>
                <p style={estilos.detalleInfo}>📞 {detalle.conductorCelular || '—'}</p>
              </>
            ) : (
              <p style={{ color: '#999' }}>Sin conductor asignado</p>
            )}
          </div>

          {/* Ruta */}
          <div style={estilos.detalleCard}>
            <h3 style={estilos.detalleCardTitulo}>🗺️ Ruta</h3>
            <p style={estilos.detalleInfo}>📍 <strong>Origen:</strong> {detalle.origen}</p>
            <p style={estilos.detalleInfo}>🏁 <strong>Destino:</strong> {detalle.destino}</p>
            {detalle.tarifaEstimada && (
              <p style={estilos.detalleInfo}>💰 <strong>Tarifa:</strong> ${detalle.tarifaEstimada.tarifaEstimada?.toLocaleString('es-CO')} ({detalle.tarifaEstimada.distanciaKm} km, ~{detalle.tarifaEstimada.tiempoEstimadoMin} min)</p>
            )}
          </div>

          {/* Tiempos */}
          <div style={estilos.detalleCard}>
            <h3 style={estilos.detalleCardTitulo}>⏱️ Tiempos</h3>
            <p style={estilos.detalleInfo}>📅 Creado: {new Date(detalle.creadoEn).toLocaleString('es-CO')}</p>
            {detalle.actualizadoEn && <p style={estilos.detalleInfo}>🔄 Actualizado: {new Date(detalle.actualizadoEn).toLocaleString('es-CO')}</p>}
            {detalle.calificacion && (
              <p style={estilos.detalleInfo}>⭐ Calificación: {detalle.calificacion.puntuacion || detalle.calificacion.estrellas}/10 {detalle.calificacion.comentario ? `— "${detalle.calificacion.comentario}"` : ''}</p>
            )}
          </div>
        </div>

        {/* Ofertas / Negociación */}
        <div style={estilos.seccionDetalle}>
          <h3>💰 Negociación — Ofertas recibidas ({ofertas.length})</h3>
          {cargandoDetalle ? (
            <p style={{ color: '#999' }}>Cargando...</p>
          ) : ofertas.length === 0 ? (
            <p style={{ color: '#999' }}>No se recibieron ofertas para este servicio</p>
          ) : (
            <table>
              <thead>
                <tr><th>Conductor</th><th>Placa</th><th>Monto ofertado</th><th>Mensaje</th><th>Estado</th><th>Fecha</th></tr>
              </thead>
              <tbody>
                {ofertas.map((o, i) => (
                  <tr key={o.id || i} style={o.aceptada ? { backgroundColor: '#E8F5E9' } : {}}>
                    <td><strong>{o.conductorNombre}</strong></td>
                    <td style={{ color: '#FFC107', fontWeight: 'bold' }}>{o.conductorPlaca || '—'}</td>
                    <td style={{ fontWeight: 'bold', color: '#2E7D32' }}>${(o.monto || 0).toLocaleString('es-CO')}</td>
                    <td style={{ fontSize: 13, color: '#666' }}>{o.mensaje || '—'}</td>
                    <td>
                      {o.aceptada ? (
                        <span style={{ background: '#2E7D32', color: '#fff', padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 'bold' }}>✅ ACEPTADA</span>
                      ) : (
                        <span style={{ background: '#eee', color: '#666', padding: '3px 10px', borderRadius: 10, fontSize: 11 }}>Pendiente</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{o.creadoEn ? new Date(o.creadoEn).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Chat */}
        <div style={estilos.seccionDetalle}>
          <h3>💬 Chat del servicio ({chat.length} mensajes)</h3>
          {cargandoDetalle ? (
            <p style={{ color: '#999' }}>Cargando...</p>
          ) : (
            <>
              {chat.length === 0 ? (
                <p style={{ color: '#999' }}>No hay mensajes en este servicio</p>
              ) : (
                <div style={estilos.chatContainer}>
                  {chat.map((msg, i) => (
                    <div key={msg.id || i} style={{
                      ...estilos.chatBurbuja,
                      alignSelf: msg.rol === 'cliente' ? 'flex-start' : msg.rol === 'admin' ? 'center' : 'flex-end',
                      backgroundColor: msg.rol === 'cliente' ? '#E3F2FD' : msg.rol === 'admin' ? '#FFF3E0' : '#E8F5E9',
                      borderColor: msg.rol === 'cliente' ? '#1565C0' : msg.rol === 'admin' ? '#F97316' : '#2E7D32',
                    }}>
                      <span style={estilos.chatNombre}>
                        {msg.rol === 'admin' ? '🛡️ Admin' : msg.rol === 'cliente' ? '👤' : '🚕'} {msg.nombre || msg.rol}
                      </span>
                      <span style={estilos.chatTexto}>{msg.texto}</span>
                      <span style={estilos.chatHora}>
                        {msg.creadoEn ? new Date(msg.creadoEn).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Input para enviar mensaje como admin */}
              <ChatAdminInput servicioId={detalle.id} onMensajeEnviado={() => verDetalle(detalle)} />
            </>
          )}
        </div>

        {/* Requisitos */}
        {detalle.requisitos && detalle.requisitos.length > 0 && (
          <div style={estilos.seccionDetalle}>
            <h3>📋 Requisitos especiales</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {detalle.requisitos.map(r => (
                <span key={r} style={estilos.requisitoChip}>
                  {r === 'maletas' ? '🧳' : r === 'discapacitado' ? '♿' : r === 'bicicleta' ? '🚲' : r === 'aireAcondicionado' ? '❄️' : r === 'mascotas' ? '🐾' : '📋'} {r}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div style={estilos.headerRow}>
        <h2 className="titulo" style={{ marginBottom: 0 }}>Todos los Servicios</h2>
        <button onClick={exportarCSV} style={estilos.btnExportar}>
          📥 Exportar CSV
        </button>
      </div>

      <div className="stats">
        <div className="stat-card"><div className="num">{totales.total}</div><div className="label">Total</div></div>
        <div className="stat-card"><div className="num">{totales.pendientes}</div><div className="label">Pendientes</div></div>
        <div className="stat-card"><div className="num">{totales.completados}</div><div className="label">Completados</div></div>
        <div className="stat-card"><div className="num">{totales.cancelados}</div><div className="label">Cancelados</div></div>
        <div className="stat-card"><div className="num">⭐ {totales.promedio}</div><div className="label">Calificación</div></div>
      </div>

      {/* Filtros */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        {['todos', 'pendiente', 'aceptado', 'conductor_en_sitio', 'completado', 'cancelado'].map(f => (
          <button key={f} onClick={() => setFiltroEstado(f)} style={{
            padding: '8px 18px', borderRadius: 8, border: '2px solid #FFC107',
            background: filtroEstado === f ? '#FFC107' : '#fff',
            fontWeight: 'bold', cursor: 'pointer',
          }}>
            {f === 'conductor_en_sitio' ? 'En sitio' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Cliente</th>
            <th>Conductor</th>
            <th>Origen</th>
            <th>Destino</th>
            <th>Pago</th>
            <th>Tarifa</th>
            <th>Estado</th>
            <th>Pagó</th>
            <th>Calificación</th>
            <th>Fecha</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.length === 0 && (
            <tr><td colSpan="10" style={{ textAlign: 'center', color: '#999' }}>Sin servicios</td></tr>
          )}
          {filtrados.map(s => (
            <tr key={s.id}>
              <td>{s.clienteNombre}</td>
              <td>{s.conductorNombre || '—'}</td>
              <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.origen}
              </td>
              <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {s.destino}
              </td>
              <td>{s.metodoPago?.toUpperCase()}</td>
              <td>
                {s.tarifaEstimada?.tarifaEstimada
                  ? `$${s.tarifaEstimada.tarifaEstimada.toLocaleString('es-CO')}`
                  : '—'}
              </td>
              <td><span className={`badge ${s.estado}`}>{s.estado}</span></td>
              <td>
                {s.estado === 'completado' ? (
                  s.clientePago === true ? <span style={{ color: '#16A34A', fontWeight: 'bold' }}>✅ Sí</span>
                  : s.clientePago === false ? <span style={{ color: '#DC2626', fontWeight: 'bold' }}>❌ No</span>
                  : <span style={{ color: '#999' }}>—</span>
                ) : <span style={{ color: '#999' }}>—</span>}
              </td>
              <td>
                {s.calificacion?.estrellas
                  ? <span title={s.calificacion.comentario || ''}>
                      {'★'.repeat(s.calificacion.estrellas)}{'☆'.repeat(5 - s.calificacion.estrellas)}
                    </span>
                  : '—'}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {new Date(s.creadoEn).toLocaleString('es-CO', {
                  day: '2-digit', month: '2-digit', year: 'numeric',
                  hour: '2-digit', minute: '2-digit', hour12: true,
                })}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => verDetalle(s)} style={estilos.btnVer}>
                    👁️ Ver
                  </button>
                  {!['completado', 'cancelado'].includes(s.estado) && (
                    <button onClick={() => cancelarServicio(s)} style={estilos.btnCancelar}>
                      ❌
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Componente de chat para admin
function ChatAdminInput({ servicioId, onMensajeEnviado }) {
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      await api.post(`/chat/${servicioId}/mensaje`, { texto: texto.trim() });
      setTexto('');
      if (onMensajeEnviado) onMensajeEnviado();
    } catch (err) {
      alert('Error enviando mensaje: ' + (err.response?.data?.error || err.message));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
      <input
        type="text"
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
        placeholder="Escribir mensaje como Admin..."
        style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #E2E8F0', fontSize: 14 }}
        disabled={enviando}
      />
      <button
        onClick={enviar}
        disabled={!texto.trim() || enviando}
        style={{
          background: texto.trim() ? '#F97316' : '#E2E8F0',
          color: '#fff', border: 'none', borderRadius: 10,
          padding: '10px 20px', cursor: texto.trim() ? 'pointer' : 'default',
          fontWeight: 'bold', fontSize: 14,
        }}
      >
        {enviando ? '...' : 'Enviar'}
      </button>
    </div>
  );
}

const estilos = {
  headerRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20,
  },
  btnExportar: {
    background: '#2E7D32', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: 14,
  },
  btnCancelar: {
    background: '#E53935', color: '#fff', border: 'none',
    borderRadius: 6, padding: '6px 10px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: 12,
  },
  btnVer: {
    background: '#1565C0', color: '#fff', border: 'none',
    borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: 12,
  },
  btnVolver: {
    background: 'none', border: 'none', color: '#E53935',
    cursor: 'pointer', fontSize: 15, marginBottom: 16, fontWeight: 'bold',
  },
  estadoBanner: {
    display: 'flex', alignItems: 'center', gap: 12,
    borderRadius: 14, padding: '16px 24px', marginBottom: 20,
  },
  detalleGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: 16, marginBottom: 24,
  },
  detalleCard: {
    background: '#fff', borderRadius: 14, padding: 20,
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
  },
  detalleCardTitulo: { margin: '0 0 12px', fontSize: 15, color: '#333' },
  detalleInfo: { margin: '6px 0', fontSize: 14, color: '#555' },
  seccionDetalle: {
    background: '#fff', borderRadius: 14, padding: 20,
    boxShadow: '0 2px 10px rgba(0,0,0,0.06)', marginBottom: 16,
  },
  chatContainer: {
    display: 'flex', flexDirection: 'column', gap: 8,
    maxHeight: 400, overflowY: 'auto', padding: 10,
    background: '#f9f9f9', borderRadius: 10,
  },
  chatBurbuja: {
    padding: '10px 14px', borderRadius: 12, maxWidth: '70%',
    borderLeft: '3px solid',
  },
  chatNombre: { display: 'block', fontSize: 11, fontWeight: 'bold', color: '#555', marginBottom: 2 },
  chatTexto: { display: 'block', fontSize: 14, color: '#333' },
  chatHora: { display: 'block', fontSize: 10, color: '#999', marginTop: 4, textAlign: 'right' },
  requisitoChip: {
    background: '#E3F2FD', borderRadius: 20, padding: '6px 14px',
    fontSize: 13, fontWeight: '600', color: '#1565C0',
  },
  mapaBadge: {
    background: '#f5f5f5', borderRadius: 20, padding: '6px 14px',
    fontSize: 13, fontWeight: '600', color: '#333',
  },
};
