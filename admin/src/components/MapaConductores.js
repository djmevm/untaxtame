import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';

// ═══ WEBSOCKET EN TIEMPO REAL ═══
const WS_URL = 'wss://untaxtame-production.up.railway.app/ws';

// Ícono de taxi
function crearIconoTaxi(nombre, placa, enCarrera) {
  const primerNombre = nombre?.split(' ')[0] || '';
  const primerApellido = nombre?.split(' ').slice(1).find(p => p.length > 2) || nombre?.split(' ')[1] || '';
  const borderColor = enCarrera ? '#E53935' : '#FFC107';
  const statusDot = enCarrera ? '<div style="position:absolute;top:-2px;right:-2px;width:10px;height:10px;background:#E53935;border-radius:50%;border:2px solid #fff;animation:pulse 1s infinite"></div>' : '';
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center;position:relative">
      ${statusDot}
      <div style="font-size:28px">🚕</div>
      <div style="background:${borderColor};color:#000;font-weight:bold;font-size:9px;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-top:-2px">${primerNombre} ${primerApellido}</div>
      <div style="background:#333;color:${borderColor};font-weight:bold;font-size:8px;padding:1px 5px;border-radius:3px;margin-top:2px">${placa || '---'}</div>
    </div>`,
    iconSize: [80, 60],
    iconAnchor: [40, 60],
  });
}

// Ícono de cliente
function crearIconoCliente(nombre) {
  const primerNombre = nombre?.split(' ')[0] || 'Cliente';
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center">
      <div style="font-size:26px">👤</div>
      <div style="background:#1565C0;color:#fff;font-weight:bold;font-size:9px;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-top:-2px">${primerNombre}</div>
    </div>`,
    iconSize: [80, 50],
    iconAnchor: [40, 50],
  });
}

function CentrarMapa({ centro }) {
  const map = useMap();
  useEffect(() => {
    if (centro) map.setView(centro, 14);
  }, []);
  return null;
}

