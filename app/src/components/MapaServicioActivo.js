import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import api from '../config/api';
import { useTrackingViaje } from '../hooks/useWebSocket';
import { useAuth } from '../context/AuthContext';

const ESTADOS_LIVE = ['aceptado', 'conductor_en_sitio', 'en_curso'];

const ESTADO_MENSAJES = {
  aceptado: { texto: 'Tu conductor viene en camino', color: '#1565C0', icon: '🚕' },
  conductor_en_sitio: { texto: '¡Tu conductor llegó! Sal al punto', color: '#FF9800', icon: '📍' },
  en_curso: { texto: 'En camino a tu destino — seguimiento en vivo', color: '#2E7D32', icon: '🛣️' },
};

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

export default function MapaServicioActivo({ servicioActivo, destinoGPS }) {
  const { perfil } = useAuth();
  const [ubicacionConductor, setUbicacionConductor] = useState(null);
  const [tiempoEstimado, setTiempoEstimado] = useState(null);
  const [distancia, setDistancia] = useState(null);
  const mapRef = useRef(null);

  const liveActivo = !!(servicioActivo?.id && ESTADOS_LIVE.includes(servicioActivo?.estado));
  const { ubicacionPeer, conectado } = useTrackingViaje(
    perfil?.uid,
    'cliente',
    servicioActivo?.id,
    liveActivo
  );

  // Actualizar desde WebSocket en vivo
  useEffect(() => {
    if (ubicacionPeer?.lat) {
      setUbicacionConductor({ lat: ubicacionPeer.lat, lng: ubicacionPeer.lng });
    }
  }, [ubicacionPeer]);

  // Fallback HTTP cada 15s por si WS falla
  useEffect(() => {
    if (!servicioActivo?.conductorUid) return;
    if (!ESTADOS_LIVE.includes(servicioActivo.estado)) return;

    const cargar = async () => {
      try {
        const res = await api.get('/users/conductores/en-servicio');
        const conductor = res.data.find(c => c.uid === servicioActivo.conductorUid);
        if (conductor?.ubicacionActual?.lat) {
          setUbicacionConductor((prev) => prev || conductor.ubicacionActual);
          if (!ubicacionPeer) {
            setUbicacionConductor(conductor.ubicacionActual);
          }
        }
      } catch {}
    };

    cargar();
    const intervalo = setInterval(cargar, 15000);
    return () => clearInterval(intervalo);
  }, [servicioActivo?.conductorUid, servicioActivo?.estado, ubicacionPeer]);

  // Distancia / ETA y fit del mapa
  useEffect(() => {
    if (!ubicacionConductor) return;

    const recogidaLat = servicioActivo?.ubicacionGPS?.lat;
    const recogidaLng = servicioActivo?.ubicacionGPS?.lng;
    const destLat = destinoGPS?.lat || servicioActivo?.destinoLat;
    const destLng = destinoGPS?.lng || servicioActivo?.destinoLng;

    let targetLat = recogidaLat;
    let targetLng = recogidaLng;
    if (servicioActivo?.estado === 'en_curso' && destLat && destLng) {
      targetLat = destLat;
      targetLng = destLng;
    }

    if (targetLat && targetLng) {
      const dist = calcularDistancia(
        ubicacionConductor.lat, ubicacionConductor.lng,
        targetLat, targetLng
      );
      setDistancia(dist);
      setTiempoEstimado(Math.max(1, Math.round((dist / 30) * 60)));
    }

    if (mapRef.current) {
      const coords = [
        { latitude: ubicacionConductor.lat, longitude: ubicacionConductor.lng },
      ];
      if (recogidaLat && recogidaLng) {
        coords.push({ latitude: recogidaLat, longitude: recogidaLng });
      }
      if (destLat && destLng) {
        coords.push({ latitude: destLat, longitude: destLng });
      }
      if (coords.length >= 2) {
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
          animated: true,
        });
      }
    }
  }, [ubicacionConductor, servicioActivo?.estado, servicioActivo?.ubicacionGPS, destinoGPS]);

  if (!liveActivo) return null;
  if (!servicioActivo?.ubicacionGPS && !destinoGPS && !ubicacionConductor) return null;

  const clienteLat = servicioActivo?.ubicacionGPS?.lat || 0;
  const clienteLng = servicioActivo?.ubicacionGPS?.lng || 0;
  const destLat = destinoGPS?.lat || servicioActivo?.destinoLat;
  const destLng = destinoGPS?.lng || servicioActivo?.destinoLng;
  const estadoInfo = ESTADO_MENSAJES[servicioActivo?.estado] || ESTADO_MENSAJES.aceptado;

  const rutaPuntos = [];
  if (ubicacionConductor) {
    rutaPuntos.push({ latitude: ubicacionConductor.lat, longitude: ubicacionConductor.lng });
  }
  if (servicioActivo?.estado !== 'en_curso' && clienteLat && clienteLng) {
    rutaPuntos.push({ latitude: clienteLat, longitude: clienteLng });
  }
  if (servicioActivo?.estado === 'en_curso' && destLat && destLng) {
    rutaPuntos.push({ latitude: destLat, longitude: destLng });
  } else if (destLat && destLng && servicioActivo?.estado !== 'aceptado') {
    rutaPuntos.push({ latitude: destLat, longitude: destLng });
  }

  return (
    <View style={styles.container}>
      <View style={[styles.statusBar, { backgroundColor: estadoInfo.color }]}>
        <Text style={styles.statusIcon}>{estadoInfo.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTexto}>{estadoInfo.texto}</Text>
          {tiempoEstimado && distancia != null && (
            <Text style={styles.statusTiempo}>
              ⏱️ ~{tiempoEstimado} min • {distancia.toFixed(1)} km
              {conectado ? ' • En vivo' : ' • Actualizando...'}
            </Text>
          )}
        </View>
        {!ubicacionConductor && (
          <ActivityIndicator size="small" color="#fff" />
        )}
      </View>

      <MapView
        ref={mapRef}
        style={styles.mapa}
        initialRegion={{
          latitude: clienteLat || ubicacionConductor?.lat || 6.46,
          longitude: clienteLng || ubicacionConductor?.lng || -71.73,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}
        showsUserLocation={true}
      >
        {rutaPuntos.length >= 2 && (
          <Polyline
            coordinates={rutaPuntos}
            strokeColor={estadoInfo.color}
            strokeWidth={3}
            lineDashPattern={[10, 5]}
          />
        )}

        {servicioActivo?.ubicacionGPS && (
          <Marker coordinate={{ latitude: clienteLat, longitude: clienteLng }}>
            <View style={styles.clienteMarker}>
              <Text style={styles.markerEmoji}>📍</Text>
              <View style={[styles.markerBadge, { backgroundColor: '#1565C0' }]}>
                <Text style={styles.markerBadgeTexto}>Recogida</Text>
              </View>
            </View>
          </Marker>
        )}

        {destLat && destLng ? (
          <Marker coordinate={{ latitude: destLat, longitude: destLng }}>
            <View style={styles.clienteMarker}>
              <Text style={styles.markerEmoji}>🏁</Text>
              <View style={[styles.markerBadge, { backgroundColor: '#E53935' }]}>
                <Text style={styles.markerBadgeTexto}>Destino</Text>
              </View>
            </View>
          </Marker>
        ) : null}

        {ubicacionConductor && (
          <Marker
            coordinate={{ latitude: ubicacionConductor.lat, longitude: ubicacionConductor.lng }}
            anchor={{ x: 0.5, y: 0.5 }}
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

      {servicioActivo?.conductorNombre && (
        <View style={styles.conductorBar}>
          <View style={styles.conductorInfo}>
            <Text style={styles.conductorNombre}>{servicioActivo.conductorNombre}</Text>
            <Text style={styles.conductorPlaca}>{servicioActivo.conductorPlaca}</Text>
          </View>
          {servicioActivo?.estado === 'conductor_en_sitio' ? (
            <View style={[styles.tiempoBadge, { backgroundColor: '#FF9800' }]}>
              <Text style={styles.tiempoNumero}>✓</Text>
              <Text style={styles.tiempoLabel}>Llegó</Text>
            </View>
          ) : tiempoEstimado ? (
            <View style={[styles.tiempoBadge, { backgroundColor: estadoInfo.color }]}>
              <Text style={styles.tiempoNumero}>{tiempoEstimado}</Text>
              <Text style={styles.tiempoLabel}>min</Text>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 16, overflow: 'hidden', marginBottom: 14, elevation: 3 },
  statusBar: {
    flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10,
  },
  statusIcon: { fontSize: 22 },
  statusTexto: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  statusTiempo: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  mapa: { width: '100%', height: 260 },
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
