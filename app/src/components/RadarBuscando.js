import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image } from 'react-native';
import * as Location from 'expo-location';
import api from '../config/api';

function calcularDistancia(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Solo la animación del radar (para superponer en el mapa)
export function RadarSoloAnimacion() {
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const scanLine = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animarPulso = (anim, delay) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 2500, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    };
    animarPulso(pulse1, 0);
    animarPulso(pulse2, 1200);

    Animated.loop(
      Animated.timing(scanLine, { toValue: 1, duration: 2000, easing: Easing.linear, useNativeDriver: true })
    ).start();
  }, []);

  const escala = (anim) => anim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.0] });
  const opacidad = (anim) => anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0] });
  const rotacion = scanLine.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={radarStyles.container}>
      <Animated.View style={[radarStyles.pulso, { transform: [{ scale: escala(pulse1) }], opacity: opacidad(pulse1) }]} />
      <Animated.View style={[radarStyles.pulso, { transform: [{ scale: escala(pulse2) }], opacity: opacidad(pulse2) }]} />
      <Animated.View style={[radarStyles.scanLine, { transform: [{ rotate: rotacion }] }]}>
        <View style={radarStyles.scanBeam} />
      </Animated.View>
      <View style={radarStyles.centro}>
        <Text style={{ fontSize: 18 }}>📍</Text>
      </View>
      <Text style={radarStyles.texto}>Rastreando en 1km...</Text>
    </View>
  );
}

// Lista de conductores cercanos (para debajo del mapa)
export function ConductoresCercanosList() {
  const [cercanos, setCercanos] = useState([]);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 30000);
    return () => clearInterval(intervalo);
  }, []);

  const cargar = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });

      const res = await api.get('/users/conductores/en-servicio');
      const conductores = res.data.filter(c => c.ubicacionActual?.lat);

      const conDistancia = conductores.map(c => {
        const dist = calcularDistancia(loc.coords.latitude, loc.coords.longitude, c.ubicacionActual.lat, c.ubicacionActual.lng);
        return { ...c, distancia: dist, tiempoEstimado: Math.max(1, Math.round((dist * 1.3 / 25) * 60)) };
      })
        .filter(c => c.distancia <= 5)
        .sort((a, b) => a.distancia - b.distancia)
        .slice(0, 4);

      setCercanos(conDistancia);
    } catch {}
  };

  if (cercanos.length === 0) return null;

  return (
    <View style={listaStyles.container}>
      <Text style={listaStyles.titulo}>🚕 {cercanos.length} conductor{cercanos.length > 1 ? 'es' : ''} cerca</Text>
      {cercanos.map((c, i) => (
        <View key={c.uid} style={listaStyles.item}>
          <View style={listaStyles.rank}><Text style={listaStyles.rankNum}>{i + 1}</Text></View>
          {c.fotoPerfil ? (
            <Image source={{ uri: c.fotoPerfil }} style={listaStyles.foto} />
          ) : (
            <View style={listaStyles.fotoPlaceholder}><Text style={listaStyles.fotoLetra}>{c.nombre?.charAt(0)}</Text></View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={listaStyles.nombre} numberOfLines={1}>{c.nombre}</Text>
            <Text style={listaStyles.placa}>{c.placa}</Text>
          </View>
          <View style={listaStyles.distCol}>
            <Text style={listaStyles.dist}>{c.distancia < 1 ? `${Math.round(c.distancia * 1000)}m` : `${c.distancia.toFixed(1)}km`}</Text>
            <Text style={listaStyles.tiempo}>~{c.tiempoEstimado} min</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// Export default para compatibilidad
export default function RadarBuscando() {
  return (
    <View>
      <RadarSoloAnimacion />
      <ConductoresCercanosList />
    </View>
  );
}

const radarStyles = StyleSheet.create({
  container: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  pulso: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#F97316' },
  scanLine: { position: 'absolute', width: 120, height: 120, alignItems: 'center' },
  scanBeam: { width: 2, height: 60, backgroundColor: '#F97316', borderRadius: 1, opacity: 0.8 },
  centro: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 4, borderWidth: 2, borderColor: '#F97316' },
  texto: { position: 'absolute', bottom: -5, fontSize: 10, color: '#F97316', fontWeight: '600' },
});

const listaStyles = StyleSheet.create({
  container: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 14, elevation: 2 },
  titulo: { fontSize: 14, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8FAFC' },
  rank: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#F97316', alignItems: 'center', justifyContent: 'center' },
  rankNum: { fontSize: 11, fontWeight: 'bold', color: '#fff' },
  foto: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#FFC107' },
  fotoPlaceholder: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#FFC107', alignItems: 'center', justifyContent: 'center' },
  fotoLetra: { fontSize: 14, fontWeight: 'bold' },
  nombre: { fontSize: 13, fontWeight: '600', color: '#333' },
  placa: { fontSize: 11, color: '#F97316', fontWeight: 'bold' },
  distCol: { alignItems: 'flex-end' },
  dist: { fontSize: 14, fontWeight: 'bold', color: '#1565C0' },
  tiempo: { fontSize: 11, color: '#64748B' },
});
