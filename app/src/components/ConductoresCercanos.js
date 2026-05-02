import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import * as Location from 'expo-location';
import api from '../config/api';

function calcularDistancia(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function ConductoresCercanos() {
  const [conductores, setConductores] = useState([]);
  const [miUbicacion, setMiUbicacion] = useState(null);

  useEffect(() => {
    const cargar = async () => {
      try {
        // Obtener mi ubicación
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setMiUbicacion({ lat: loc.coords.latitude, lng: loc.coords.longitude });
        }

        // Obtener conductores en servicio
        const res = await api.get('/users/conductores/en-servicio');
        setConductores(res.data.filter(c => c.ubicacionActual?.lat));
      } catch {}
    };

    cargar();
    const intervalo = setInterval(cargar, 30000);
    return () => clearInterval(intervalo);
  }, []);

  if (conductores.length === 0) return null;

  // Calcular distancia y ordenar por cercanía
  const conDistancia = conductores.map(c => {
    const dist = miUbicacion && c.ubicacionActual
      ? calcularDistancia(miUbicacion.lat, miUbicacion.lng, c.ubicacionActual.lat, c.ubicacionActual.lng)
      : null;
    const minutos = dist ? Math.round((dist * 1.4 / 25) * 60) : null;
    return { ...c, distancia: dist, tiempoEstimado: minutos };
  }).sort((a, b) => (a.distancia || 999) - (b.distancia || 999));

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>🚕 Conductores cercanos ({conDistancia.length})</Text>
      {conDistancia.slice(0, 5).map((c) => (
        <View key={c.uid} style={styles.conductorCard}>
          {c.fotoPerfil ? (
            <Image source={{ uri: c.fotoPerfil }} style={styles.foto} />
          ) : (
            <View style={styles.fotoPlaceholder}>
              <Text style={styles.fotoLetra}>{c.nombre?.charAt(0)?.toUpperCase()}</Text>
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.nombre}>{c.nombre}</Text>
            <Text style={styles.placa}>{c.placa}</Text>
          </View>
          <View style={styles.infoCol}>
            {c.distancia !== null && (
              <Text style={styles.distancia}>{c.distancia < 1 ? `${Math.round(c.distancia * 1000)}m` : `${c.distancia.toFixed(1)}km`}</Text>
            )}
            {c.tiempoEstimado !== null && (
              <Text style={styles.tiempo}>~{c.tiempoEstimado < 1 ? '1' : c.tiempoEstimado} min</Text>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, elevation: 2 },
  titulo: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  conductorCard: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  foto: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#FFC107' },
  fotoPlaceholder: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFC107', alignItems: 'center', justifyContent: 'center' },
  fotoLetra: { fontSize: 18, fontWeight: 'bold' },
  nombre: { fontSize: 14, fontWeight: '600', color: '#222' },
  placa: { fontSize: 12, color: '#FFC107', fontWeight: 'bold', letterSpacing: 1 },
  infoCol: { alignItems: 'flex-end' },
  distancia: { fontSize: 15, fontWeight: 'bold', color: '#1565C0' },
  tiempo: { fontSize: 12, color: '#888' },
});
