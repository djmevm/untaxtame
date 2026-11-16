import React, { useEffect, useRef, useState, memo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { useTrackingViaje } from '../hooks/useWebSocket';
import { useAuth } from '../context/AuthContext';

const ESTADOS_LIVE = ['aceptado', 'conductor_en_sitio', 'en_curso'];
const MIN_MOVE_M = 35;

const ESTADO_MENSAJES = {
  aceptado: { texto: 'En camino al punto de recogida', color: '#1565C0', icon: '🚕' },
  conductor_en_sitio: { texto: 'Esperando al pasajero', color: '#FF9800', icon: '📍' },
  en_curso: { texto: 'Viaje en curso — hacia el destino', color: '#2E7D32', icon: '🛣️' },
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

function metrosEntre(a, b) {
  if (!a?.lat || !b?.lat) return Infinity;
  return calcularDistancia(a.lat, a.lng, b.lat, b.lng) * 1000;
}

function MapaViajeConductor({ servicioActivo }) {
  const { perfil } = useAuth();
  const mapRef = useRef(null);
  const [miUbicacion, setMiUbicacion] = useState(null);
  const [distancia, setDistancia] = useState(null);
  const ultimoFitEstadoRef = useRef(null);
  const miUbRef = useRef(null);

  const liveActivo = !!(servicioActivo?.id && ESTADOS_LIVE.includes(servicioActivo?.estado));
  const { ubicacionPeer, conectado } = useTrackingViaje(
    perfil?.uid,
    'conductor',
    servicioActivo?.id,
    liveActivo
  );

  // GPS propio — throttled
  useEffect(() => {
    if (!liveActivo) return;
    let mounted = true;
    let intervalo;

    const leerGPS = async () => {
      try {
        const Location = require('expo-location');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
          maximumAge: 8000,
        });
        if (!mounted) return;
        const next = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        if (metrosEntre(miUbRef.current, next) < MIN_MOVE_M) return;
        miUbRef.current = next;
        setMiUbicacion(next);
      } catch {}
    };

    leerGPS();
    intervalo = setInterval(leerGPS, 10000);
    return () => {
      mounted = false;
      if (intervalo) clearInterval(intervalo);
    };
  }, [liveActivo]);

  // Distancia sin mover cámara
  useEffect(() => {
    if (!miUbicacion) return;
    const recogida = servicioActivo?.ubicacionGPS;
    const destLat = servicioActivo?.destinoLat;
    const destLng = servicioActivo?.destinoLng;

    if (servicioActivo?.estado !== 'en_curso' && recogida?.lat) {
      setDistancia(calcularDistancia(miUbicacion.lat, miUbicacion.lng, recogida.lat, recogida.lng));
    } else if (servicioActivo?.estado === 'en_curso' && destLat && destLng) {
      setDistancia(calcularDistancia(miUbicacion.lat, miUbicacion.lng, destLat, destLng));
    }
  }, [miUbicacion, servicioActivo?.estado, servicioActivo?.ubicacionGPS, servicioActivo?.destinoLat, servicioActivo?.destinoLng]);

  // Cámara solo al cambiar estado
  useEffect(() => {
    if (!miUbicacion || !mapRef.current) return;
    const estado = servicioActivo?.estado;
    if (ultimoFitEstadoRef.current === estado) return;
    ultimoFitEstadoRef.current = estado;

    const coords = [
      { latitude: miUbicacion.lat, longitude: miUbicacion.lng },
    ];
    const recogida = servicioActivo?.ubicacionGPS;
    const destLat = servicioActivo?.destinoLat;
    const destLng = servicioActivo?.destinoLng;

    if (servicioActivo?.estado !== 'en_curso' && recogida?.lat) {
      coords.push({ latitude: recogida.lat, longitude: recogida.lng });
    } else if (servicioActivo?.estado === 'en_curso' && destLat && destLng) {
      coords.push({ latitude: destLat, longitude: destLng });
    }

    if (coords.length >= 2) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: false,
      });
    }
  }, [servicioActivo?.estado, miUbicacion, servicioActivo?.ubicacionGPS, servicioActivo?.destinoLat, servicioActivo?.destinoLng]);

  if (!liveActivo) return null;

  const estadoInfo = ESTADO_MENSAJES[servicioActivo?.estado] || ESTADO_MENSAJES.aceptado;
  const recogida = servicioActivo?.ubicacionGPS;
  const destLat = servicioActivo?.destinoLat;
  const destLng = servicioActivo?.destinoLng;

  const rutaPuntos = [];
  if (miUbicacion) rutaPuntos.push({ latitude: miUbicacion.lat, longitude: miUbicacion.lng });
  if (servicioActivo?.estado === 'en_curso' && destLat && destLng) {
    rutaPuntos.push({ latitude: destLat, longitude: destLng });
  } else if (recogida?.lat) {
    rutaPuntos.push({ latitude: recogida.lat, longitude: recogida.lng });
  }

  const initialLat = miUbicacion?.lat || recogida?.lat || 6.46;
  const initialLng = miUbicacion?.lng || recogida?.lng || -71.73;

  return (
    <View style={styles.container}>
      <View style={[styles.statusBar, { backgroundColor: estadoInfo.color }]}>
        <Text style={styles.statusIcon}>{estadoInfo.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTexto}>{estadoInfo.texto}</Text>
          <Text style={styles.statusTiempo}>
            {conectado ? '📡 En vivo' : '⏳ Conectando...'}
            {distancia != null ? ` • ${distancia.toFixed(1)} km` : ''}
          </Text>
        </View>
        {!miUbicacion && <ActivityIndicator size="small" color="#fff" />}
      </View>

      <MapView
        ref={mapRef}
        style={styles.mapa}
        initialRegion={{
          latitude: initialLat,
          longitude: initialLng,
          latitudeDelta: 0.03,
          longitudeDelta: 0.03,
        }}
        showsUserLocation={false}
        moveOnMarkerPress={false}
      >
        {rutaPuntos.length >= 2 && (
          <Polyline
            coordinates={rutaPuntos}
            strokeColor={estadoInfo.color}
            strokeWidth={3}
            lineDashPattern={[8, 4]}
          />
        )}

        {miUbicacion && (
          <Marker
            coordinate={{ latitude: miUbicacion.lat, longitude: miUbicacion.lng }}
            tracksViewChanges={false}
          >
            <View style={styles.taxiMarker}>
              <Text style={styles.taxiEmoji}>🚕</Text>
              <View style={styles.placaBadge}>
                <Text style={styles.placaTexto}>Tú</Text>
              </View>
            </View>
          </Marker>
        )}

        {recogida?.lat && (
          <Marker
            coordinate={{ latitude: recogida.lat, longitude: recogida.lng }}
            tracksViewChanges={false}
          >
            <View style={styles.puntoMarker}>
              <Text style={styles.markerEmoji}>📍</Text>
              <View style={[styles.badge, { backgroundColor: '#1565C0' }]}>
                <Text style={styles.badgeTexto}>Cliente</Text>
              </View>
            </View>
          </Marker>
        )}

        {ubicacionPeer?.lat && servicioActivo?.estado !== 'en_curso' && (
          <Marker
            coordinate={{ latitude: ubicacionPeer.lat, longitude: ubicacionPeer.lng }}
            tracksViewChanges={false}
          >
            <View style={styles.puntoMarker}>
              <Text style={styles.markerEmoji}>👤</Text>
              <View style={[styles.badge, { backgroundColor: '#7B1FA2' }]}>
                <Text style={styles.badgeTexto}>GPS cliente</Text>
              </View>
            </View>
          </Marker>
        )}

        {destLat && destLng ? (
          <Marker
            coordinate={{ latitude: destLat, longitude: destLng }}
            tracksViewChanges={false}
          >
            <View style={styles.puntoMarker}>
              <Text style={styles.markerEmoji}>🏁</Text>
              <View style={[styles.badge, { backgroundColor: '#E53935' }]}>
                <Text style={styles.badgeTexto}>Destino</Text>
              </View>
            </View>
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

export default memo(MapaViajeConductor);

const styles = StyleSheet.create({
  container: { borderRadius: 14, overflow: 'hidden', marginBottom: 12, elevation: 3 },
  statusBar: { flexDirection: 'row', alignItems: 'center', padding: 10, gap: 8 },
  statusIcon: { fontSize: 20 },
  statusTexto: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  statusTiempo: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 2 },
  mapa: { width: '100%', height: 220 },
  taxiMarker: { alignItems: 'center' },
  taxiEmoji: { fontSize: 28 },
  placaBadge: {
    backgroundColor: '#FFC107', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginTop: -4,
  },
  placaTexto: { fontSize: 9, fontWeight: 'bold', color: '#000' },
  puntoMarker: { alignItems: 'center' },
  markerEmoji: { fontSize: 24 },
  badge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginTop: -2 },
  badgeTexto: { fontSize: 9, fontWeight: 'bold', color: '#fff' },
});
