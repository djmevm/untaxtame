import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';

// Ícono de taxi con placa
function crearIconoTaxi(nombre, placa, sinGPS) {
  const primerNombre = nombre?.split(' ')[0] || '';
  const primerApellido = nombre?.split(' ').slice(1).find(p => p.length > 2) || nombre?.split(' ')[1] || '';
  const nombreDisplay = primerApellido ? `${primerNombre} ${primerApellido}` : primerNombre;
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))">
      <div style="font-size:32px;text-shadow:0 1px 3px rgba(0,0,0,0.3)">🚕</div>
      <div style="background:#FFC107;color:#000;font-weight:bold;font-size:11px;padding:4px 10px;border-radius:6px;white-space:nowrap;margin-top:-2px;border:2px solid #F57F17;box-shadow:0 1px 4px rgba(0,0,0,0.2)">${nombreDisplay}</div>
      <div style="background:#000;color:#FFC107;font-weight:bold;font-size:11px;padding:3px 8px;border-radius:4px;margin-top:3px;letter-spacing:2px;border:1px solid #FFC107;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${placa || '---'}</div>
    </div>`,
    iconSize: [120, 75],
    iconAnchor: [60, 75],
  });
}

// Ícono de cliente con placa del conductor asignado
function crearIconoCliente(nombre, placa) {
  const primerNombre = nombre?.split(' ')[0] || 'Cliente';
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center">
      <div style="font-size:24px">👤</div>
      <div style="background:#1565C0;color:#fff;font-weight:bold;font-size:9px;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-top:-2px">${primerNombre}</div>
      ${placa ? `<div style="background:#E53935;color:#fff;font-weight:bold;font-size:8px;padding:1px 5px;border-radius:3px;margin-top:2px">🚗 ${placa}</div>` : ''}
    </div>`,
    iconSize: [80, 65],
    iconAnchor: [40, 65],
  });
}

function CentrarMapa({ centro }) {
  const map = useMap();
  useEffect(() => {
    if (centro) map.setView(centro, 14);
  }, []);
  return null;
}

