import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import api from '../config/api';

const ESTADO_MENSAJES = {
  pendiente: { texto: 'Esperando ofertas de taxistas cercanos', color: '#F97316', icon: '📡' },
  aceptado: { texto: 'Tu conductor viene en camino', color: '#1565C0', icon: '🚕' },
  conductor_en_sitio: { texto: '¡Tu conductor llegó! Sal al punto', color: '#FF9800', icon: '📍' },
  en_curso: { texto: 'En camino a tu destino', color: '#2E7D32', icon: '🛣️' },
};

export default function MapaServicioActivo({ servicioActivo, destinoGPS }) {
  const [ubicacionConductor, setUbicacionConductor] = useState(null);
  const [tiempoEstimado, setTiempoEstimado] = useState(null);
  const [distancia, setDistancia] = useState(null);
  const mapRef = useRef(null);

  // Polling ubicación del conductor cada 5 segundos (solo durante servicio activo)
  useEffect(() => {
    if (!servicioActivo?.conductorUid) return;
    if (!['aceptado', 'conductor_en_sitio'].includes(servicioActivo.estado)) return;

    const cargar = async () => {
      try {
        const res = await api.get('/users/conductores/en-servicio');
        const conductor = (res.data || []).find(c => c.uid === servicioActivo.conductorUid);
        if (conductor?.ubicacionActual?.lat) {
          setUbicacionConductor(conductor.ubicacionActual);

          const clienteLat = servicioActivo?.ubicacionGPS?.lat;
          const clienteLng = servicioActivo?.ubicacionGPS?.lng;
          if (clienteLat && clienteLng) {
            const dist = calcularDistancia(
              conductor.ubicacionActual.lat, conductor.ubicacionActual.lng,
              clienteLat, clienteLng
            );
            setDistancia(dist);
            setTiempoEstimado(Math.max(1, Math.round((dist / 30) * 60)));
          }

          if (mapRef.current && clienteLat) {
            mapRef.current.fitToCoordinates([
              { latitude: conductor.ubicacionActual.lat, longitude: conductor.ubicacionActual.lng },
              { latitude: clienteLat, longitude: clienteLng },
            ], { edgePadding: { top: 60, right: 60, bottom: 60, left: 60 }, animated: true });
          }
        }
      } catch {}
    };

    cargar();
    const intervalo = setInterval(cargar, 5000);
    return () => clearInterval(intervalo);
  }, [servicioActivo?.conductorUid, servicioActivo?.estado]);

  if (!servicioActivo?.ubicacionGPS && !destinoGPS && !ubicacionConductor) return null;

  const clienteLat = servicioActivo?.ubicacionGPS?.lat || 0;
  const clienteLng = servicioActivo?.ubicacionGPS?.lng || 0;
  const estadoInfo = ESTADO_MENSAJES[servicioActivo?.estado] || ESTADO_MENSAJES.pendiente;

  // Puntos para la línea de ruta
  const rutaPuntos = [];
  if (ubicacionConductor) {
    rutaPuntos.push({ latitude: ubicacionConductor.lat, longitude: ubicacionConductor.lng });
  }
  if (clienteLat && clienteLng) {
    rutaPuntos.push({ latitude: clienteLat, longitude: clienteLng });
  }
  if (destinoGPS) {
    rutaPuntos.push({ latitude: destinoGPS.lat, longitude: destinoGPS.lng });
  }

  return (
    <View style={styles.container}>
      {/* Barra de estado */}
      <View style={[styles.statusBar, { backgroundColor: estadoInfo.color }]}>
        <Text style={styles.statusIcon}>{estadoInfo.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTexto}>{estadoInfo.texto}</Text>
          {tiempoEstimado && servicioActivo?.estado === 'aceptado' && (
            <Text style={styles.statusTiempo}>⏱️ ~{tiempoEstimado} min • {distancia?.toFixed(1)} km</Text>
          )}
        </View>
        {servicioActivo?.estado === 'aceptado' && !ubicacionConductor && (
          <ActivityIndicator size="small" color="#fff" />
        )}
      </View>

      {/* Mapa */}
      <MapView
        ref={mapRef}
        style={styles.mapa}
        initialRegion={{
          latitude: clienteLat || ubicacionConductor?.lat || 7.08,
          longitude: clienteLng || ubicacionConductor?.lng || -73.17,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}
        showsUserLocation={true}
      >
        {/* Línea de ruta */}
        {rutaPuntos.length >= 2 && (
          <Polyline
            coordinates={rutaPuntos}
            strokeColor={estadoInfo.color}
            strokeWidth={3}
            lineDashPattern={[10, 5]}
          />
        )}

        {/* Cliente - punto de recogida */}
        {servicioActivo?.ubicacionGPS && (
          <Marker coordinate={{ latitude: clienteLat, longitude: clienteLng }}>
            <View style={styles.clienteMarker}>
              <Text style={styles.markerEmoji}>📍</Text>
              <View style={[styles.markerBadge, { backgroundColor: '#1565C0' }]}>
                <Text style={styles.markerBadgeTexto}>Tú</Text>
              </View>
            </View>
          </Marker>
        )}

        {/* Destino */}
        {destinoGPS && (
          <Marker coordinate={{ latitude: destinoGPS.lat, longitude: destinoGPS.lng }}>
            <View style={styles.clienteMarker}>
              <Text style={styles.markerEmoji}>🏁</Text>
              <View style={[styles.markerBadge, { backgroundColor: '#E53935' }]}>
                <Text style={styles.markerBadgeTexto}>Destino</Text>
              </View>
            </View>
          </Marker>
        )}

        {/* Conductor - taxi moviéndose */}
        {ubicacionConductor && (
          <Marker
            coordinate={{ latitude: ubicacionConductor.lat, longitude: ubicacionConductor.lng }}
          >
            <View style={styles.taxiMarker}>
              <Text style={styles.taxiEmoji}>🚕</Text>
              <View style={styles.placaBadge}>
                <Text style={styles.placaTexto}>{servicioActivo?.conductorPlaca || ''}</Text>
              </View>
            </View>
          </Marker>
        )}
      </MapView>

      {/* Info del conductor */}
      {servicioActivo?.conductorNombre && (
        <View style={styles.conductorBar}>
          <View style={styles.conductorInfo}>
            <Text style={styles.conductorNombre}>{servicioActivo.conductorNombre}</Text>
            <Text style={styles.conductorPlaca}>{servicioActivo.conductorPlaca}</Text>
          </View>
          {tiempoEstimado && servicioActivo?.estado === 'aceptado' && (
            <View style={styles.tiempoBadge}>
              <Text style={styles.tiempoNumero}>{tiempoEstimado}</Text>
              <Text style={styles.tiempoLabel}>min</Text>
            </View>
          )}
          {servicioActivo?.estado === 'conductor_en_sitio' && (
            <View style={[styles.tiempoBadge, { backgroundColor: '#FF9800' }]}>
              <Text style={styles.tiempoNumero}>✓</Text>
              <Text style={styles.tiempoLabel}>Llegó</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// Calcular distancia entre dos puntos (Haversine)
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const styles = StyleSheet.create({
  container: { borderRadius: 16, overflow: 'hidden', marginBottom: 14, elevation: 3 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
  },
  statusIcon: { fontSize: 22 },
  statusTexto: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  statusTiempo: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  mapa: { width: '100%', height: 220 },
  clienteMarker: { alignItems: 'center' },
  markerEmoji: { fontSize: 26 },
  markerBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginTop: -2 },
  markerBadgeTexto: { fontSize: 9, fontWeight: 'bold', color: '#fff' },
  taxiMarker: { alignItems: 'center' },
  taxiEmoji: { fontSize: 30 },
  placaBadge: {
    backgroundColor: '#FFC107', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginTop: -4,
  },
  placaTexto: { fontSize: 9, fontWeight: 'bold', color: '#000' },
  conductorBar: {
    backgroundColor: '#fff', padding: 12, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#eee',
  },
  conductorInfo: {},
  conductorNombre: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  conductorPlaca: { fontSize: 13, color: '#F97316', fontWeight: 'bold', letterSpacing: 1 },
  tiempoBadge: {
    backgroundColor: '#1565C0', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 6,
    alignItems: 'center',
  },
  tiempoNumero: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  tiempoLabel: { fontSize: 10, color: 'rgba(255,255,255,0.8)' },
});
