import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import api from '../config/api';

export default function MapaServicioActivo({ servicioActivo, destinoGPS }) {
  const [ubicacionConductor, setUbicacionConductor] = useState(null);
  const mapRef = useRef(null);

  // Polling ubicación del conductor cada 10 segundos
  useEffect(() => {
    if (!servicioActivo?.conductorUid || servicioActivo.estado !== 'aceptado') return;

    const cargar = async () => {
      try {
        const res = await api.get('/users/conductores/en-servicio');
        const conductor = res.data.find(c => c.uid === servicioActivo.conductorUid);
        if (conductor?.ubicacionActual?.lat) {
          setUbicacionConductor(conductor.ubicacionActual);
        }
      } catch {}
    };

    cargar();
    const intervalo = setInterval(cargar, 10000);
    return () => clearInterval(intervalo);
  }, [servicioActivo?.conductorUid, servicioActivo?.estado]);

  if (!servicioActivo?.ubicacionGPS && !destinoGPS && !ubicacionConductor) return null;

  const clienteLat = servicioActivo?.ubicacionGPS?.lat || 0;
  const clienteLng = servicioActivo?.ubicacionGPS?.lng || 0;

  return (
    <View style={styles.container}>
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
        {/* Cliente - marcador azul */}
        {servicioActivo?.ubicacionGPS && (
          <Marker
            coordinate={{ latitude: clienteLat, longitude: clienteLng }}
            title="📍 Tu ubicación"
            pinColor="#1565C0"
          />
        )}

        {/* Destino - marcador rojo */}
        {destinoGPS && (
          <Marker
            coordinate={{ latitude: destinoGPS.lat, longitude: destinoGPS.lng }}
            title="🏁 Destino"
            pinColor="#E53935"
          />
        )}

        {/* Conductor - taxi moviéndose */}
        {ubicacionConductor && (
          <Marker
            coordinate={{ latitude: ubicacionConductor.lat, longitude: ubicacionConductor.lng }}
            title={`🚕 ${servicioActivo?.conductorNombre || 'Conductor'}`}
            description={servicioActivo?.conductorPlaca || ''}
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

      {/* Info del conductor en camino */}
      {ubicacionConductor && servicioActivo?.estado === 'aceptado' && (
        <View style={styles.infoBar}>
          <Text style={styles.infoTexto}>
            🚕 {servicioActivo.conductorNombre} viene en camino
          </Text>
          <Text style={styles.infoPlaca}>{servicioActivo.conductorPlaca}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 16, overflow: 'hidden', marginBottom: 14, elevation: 3 },
  mapa: { width: '100%', height: 250 },
  taxiMarker: { alignItems: 'center' },
  taxiEmoji: { fontSize: 30 },
  placaBadge: {
    backgroundColor: '#FFC107', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1, marginTop: -4,
  },
  placaTexto: { fontSize: 9, fontWeight: 'bold', color: '#000' },
  infoBar: {
    backgroundColor: '#1565C0', padding: 10, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center',
  },
  infoTexto: { color: '#fff', fontWeight: '600', fontSize: 13 },
  infoPlaca: { color: '#FFC107', fontWeight: 'bold', fontSize: 14, letterSpacing: 1 },
});