export default function MapaUbicaciones() {
  const [conductores, setConductores] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [reporteGPS, setReporteGPS] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  const cargar = async () => {
    try {
      const [ubiRes, srvRes] = await Promise.all([
        api.get('/users/conductores/ubicaciones'),
        api.get('/services/todos').catch(() => ({ data: [] })),
      ]);
      const todos = ubiRes.data || [];
      setConductores(todos.filter(c => c.ubicacionActual?.lat));

      // Servicios activos
      setServicios((srvRes.data || []).filter(s =>
        ['pendiente', 'aceptado', 'en_curso', 'conductor_en_sitio'].includes(s.estado)
      ));

      // GPS perdido: sin ubicación o más de 30 min sin actualizar
      const sinGPS = todos.filter(c => {
        if (!c.ubicacionActual?.lat) return !!c.ultimaUbicacion?.lat;
        if (!c.ubicacionActual?.actualizadoEn) return false;
        const mins = (Date.now() - new Date(c.ubicacionActual.actualizadoEn).getTime()) / 60000;
        return mins > 30;
      });
      setReporteGPS(sinGPS);
      setUltimaActualizacion(new Date());
    } catch {}
    finally { setCargando(false); }
  };

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 60000);
    return () => clearInterval(intervalo);
  }, []);

  if (cargando) return <p className="loading">Cargando mapa...</p>;

  const centro = conductores.length > 0
    ? [conductores[0].ubicacionActual.lat, conductores[0].ubicacionActual.lng]
    : [6.4531, -71.4353];

  // Servicios con cliente que tiene GPS
  const serviciosConGPS = servicios.filter(s => s.ubicacionGPS?.lat);

  return (
    <div>
      <h2 className="titulo">🗺️ Mapa de Ubicaciones</h2>
      <p style={{ color: '#666', marginBottom: 16 }}>
        Se actualiza cada 60 segundos. Última actualización: {ultimaActualizacion ? ultimaActualizacion.toLocaleTimeString('es-CO') : '—'}
      </p>

      <div className="stats">
        <div className="stat-card">
          <div className="num" style={{ color: '#FFC107' }}>{conductores.length}</div>
          <div className="label">🚕 Con GPS activo</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#1565C0' }}>{servicios.length}</div>
          <div className="label">📋 Servicios activos</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#E53935' }}>{reporteGPS.length}</div>
          <div className="label">⚠️ GPS perdido</div>
        </div>
      </div>

      {/* ═══ SERVICIOS ACTIVOS CON CLIENTES (PRIORIDAD ARRIBA) ═══ */}
      {servicios.length > 0 && (
        <>
          <h3 style={{ marginBottom: 12 }}>📋 Servicios activos ({servicios.length})</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
            <thead>
              <tr style={{ background: '#E3F2FD' }}>
                <th style={th}>👤 Cliente</th>
                <th style={th}>📍 Origen</th>
                <th style={th}>🏁 Destino</th>
                <th style={th}>🚕 Conductor</th>
                <th style={th}>🚗 Placa</th>
                <th style={th}>💰 Pago</th>
                <th style={th}>Estado</th>
              </tr>
            </thead>
            <tbody>
              {servicios.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={td}><strong>{s.clienteNombre}</strong></td>
                  <td style={td}>{s.origen}</td>
                  <td style={td}>{s.destino}</td>
                  <td style={td}>{s.conductorNombre || <span style={{ color: '#F97316' }}>Buscando...</span>}</td>
                  <td style={td}><span style={{ color: '#FFC107', fontWeight: 'bold' }}>{s.conductorPlaca || '—'}</span></td>
                  <td style={td}>{s.metodoPago?.toUpperCase()}</td>
                  <td style={td}>
                    <span style={{ background: s.estado === 'pendiente' ? '#FFF3E0' : '#E8F5E9', color: s.estado === 'pendiente' ? '#F57F17' : '#2E7D32', padding: '3px 8px', borderRadius: 6, fontSize: 11, fontWeight: 'bold' }}>
                      {s.estado === 'pendiente' ? '🔍 Pendiente' : s.estado === 'aceptado' ? '🚕 En camino' : s.estado === 'conductor_en_sitio' ? '📍 En sitio' : '🚗 En curso'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* ═══ MAPA ═══ */}
      <div style={{ marginBottom: 24, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
        <MapContainer center={centro} zoom={15} style={{ height: 600, borderRadius: 16 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
          <CentrarMapa centro={centro} />

          {/* Conductores */}
          {conductores.map(c => (
            <Marker key={c.uid} position={[c.ubicacionActual.lat, c.ubicacionActual.lng]} icon={crearIconoTaxi(c.nombre, c.placa, false)}>
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>🚕 {c.nombre}</strong><br />
                  <span style={{ color: '#FFC107', fontWeight: 'bold' }}>{c.placa}</span><br />
                  <span style={{ fontSize: 12 }}>📞 {c.telefono || '—'}</span><br />
                  <span style={{ fontSize: 11, color: '#aaa' }}>
                    Actualizado: {c.ubicacionActual?.actualizadoEn ? new Date(c.ubicacionActual.actualizadoEn).toLocaleTimeString('es-CO') : '—'}
                  </span><br />
                  <a href={`https://www.google.com/maps?q=${c.ubicacionActual.lat},${c.ubicacionActual.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>🗺️ Google Maps</a>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Clientes con servicio activo + placa del conductor */}
          {serviciosConGPS.map(s => (
            <Marker key={s.id} position={[s.ubicacionGPS.lat, s.ubicacionGPS.lng]} icon={crearIconoCliente(s.clienteNombre, s.conductorPlaca)}>
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>👤 {s.clienteNombre}</strong><br />
                  <span style={{ fontSize: 12 }}>📍 {s.origen}</span><br />
                  <span style={{ fontSize: 12 }}>🏁 {s.destino}</span><br />
                  {s.conductorNombre && <span style={{ fontSize: 12, color: '#E53935' }}>🚕 {s.conductorNombre} | 🚗 {s.conductorPlaca}</span>}<br />
                  <span style={{ fontSize: 11, color: '#888' }}>{s.estado}</span>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* GPS perdido - solo en tabla abajo, no en mapa */}
        </MapContainer>
      </div>

      {/* ═══ CONDUCTORES ACTIVOS ═══ */}
      <h3 style={{ marginTop: 24, marginBottom: 12 }}>🚕 Conductores con GPS activo ({conductores.length})</h3>
      {conductores.length === 0 ? (
        <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>No hay conductores con GPS activo</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
          <thead>
            <tr style={{ background: '#FFF8E1' }}>
              <th style={th}>Conductor</th>
              <th style={th}>Placa</th>
              <th style={th}>Coordenadas</th>
              <th style={th}>Actualizado</th>
              <th style={th}>Mapa</th>
            </tr>
          </thead>
          <tbody>
            {conductores.map(c => (
              <tr key={c.uid} style={{ borderBottom: '1px solid #eee' }}>
                <td style={td}>{c.nombre}</td>
                <td style={td}><span style={{ color: '#FFC107', fontWeight: 'bold' }}>{c.placa}</span></td>
                <td style={td}>{c.ubicacionActual.lat.toFixed(5)}, {c.ubicacionActual.lng.toFixed(5)}</td>
                <td style={td}>{c.ubicacionActual.actualizadoEn ? new Date(c.ubicacionActual.actualizadoEn).toLocaleTimeString('es-CO') : '—'}</td>
                <td style={td}>
                  <a href={`https://www.google.com/maps?q=${c.ubicacionActual.lat},${c.ubicacionActual.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: '#1565C0', textDecoration: 'none', fontWeight: 'bold' }}>📍 Ver</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* ═══ REPORTE GPS PERDIDO (AL FINAL) ═══ */}
      <h3 style={{ marginTop: 24, marginBottom: 12, color: '#E53935' }}>⚠️ Reporte GPS perdido ({reporteGPS.length})</h3>
      {reporteGPS.length === 0 ? (
        <p style={{ color: '#2E7D32', textAlign: 'center', padding: 20 }}>✅ Todos los conductores tienen GPS activo</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FFEBEE' }}>
              <th style={th}>Conductor</th>
              <th style={th}>Placa</th>
              <th style={th}>Última ubicación</th>
              <th style={th}>Última señal</th>
              <th style={th}>Hace</th>
              <th style={th}>Acción</th>
            </tr>
          </thead>
          <tbody>
            {reporteGPS.map(c => {
              const ubi = c.ubicacionActual?.lat ? c.ubicacionActual : c.ultimaUbicacion;
              const ultima = ubi?.actualizadoEn ? new Date(ubi.actualizadoEn) : null;
              const minutos = ultima ? Math.round((Date.now() - ultima.getTime()) / 60000) : '?';
              return (
                <tr key={c.uid} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={td}><strong>{c.nombre}</strong></td>
                  <td style={td}><span style={{ color: '#E53935', fontWeight: 'bold' }}>{c.placa}</span></td>
                  <td style={td}>{ubi ? `${ubi.lat.toFixed(5)}, ${ubi.lng.toFixed(5)}` : 'Desconocida'}</td>
                  <td style={td}>{ultima ? ultima.toLocaleString('es-CO') : '—'}</td>
                  <td style={td}><span style={{ color: '#E53935', fontWeight: 'bold' }}>{minutos} min</span></td>
                  <td style={td}>
                    {ubi && (
                      <a href={`https://www.google.com/maps?q=${ubi.lat},${ubi.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: '#1565C0', fontWeight: 'bold', textDecoration: 'none' }}>📍 Ver</a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: 13, fontWeight: 'bold' };
const td = { padding: '8px 12px', fontSize: 13 };
