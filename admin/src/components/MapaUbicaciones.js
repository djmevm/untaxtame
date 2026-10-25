import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';

const CENTRO_TAME = [6.46125, -71.73426];
// Radio del casco urbano de Tame (~2.5 km). Fuera de esto = zona rural.
const RADIO_URBANO_KM = 2.5;

// Distancia Haversine en km
function distanciaKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function esUrbano(lat, lng) {
  return distanciaKm(lat, lng, CENTRO_TAME[0], CENTRO_TAME[1]) <= RADIO_URBANO_KM;
}

// Ícono de taxi con indicador de zona (urbano/rural) o GPS perdido
function iconoTaxi(nombre, placa, zona) {
  const n = (nombre || '').split(' ')[0];
  const colorZona = zona === 'rural' ? '#E65100' : zona === 'perdido' ? '#9E9E9E' : '#2E7D32';
  const etiquetaZona = zona === 'rural' ? '🌄 RURAL' : zona === 'perdido' ? '⚠️ SIN GPS' : '🏙️ URBANO';
  const opacidad = zona === 'perdido' ? 'opacity:0.55;' : '';
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center;${opacidad}">
      <div style="font-size:30px">🚕</div>
      <div style="background:#FFC107;color:#000;font-weight:bold;font-size:10px;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-top:-4px">${n}</div>
      <div style="background:#000;color:#FFC107;font-weight:bold;font-size:9px;padding:1px 5px;border-radius:3px;margin-top:2px;letter-spacing:1px">${placa || '---'}</div>
      <div style="background:${colorZona};color:#fff;font-weight:bold;font-size:8px;padding:1px 5px;border-radius:3px;margin-top:2px">${etiquetaZona}</div>
    </div>`,
    iconSize: [100, 72], iconAnchor: [50, 72],
  });
}

function iconoCliente(nombre, placa) {
  const n = (nombre || 'Cliente').split(' ')[0];
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center">
      <div style="font-size:24px">👤</div>
      <div style="background:#1565C0;color:#fff;font-weight:bold;font-size:9px;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-top:-2px">${n}</div>
      ${placa ? `<div style="background:#E53935;color:#fff;font-weight:bold;font-size:8px;padding:1px 5px;border-radius:3px;margin-top:2px">🚗 ${placa}</div>` : ''}
    </div>`,
    iconSize: [80, 65], iconAnchor: [40, 65],
  });
}

function CentrarMapa({ centro }) {
  const map = useMap();
  useEffect(() => { if (centro) map.setView(centro, 14); }, []); // solo al montar
  return null;
}

