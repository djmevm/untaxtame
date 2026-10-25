import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';

// ═══ WEBSOCKET EN TIEMPO REAL ═══
const WS_URL = 'wss://untaxtame-production.up.railway.app/ws';
const CENTRO_TAME = [6.46125, -71.73426];

// Estados de servicio con su etiqueta de proceso
const PROCESO = {
  aceptado: { label: '🚕 En camino al cliente', color: '#1565C0' },
  conductor_en_sitio: { label: '📍 Conductor en el punto de recogida', color: '#F57F17' },
  en_curso: { label: '🚗 Viaje en curso hacia el destino', color: '#2E7D32' },
};

function iconoTaxi(nombre, placa) {
  const n = (nombre || '').split(' ')[0];
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center">
      <div style="font-size:30px">🚕</div>
      <div style="background:#FFC107;color:#000;font-weight:bold;font-size:10px;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-top:-4px">${n}</div>
      <div style="background:#000;color:#FFC107;font-weight:bold;font-size:9px;padding:1px 5px;border-radius:3px;margin-top:2px;letter-spacing:1px">${placa || '---'}</div>
    </div>`,
    iconSize: [90, 60], iconAnchor: [45, 60],
  });
}

function iconoCliente(nombre) {
  const n = (nombre || 'Cliente').split(' ')[0];
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center">
      <div style="font-size:26px">👤</div>
      <div style="background:#1565C0;color:#fff;font-weight:bold;font-size:10px;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-top:-2px">${n}</div>
    </div>`,
    iconSize: [80, 50], iconAnchor: [40, 50],
  });
}

// Centrar el mapa en los puntos del servicio seleccionado
function AjustarVista({ puntos }) {
  const map = useMap();
  useEffect(() => {
    if (puntos && puntos.length === 1) {
      map.setView(puntos[0], 16);
    } else if (puntos && puntos.length > 1) {
      map.fitBounds(puntos, { padding: [60, 60], maxZoom: 16 });
    }
  }, [puntos, map]);
  return null;
}

