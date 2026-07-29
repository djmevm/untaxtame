import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';

// Ícono de taxi
function crearIconoTaxi(nombre, placa, sinGPS) {
  const primerNombre = nombre?.split(' ')[0] || '';
  const color = sinGPS ? '#9E9E9E' : '#FFC107';
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center">
      <div style="font-size:26px">${sinGPS ? '⚠️' : '🚕'}</div>
      <div style="background:${color};color:#000;font-weight:bold;font-size:9px;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-top:-2px">${primerNombre}</div>
      <div style="background:#333;color:${color};font-weight:bold;font-size:8px;padding:1px 5px;border-radius:3px;margin-top:2px">${placa || '---'}</div>
    </div>`,
    iconSize: [80, 60],
    iconAnchor: [40, 60],
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
  const [reporteGPS, setReporteGPS] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

  const cargar = async () => {
    try {
      const res = await api.get('/users/conductores/ubicaciones');
      const todos = res.data || [];
      setConductores(todos.filter(c => c.ubicacionActual?.lat));

      // Detectar conductores que perdieron GPS (tenían ubicación antes pero ya no)
      const sinGPS = todos.filter(c => !c.ubicacionActual?.lat && c.ultimaUbicacion?.lat);
      const conGPSViejo = todos.filter(c => {
        if (!c.ubicacionActual?.actualizadoEn) return false;
        const mins = (Date.now() - new Date(c.ubicacionActual.actualizadoEn).getTime()) / 60000;
        return mins > 5; // Más de 5 minutos sin actualizar
      });

      setReporteGPS([...sinGPS, ...conGPSViejo]);
      setUltimaActualizacion(new Date());
    } catch {}
    finally { setCargando(false); }
  };

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 60000); // Cada 1 minuto
    return () => clearInterval(intervalo);
  }, []);

  if (cargando) return <p className="loading">Cargando mapa...</p>;

  const centro = conductores.length > 0
    ? [conductores[0].ubicacionActual.lat, conductores[0].ubicacionActual.lng]
    : [6.4531, -71.4353]; // Tame, Arauca

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
          <div className="num" style={{ color: '#E53935' }}>{reporteGPS.length}</div>
          <div className="label">⚠️ GPS perdido</div>
        </div>
      </div>

      <div style={{ marginBottom: 24, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
        <MapContainer center={centro} zoom={14} style={{ height: 500, borderRadius: 16 }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          <CentrarMapa centro={centro} />

          {conductores.map(c => (
            <Marker
              key={c.uid}
              position={[c.ubicacionActual.lat, c.ubicacionActual.lng]}
              icon={crearIconoTaxi(c.nombre, c.placa, false)}
            >
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

          {/* Mostrar última ubicación conocida de los que perdieron GPS */}
          {reporteGPS.filter(c => c.ubicacionActual?.lat || c.ultimaUbicacion?.lat).map(c => {
            const ubi = c.ubicacionActual?.lat ? c.ubicacionActual : c.ultimaUbicacion;
            return (
              <Marker
                key={c.uid + '-lost'}
                position={[ubi.lat, ubi.lng]}
                icon={crearIconoTaxi(c.nombre, c.placa, true)}
              >
                <Popup>
                  <div style={{ textAlign: 'center' }}>
                    <strong>⚠️ {c.nombre}</strong><br />
                    <span style={{ color: '#E53935', fontWeight: 'bold' }}>GPS PERDIDO</span><br />
                    <span style={{ fontSize: 12 }}>{c.placa}</span><br />
                    <span style={{ fontSize: 11, color: '#aaa' }}>
                      Última señal: {ubi.actualizadoEn ? new Date(ubi.actualizadoEn).toLocaleString('es-CO') : '—'}
                    </span><br />
                    <a href={`https://www.google.com/maps?q=${ubi.lat},${ubi.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>🗺️ Última ubicación</a>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      {/* Reporte de GPS perdido */}
      <h3 style={{ marginTop: 24, marginBottom: 16, color: '#E53935' }}>⚠️ Reporte GPS perdido</h3>
      {reporteGPS.length === 0 ? (
        <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>✅ Todos los conductores tienen GPS activo</p>
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
                      <a href={`https://www.google.com/maps?q=${ubi.lat},${ubi.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: '#1565C0', fontWeight: 'bold', textDecoration: 'none' }}>
                        📍 Ver
                      </a>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Lista de todos los conductores con ubicación */}
      <h3 style={{ marginTop: 24, marginBottom: 16 }}>🚕 Todos los conductores ({conductores.length})</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
                <a href={`https://www.google.com/maps?q=${c.ubicacionActual.lat},${c.ubicacionActual.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: '#1565C0', textDecoration: 'none' }}>
                  🗺️ Ver
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = { padding: '10px 12px', textAlign: 'left', fontSize: 13, fontWeight: 'bold' };
const td = { padding: '8px 12px', fontSize: 13 };
