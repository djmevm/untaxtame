import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import api from '../api';

// Ícono de taxi con placa
function crearIconoTaxi(placa) {
  return L.divIcon({
    className: '',
    html: `<div style="text-align:center">
      <div style="font-size:32px">🚕</div>
      <div style="background:#FFC107;color:#000;font-weight:bold;font-size:10px;padding:1px 6px;border-radius:4px;white-space:nowrap;margin-top:-4px">${placa || '---'}</div>
    </div>`,
    iconSize: [60, 50],
    iconAnchor: [30, 50],
  });
}

// Ícono de cliente
const iconoCliente = L.divIcon({
  className: '',
  html: `<div style="text-align:center">
    <div style="font-size:28px">🧑</div>
    <div style="background:#1565C0;color:#fff;font-size:9px;padding:1px 5px;border-radius:4px;margin-top:-4px">Cliente</div>
  </div>`,
  iconSize: [50, 45],
  iconAnchor: [25, 45],
});

// Componente para centrar el mapa
function CentrarMapa({ centro }) {
  const map = useMap();
  useEffect(() => {
    if (centro) map.setView(centro, 14);
  }, [centro]);
  return null;
}

export default function MapaConductores() {
  const [conductores, setConductores] = useState([]);
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargar = async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          api.get('/users/conductores/en-servicio'),
          api.get('/services/todos').catch(() => ({ data: [] })),
        ]);
        setConductores(cRes.data.filter(c => c.ubicacionActual?.lat));
        // Servicios activos con ubicación GPS del cliente
        setServicios(sRes.data.filter(s =>
          ['pendiente', 'aceptado'].includes(s.estado) && s.ubicacionGPS?.lat
        ));
      } catch {}
      finally { setCargando(false); }
    };
    cargar();
    const intervalo = setInterval(cargar, 60000);
    return () => clearInterval(intervalo);
  }, []);

  if (cargando) return <p className="loading">Cargando mapa...</p>;

  // Centro del mapa: primer conductor o Colombia por defecto
  const centro = conductores.length > 0
    ? [conductores[0].ubicacionActual.lat, conductores[0].ubicacionActual.lng]
    : servicios.length > 0
      ? [servicios[0].ubicacionGPS.lat, servicios[0].ubicacionGPS.lng]
      : [7.08, -73.17];

  return (
    <div>
      <h2 className="titulo">📍 Mapa en tiempo real</h2>

      <div className="stats">
        <div className="stat-card">
          <div className="num" style={{ color: '#FFC107' }}>{conductores.length}</div>
          <div className="label">🚕 En servicio</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#1565C0' }}>{servicios.length}</div>
          <div className="label">🧑 Clientes activos</div>
        </div>
      </div>

      <div style={estilos.mapaContainer}>
        <MapContainer center={centro} zoom={14} style={{ height: 500, borderRadius: 16 }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap'
          />
          <CentrarMapa centro={centro} />

          {/* Conductores como taxis */}
          {conductores.map(c => (
            <Marker
              key={c.uid}
              position={[c.ubicacionActual.lat, c.ubicacionActual.lng]}
              icon={crearIconoTaxi(c.placa)}
            >
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>🚕 {c.nombre}</strong><br />
                  <span style={{ color: '#FFC107', fontWeight: 'bold', letterSpacing: 2 }}>{c.placa}</span><br />
                  <span style={{ fontSize: 12, color: '#888' }}>📞 {c.telefono || '—'}</span><br />
                  <span style={{ fontSize: 11, color: '#aaa' }}>
                    Actualizado: {c.ubicacionActual?.actualizadoEn ? new Date(c.ubicacionActual.actualizadoEn).toLocaleTimeString('es-CO') : '—'}
                  </span>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Clientes como personas */}
          {servicios.map(s => (
            <Marker
              key={s.id}
              position={[s.ubicacionGPS.lat, s.ubicacionGPS.lng]}
              icon={iconoCliente}
            >
              <Popup>
                <div style={{ textAlign: 'center' }}>
                  <strong>🧑 {s.clienteNombre}</strong><br />
                  <span style={{ fontSize: 12 }}>📍 {s.origen}</span><br />
                  <span style={{ fontSize: 12 }}>🏁 {s.destino}</span><br />
                  <span style={{ fontSize: 11, color: '#888' }}>Estado: {s.estado}</span>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Lista de conductores */}
      <h3 style={{ marginTop: 24, marginBottom: 16 }}>🚕 Conductores en servicio</h3>
      {conductores.length === 0 ? (
        <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>No hay conductores en servicio</p>
      ) : (
        <div style={estilos.listaGrid}>
          {conductores.map(c => (
            <div key={c.uid} style={estilos.conductorCard}>
              <div style={estilos.conductorHeader}>
                {c.fotoPerfil ? (
                  <img src={c.fotoPerfil} alt="" style={estilos.foto} />
                ) : (
                  <div style={estilos.fotoPlaceholder}>{c.nombre?.charAt(0)?.toUpperCase()}</div>
                )}
                <div>
                  <p style={estilos.nombre}>{c.nombre}</p>
                  <p style={estilos.placa}>{c.placa}</p>
                </div>
              </div>
              <p style={estilos.coordenadas}>📍 {c.ubicacionActual?.lat?.toFixed(4)}, {c.ubicacionActual?.lng?.toFixed(4)}</p>
              <p style={estilos.actualizado}>⏱️ {c.ubicacionActual?.actualizadoEn ? new Date(c.ubicacionActual.actualizadoEn).toLocaleTimeString('es-CO') : '—'}</p>
              <a href={`https://www.google.com/maps?q=${c.ubicacionActual?.lat},${c.ubicacionActual?.lng}`}
                target="_blank" rel="noopener noreferrer" style={estilos.linkMapa}>🗺️ Ver en Google Maps</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const estilos = {
  mapaContainer: { marginBottom: 24, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' },
  listaGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  conductorCard: { background: '#fff', borderRadius: 14, padding: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #FFC107' },
  conductorHeader: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  foto: { width: 48, height: 48, borderRadius: 24, objectFit: 'cover', border: '2px solid #FFC107' },
  fotoPlaceholder: { width: 48, height: 48, borderRadius: 24, background: '#FFC107', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 20 },
  nombre: { margin: 0, fontWeight: 'bold', fontSize: 16 },
  placa: { margin: 0, color: '#FFC107', fontWeight: 'bold', letterSpacing: 2 },
  coordenadas: { fontSize: 13, color: '#666', margin: '4px 0' },
  actualizado: { fontSize: 12, color: '#999', margin: '2px 0' },
  linkMapa: { fontSize: 13, color: '#1565C0', fontWeight: '600', textDecoration: 'none' },
};