export default function MapaConductores() {
  const [servicios, setServicios] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null); // id del servicio seguido
  const [cargando, setCargando] = useState(true);
  const [wsConectado, setWsConectado] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const wsRef = useRef(null);
  const ubicacionesRef = useRef(new Map()); // uid conductor → {lat,lng,timestamp}
  const [tick, setTick] = useState(0); // fuerza re-render al llegar ubicaciones

  // Cargar servicios activos por HTTP (datos base)
  const cargarServicios = async () => {
    try {
      const res = await api.get('/services/todos');
      const activos = (res.data || []).filter(s =>
        s.conductorUid && ['aceptado', 'conductor_en_sitio', 'en_curso'].includes(s.estado)
      );
      setServicios(activos);
      // Autoseleccionar el primero si no hay ninguno seleccionado
      setSeleccionado(prev => prev && activos.find(s => s.id === prev) ? prev : (activos[0]?.id || null));
    } catch {}
    finally { setCargando(false); }
  };

  useEffect(() => {
    cargarServicios();
    const intServicios = setInterval(cargarServicios, 10000);

    const conectarWS = () => {
      const ws = new WebSocket(`${WS_URL}?uid=admin-rastreo&rol=admin`);
      ws.onopen = () => setWsConectado(true);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.tipo === 'ubicaciones_conductores' && data.conductores) {
            data.conductores.forEach(c => {
              ubicacionesRef.current.set(c.uid, { lat: c.lat, lng: c.lng, timestamp: c.timestamp || Date.now() });
            });
            setUltimaActualizacion(new Date());
            setTick(t => t + 1);
          }
        } catch {}
      };
      ws.onclose = () => { setWsConectado(false); setTimeout(conectarWS, 3000); };
      ws.onerror = () => {};
      wsRef.current = ws;
    };
    conectarWS();

    return () => { clearInterval(intServicios); if (wsRef.current) wsRef.current.close(); };
  }, []);

  if (cargando) return <p className="loading">Cargando rastreo...</p>;

  const servicio = servicios.find(s => s.id === seleccionado);

  // Posiciones para el servicio seleccionado
  const ubiConductor = servicio ? ubicacionesRef.current.get(servicio.conductorUid) : null;
  const posConductor = ubiConductor
    ? [ubiConductor.lat, ubiConductor.lng]
    : (servicio?.ubicacionConductor ? [servicio.ubicacionConductor.lat, servicio.ubicacionConductor.lng] : null);
  const posCliente = servicio?.ubicacionGPS?.lat ? [servicio.ubicacionGPS.lat, servicio.ubicacionGPS.lng] : null;

  const puntos = [posConductor, posCliente].filter(Boolean);
  const centro = puntos[0] || CENTRO_TAME;
  const proceso = servicio ? (PROCESO[servicio.estado] || { label: servicio.estado, color: '#555' }) : null;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
        <h2 className="titulo" style={{ marginBottom: 0 }}>⚡ Rastreo de Servicio en Vivo</h2>
        <span style={{
          background: wsConectado ? '#E8F5E9' : '#FFEBEE', color: wsConectado ? '#2E7D32' : '#B71C1C',
          padding: '6px 14px', borderRadius: 20, fontWeight: 'bold', fontSize: 13,
        }}>
          {wsConectado ? '🟢 EN VIVO' : '🔴 Reconectando...'}
          {ultimaActualizacion ? ` · ${ultimaActualizacion.toLocaleTimeString('es-CO')}` : ''}
        </span>
      </div>
      <p style={{ color: '#666', marginTop: 6, marginBottom: 16 }}>
        Seguimiento segundo a segundo del viaje entre el cliente y su conductor.
      </p>

      {servicios.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 40, textAlign: 'center', boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🚕</div>
          <p style={{ color: '#999', fontSize: 16 }}>No hay servicios en curso en este momento</p>
        </div>
      ) : (
        <>
          {/* Selector de servicio activo */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {servicios.map(s => (
              <button key={s.id} onClick={() => setSeleccionado(s.id)} style={{
                padding: '10px 14px', borderRadius: 10, cursor: 'pointer', fontWeight: 'bold', fontSize: 13,
                border: `2px solid ${seleccionado === s.id ? '#F97316' : '#ddd'}`,
                background: seleccionado === s.id ? '#FFF3E0' : '#fff', textAlign: 'left',
              }}>
                👤 {s.clienteNombre} <br />
                <span style={{ fontSize: 11, color: '#777' }}>🚕 {s.conductorNombre} · {s.conductorPlaca}</span>
              </button>
            ))}
          </div>

          {/* Barra de estado del proceso */}
          {servicio && proceso && (
            <div style={{ background: proceso.color, color: '#fff', borderRadius: 12, padding: '12px 18px', marginBottom: 16, fontWeight: 'bold', fontSize: 15 }}>
              {proceso.label}
            </div>
          )}

          {/* Mapa del servicio seleccionado */}
          <div style={{ borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', marginBottom: 20 }}>
            <MapContainer center={centro} zoom={16} style={{ height: 520 }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
              <AjustarVista puntos={puntos} />

              {posConductor && servicio && (
                <Marker position={posConductor} icon={iconoTaxi(servicio.conductorNombre, servicio.conductorPlaca)}>
                  <Popup>
                    <strong>🚕 {servicio.conductorNombre}</strong><br />
                    Placa: {servicio.conductorPlaca}<br />
                    {ubiConductor ? `📡 En vivo · ${new Date(ubiConductor.timestamp).toLocaleTimeString('es-CO')}` : '📍 Última posición conocida'}
                  </Popup>
                </Marker>
              )}

              {posCliente && servicio && (
                <Marker position={posCliente} icon={iconoCliente(servicio.clienteNombre)}>
                  <Popup>
                    <strong>👤 {servicio.clienteNombre}</strong><br />
                    📍 {servicio.origen}
                  </Popup>
                </Marker>
              )}

              {/* Línea entre conductor y cliente */}
              {posConductor && posCliente && (
                <Polyline positions={[posConductor, posCliente]} pathOptions={{ color: '#F97316', weight: 4, dashArray: '8 8' }} />
              )}
            </MapContainer>
          </div>

          {/* Detalle del servicio */}
          {servicio && (
            <div style={{ background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                <div><strong>👤 Cliente:</strong> {servicio.clienteNombre}</div>
                <div><strong>🚕 Conductor:</strong> {servicio.conductorNombre} <span style={{ color: '#FFC107', fontWeight: 'bold' }}>{servicio.conductorPlaca}</span></div>
                <div><strong>📍 Origen:</strong> {servicio.origen}</div>
                <div><strong>🏁 Destino:</strong> {servicio.destino}</div>
                <div><strong>💰 Tarifa:</strong> ${servicio.tarifaAcordada?.toLocaleString('es-CO') || '—'}</div>
                <div><strong>💳 Pago:</strong> {servicio.metodoPago?.toUpperCase()}</div>
              </div>
              {!ubiConductor && (
                <p style={{ color: '#E53935', fontSize: 13, marginTop: 12, marginBottom: 0 }}>
                  ⚠️ El conductor aún no transmite ubicación en vivo (requiere la app actualizada con GPS por WebSocket).
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