export default function MapaUbicaciones() {
  const [conductores, setConductores] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [reporteGPS, setReporteGPS] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [enVivo, setEnVivo] = useState(true); // botón activar/desactivar
  // Capas visibles
  const [capas, setCapas] = useState({ conductores: true, clientes: true, urbano: true, rural: true, perdido: true });
  const intervaloRef = useRef(null);

  const cargar = async () => {
    try {
      const [ubiRes, srvRes] = await Promise.all([
        api.get('/users/conductores/ubicaciones'),
        api.get('/services/todos').catch(() => ({ data: [] })),
      ]);
      const todos = ubiRes.data || [];
      const ahora = Date.now();

      const conGPSReciente = todos.filter(c => {
        if (!c.ubicacionActual?.lat) return false;
        if (!c.ubicacionActual?.actualizadoEn) return true;
        const mins = (ahora - new Date(c.ubicacionActual.actualizadoEn).getTime()) / 60000;
        return mins <= 30;
      });
      setConductores(conGPSReciente);

      setServicios((srvRes.data || []).filter(s =>
        ['pendiente', 'aceptado', 'en_curso', 'conductor_en_sitio'].includes(s.estado)
      ));

      const sinGPS = todos.filter(c => {
        if (!c.ubicacionActual?.lat && !c.ultimaUbicacion?.lat) return false;
        if (!c.ubicacionActual?.lat) return !!c.ultimaUbicacion?.lat;
        if (!c.ubicacionActual?.actualizadoEn) return false;
        const mins = (ahora - new Date(c.ubicacionActual.actualizadoEn).getTime()) / 60000;
        return mins > 30;
      });
      setReporteGPS(sinGPS);
      setUltimaActualizacion(new Date());
    } catch {}
    finally { setCargando(false); }
  };

  // Control de actualización en tiempo real (activar/desactivar)
  useEffect(() => {
    cargar();
    if (enVivo) {
      intervaloRef.current = setInterval(cargar, 5000);
    }
    return () => { if (intervaloRef.current) clearInterval(intervaloRef.current); };
  }, [enVivo]);

  if (cargando) return <p className="loading">Cargando mapa...</p>;

  const centro = conductores.length > 0
    ? [conductores[0].ubicacionActual.lat, conductores[0].ubicacionActual.lng]
    : CENTRO_TAME;

  const serviciosConGPS = servicios.filter(s => s.ubicacionGPS?.lat);

  // Clasificar conductores por zona
  const conZona = conductores.map(c => ({
    ...c,
    zona: esUrbano(c.ubicacionActual.lat, c.ubicacionActual.lng) ? 'urbano' : 'rural',
  }));
  const nUrbano = conZona.filter(c => c.zona === 'urbano').length;
  const nRural = conZona.filter(c => c.zona === 'rural').length;

  const toggleCapa = (k) => setCapas(p => ({ ...p, [k]: !p[k] }));

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="titulo" style={{ marginBottom: 0 }}>🗺️ Mapa de Conductores</h2>
        <button onClick={() => setEnVivo(v => !v)} style={{
          background: enVivo ? '#2E7D32' : '#B71C1C', color: '#fff', border: 'none',
          borderRadius: 20, padding: '8px 18px', fontWeight: 'bold', cursor: 'pointer', fontSize: 13,
        }}>
          {enVivo ? '⏸️ Pausar tiempo real' : '▶️ Activar tiempo real'}
        </button>
      </div>
      <p style={{ color: '#666', marginTop: 6, marginBottom: 16 }}>
        {enVivo
          ? `🟢 Actualizando cada 5s · Última: ${ultimaActualizacion ? ultimaActualizacion.toLocaleTimeString('es-CO') : '—'}`
          : '⏸️ Actualización en pausa (toca "Activar" para reanudar)'}
      </p>

      <div className="stats">
        <div className="stat-card"><div className="num" style={{ color: '#FFC107' }}>{conductores.length}</div><div className="label">🚕 Con GPS activo</div></div>
        <div className="stat-card"><div className="num" style={{ color: '#2E7D32' }}>{nUrbano}</div><div className="label">🏙️ En casco urbano</div></div>
        <div className="stat-card"><div className="num" style={{ color: '#E65100' }}>{nRural}</div><div className="label">🌄 En zona rural</div></div>
        <div className="stat-card"><div className="num" style={{ color: '#E53935' }}>{reporteGPS.length}</div><div className="label">⚠️ GPS perdido</div></div>
      </div>

      {/* Filtros de capas */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {[
          { k: 'conductores', l: '🚕 Conductores' },
          { k: 'clientes', l: '👤 Clientes' },
          { k: 'urbano', l: '🏙️ Urbano' },
          { k: 'rural', l: '🌄 Rural' },
          { k: 'perdido', l: '⚠️ GPS perdido' },
        ].map(f => (
          <button key={f.k} onClick={() => toggleCapa(f.k)} style={{
            padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold', fontSize: 12,
            border: `2px solid ${capas[f.k] ? '#FFC107' : '#ccc'}`,
            background: capas[f.k] ? '#FFF8E1' : '#f5f5f5', color: capas[f.k] ? '#333' : '#999',
          }}>{capas[f.k] ? '✅ ' : '⬜ '}{f.l}</button>
        ))}
      </div>

      <div style={{ marginBottom: 24, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}>
        <MapContainer center={centro} zoom={14} style={{ height: 600 }}>
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
          <CentrarMapa centro={centro} />

          {/* Círculo del casco urbano de Tame */}
          <Circle center={CENTRO_TAME} radius={RADIO_URBANO_KM * 1000}
            pathOptions={{ color: '#1565C0', fillColor: '#1565C0', fillOpacity: 0.05, weight: 1, dashArray: '6 6' }} />

          {/* Conductores con GPS activo (urbano/rural) */}
          {capas.conductores && conZona
            .filter(c => (c.zona === 'urbano' && capas.urbano) || (c.zona === 'rural' && capas.rural))
            .map(c => (
              <Marker key={c.uid} position={[c.ubicacionActual.lat, c.ubicacionActual.lng]} icon={iconoTaxi(c.nombre, c.placa, c.zona)}>
                <Popup>
                  <strong>🚕 {c.nombre}</strong><br />
                  <span style={{ color: '#FFC107', fontWeight: 'bold', letterSpacing: 2 }}>{c.placa}</span><br />
                  <span style={{ color: c.zona === 'rural' ? '#E65100' : '#2E7D32', fontWeight: 'bold' }}>
                    {c.zona === 'rural' ? '🌄 Zona rural' : '🏙️ Casco urbano'}
                  </span><br />
                  📞 {c.telefono || '—'}<br />
                  <span style={{ fontSize: 11, color: '#aaa' }}>
                    Actualizado: {c.ubicacionActual?.actualizadoEn ? new Date(c.ubicacionActual.actualizadoEn).toLocaleTimeString('es-CO') : '—'}
                  </span><br />
                  <a href={`https://www.google.com/maps?q=${c.ubicacionActual.lat},${c.ubicacionActual.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>🗺️ Google Maps</a>
                </Popup>
              </Marker>
            ))}

          {/* Conductores con GPS perdido — último punto conocido */}
          {capas.perdido && reporteGPS.map(c => {
            const ubi = c.ubicacionActual?.lat ? c.ubicacionActual : c.ultimaUbicacion;
            if (!ubi?.lat) return null;
            return (
              <Marker key={`perdido-${c.uid}`} position={[ubi.lat, ubi.lng]} icon={iconoTaxi(c.nombre, c.placa, 'perdido')}>
                <Popup>
                  <strong>🚕 {c.nombre}</strong><br />
                  <span style={{ color: '#9E9E9E', fontWeight: 'bold' }}>⚠️ GPS/conexión perdida</span><br />
                  Última señal: {ubi.actualizadoEn ? new Date(ubi.actualizadoEn).toLocaleString('es-CO') : '—'}<br />
                  <span style={{ fontSize: 11, color: '#aaa' }}>Este es el último punto conocido.</span>
                </Popup>
              </Marker>
            );
          })}

          {/* Clientes con servicio activo */}
          {capas.clientes && serviciosConGPS.map(s => (
            <Marker key={s.id} position={[s.ubicacionGPS.lat, s.ubicacionGPS.lng]} icon={iconoCliente(s.clienteNombre, s.conductorPlaca)}>
              <Popup>
                <strong>👤 {s.clienteNombre}</strong><br />
                📍 {s.origen}<br />🏁 {s.destino}<br />
                {s.conductorNombre && <span style={{ fontSize: 12, color: '#E53935' }}>🚕 {s.conductorNombre} · {s.conductorPlaca}</span>}<br />
                <span style={{ fontSize: 11, color: '#888' }}>{s.estado}</span>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Reporte GPS perdido con hora */}
      <h3 style={{ marginTop: 8, marginBottom: 12, color: '#E53935' }}>⚠️ Conductores con GPS/conexión perdida ({reporteGPS.length})</h3>
      {reporteGPS.length === 0 ? (
        <p style={{ color: '#2E7D32', textAlign: 'center', padding: 20 }}>✅ Todos los conductores activos tienen GPS</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FFEBEE' }}>
              <th style={th}>Conductor</th><th style={th}>Placa</th><th style={th}>Último punto</th><th style={th}>Última señal</th><th style={th}>Hace</th><th style={th}>Mapa</th>
            </tr>
          </thead>
          <tbody>
            {reporteGPS.map(c => {
              const ubi = c.ubicacionActual?.lat ? c.ubicacionActual : c.ultimaUbicacion;
              const ultima = ubi?.actualizadoEn ? new Date(ubi.actualizadoEn) : null;
              const minutos = ultima ? Math.round((Date.now() - ultima.getTime()) / 60000) : '?';
              const zona = ubi?.lat ? (esUrbano(ubi.lat, ubi.lng) ? '🏙️ Urbano' : '🌄 Rural') : '—';
              return (
                <tr key={c.uid} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={td}><strong>{c.nombre}</strong></td>
                  <td style={td}><span style={{ color: '#E53935', fontWeight: 'bold' }}>{c.placa}</span></td>
                  <td style={td}>{zona}</td>
                  <td style={td}>{ultima ? ultima.toLocaleString('es-CO') : '—'}</td>
                  <td style={td}><span style={{ color: '#E53935', fontWeight: 'bold' }}>{minutos} min</span></td>
                  <td style={td}>
                    {ubi?.lat && <a href={`https://www.google.com/maps?q=${ubi.lat},${ubi.lng}`} target="_blank" rel="noopener noreferrer" style={{ color: '#1565C0', fontWeight: 'bold', textDecoration: 'none' }}>📍 Ver</a>}
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