export default function MapaConductores() {
  const [conductores, setConductores] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [wsConectado, setWsConectado] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const wsRef = useRef(null);
  const conductoresRef = useRef(new Map());

  // Cargar servicios activos (HTTP)
  const cargarServicios = async () => {
    try {
      const sRes = await api.get('/services/todos');
      setServicios((sRes.data || []).filter(s =>
        ['pendiente', 'aceptado', 'en_curso', 'conductor_en_sitio'].includes(s.estado) && s.ubicacionGPS?.lat
      ));
    } catch {}
    finally { setCargando(false); }
  };

  // Conectar WebSocket para ubicaciones en tiempo real
  useEffect(() => {
    cargarServicios();
    const intervaloServicios = setInterval(cargarServicios, 15000);

    // WebSocket
    const conectarWS = () => {
      const ws = new WebSocket(`${WS_URL}?uid=admin-mapa&rol=admin`);

      ws.onopen = () => {
        setWsConectado(true);
        console.log('[Mapa WS] Conectado - rastreo en tiempo real activo');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.tipo === 'ubicaciones_conductores' && data.conductores) {
            // Actualizar posiciones en tiempo real
            data.conductores.forEach(c => {
              conductoresRef.current.set(c.uid, {
                uid: c.uid,
                lat: c.lat,
                lng: c.lng,
                nombre: c.nombre || '',
                placa: c.placa || '',
                timestamp: c.timestamp || Date.now(),
              });
            });

            // Convertir Map a array para render
            setConductores(Array.from(conductoresRef.current.values()));
            setUltimaActualizacion(new Date());
          }
        } catch {}
      };

      ws.onclose = () => {
        setWsConectado(false);
        // Reconectar en 3 segundos
        setTimeout(conectarWS, 3000);
      };

      ws.onerror = () => {};
      wsRef.current = ws;
    };

    conectarWS();

    return () => {
      clearInterval(intervaloServicios);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // Determinar qué conductores están en carrera
  const conductoresEnCarrera = new Set();
  servicios.forEach(s => {
    if (s.conductorUid && ['aceptado', 'en_curso', 'conductor_en_sitio'].includes(s.estado)) {
      conductoresEnCarrera.add(s.conductorUid);
    }
  });

  if (cargando) return <p className="loading">Cargando mapa...</p>;

  const centro = conductores.length > 0
    ? [conductores[0].lat, conductores[0].lng]
    : servicios.length > 0
      ? [servicios[0].ubicacionGPS.lat, servicios[0].ubicacionGPS.lng]
      : [6.4531, -71.4353]; // Tame, Arauca

  return (
    <div>
      <h2 className="titulo">📍 Rastreo en Tiempo Real</h2>

      <div className="stats">
        <div className="stat-card">
          <div className="num" style={{ color: '#FFC107' }}>{conductores.length}</div>
          <div className="label">🚕 Conductores activos</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#E53935' }}>{conductoresEnCarrera.size}</div>
          <div className="label">🔴 En carrera</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#1565C0' }}>{servicios.length}</div>
          <div className="label">👤 Clientes activos</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: wsConectado ? '#2E7D32' : '#E53935', fontSize: 14 }}>
            {wsConectado ? '🟢 EN VIVO' : '🔴 DESCONECTADO'}
          </div>
          <div className="label">
            {ultimaActualizacion ? `⏱️ ${ultimaActualizacion.toLocaleTimeString('es-CO')}` : 'Esperando datos...'}
          </div>
        </div>
      </div>

      <div style={estilos.mapaContainer}>
        <MapContainer center={centro} zoom={14} style={{ height: 550, borderRadius: 16 }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          <CentrarMapa centro={centro} />

          {/* Conductores en tiempo real */}
          {conductores.map(c => (
            <Marker
              key={c.uid}
              position={[c.lat, c.lng]}
              icon={crearIconoTaxi(c.nombre, c.placa, conductoresEnCarrera.has(c.uid))}
            >
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>🚕 {c.nombre}</strong><br />
                  <span style={{ color: '#FFC107', fontWeight: 'bold', letterSpacing: 2 }}>{c.placa}</span><br />
                  {conductoresEnCarrera.has(c.uid) && (
                    <span style={{ color: '#E53935', fontWeight: 'bold', fontSize: 12 }}>🔴 EN CARRERA</span>
                  )}<br />
                  <span style={{ fontSize: 11, color: '#aaa' }}>
                    📍 {c.lat.toFixed(5)}, {c.lng.toFixed(5)}
                  </span><br />
                  <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12 }}>
                    🗺️ Ver en Google Maps
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Clientes con servicio activo */}
          {servicios.map(s => (
            <Marker
              key={s.id}
              position={[s.ubicacionGPS.lat, s.ubicacionGPS.lng]}
              icon={crearIconoCliente(s.clienteNombre)}
            >
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>👤 {s.clienteNombre}</strong><br />
                  <span style={{ fontSize: 12 }}>📍 {s.origen}</span><br />
                  <span style={{ fontSize: 12 }}>🏁 {s.destino}</span><br />
                  <span style={{ fontSize: 11, color: '#888' }}>Estado: {s.estado}</span><br />
                  {s.conductorNombre && (
                    <span style={{ fontSize: 11, color: '#E53935' }}>🚕 {s.conductorNombre} ({s.conductorPlaca})</span>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Lista de conductores en carrera */}
      <h3 style={{ marginTop: 24, marginBottom: 16 }}>🔴 Conductores en carrera (rastreo activo)</h3>
      {conductores.filter(c => conductoresEnCarrera.has(c.uid)).length === 0 ? (
        <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>No hay conductores en carrera en este momento</p>
      ) : (
        <div style={estilos.listaGrid}>
          {conductores.filter(c => conductoresEnCarrera.has(c.uid)).map(c => {
            const servicio = servicios.find(s => s.conductorUid === c.uid);
            return (
              <div key={c.uid} style={{ ...estilos.conductorCard, borderLeft: '4px solid #E53935' }}>
                <div style={estilos.conductorHeader}>
                  <div style={estilos.fotoPlaceholder}>{c.nombre?.charAt(0)?.toUpperCase()}</div>
                  <div>
                    <p style={estilos.nombre}>{c.nombre}</p>
                    <p style={{ ...estilos.placa, color: '#E53935' }}>{c.placa}</p>
                  </div>
                </div>
                {servicio && (
                  <div style={{ marginBottom: 8 }}>
                    <p style={{ margin: '2px 0', fontSize: 12, color: '#333' }}>👤 Cliente: {servicio.clienteNombre}</p>
                    <p style={{ margin: '2px 0', fontSize: 12, color: '#333' }}>📍 {servicio.origen}</p>
                    <p style={{ margin: '2px 0', fontSize: 12, color: '#333' }}>🏁 {servicio.destino}</p>
                    <p style={{ margin: '2px 0', fontSize: 12, color: '#666' }}>💰 ${servicio.tarifaAcordada?.toLocaleString('es-CO') || '---'} | {servicio.metodoPago?.toUpperCase()}</p>
                  </div>
                )}
                <p style={estilos.coordenadas}>📍 {c.lat.toFixed(5)}, {c.lng.toFixed(5)}</p>
                <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noopener noreferrer" style={estilos.linkMapa}>🗺️ Ver en Google Maps</a>
              </div>
            );
          })}
        </div>
      )}

      {/* Todos los conductores conectados */}
      <h3 style={{ marginTop: 24, marginBottom: 16 }}>🚕 Todos los conductores conectados ({conductores.length})</h3>
      {conductores.length === 0 ? (
        <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>No hay conductores conectados</p>
      ) : (
        <div style={estilos.listaGrid}>
          {conductores.filter(c => !conductoresEnCarrera.has(c.uid)).map(c => (
            <div key={c.uid} style={estilos.conductorCard}>
              <div style={estilos.conductorHeader}>
                <div style={estilos.fotoPlaceholder}>{c.nombre?.charAt(0)?.toUpperCase()}</div>
                <div>
                  <p style={estilos.nombre}>{c.nombre}</p>
                  <p style={estilos.placa}>{c.placa}</p>
                </div>
              </div>
              <p style={estilos.coordenadas}>📍 {c.lat.toFixed(5)}, {c.lng.toFixed(5)}</p>
              <a href={`https://www.google.com/maps?q=${c.lat},${c.lng}`} target="_blank" rel="noopener noreferrer" style={estilos.linkMapa}>🗺️ Ver en Google Maps</a>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

const estilos = {
  mapaContainer: { marginBottom: 24, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' },
  listaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 },
  conductorCard: { background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #FFC107' },
  conductorHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  fotoPlaceholder: { width: 48, height: 48, borderRadius: 24, background: '#FFC107', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 20 },
  nombre: { margin: 0, fontWeight: 'bold', fontSize: 16 },
  placa: { margin: 0, color: '#FFC107', fontWeight: 'bold', letterSpacing: 2 },
  coordenadas: { fontSize: 13, color: '#666', margin: '4px 0' },
  linkMapa: { fontSize: 13, color: '#1565C0', fontWeight: '600', textDecoration: 'none' },
};
