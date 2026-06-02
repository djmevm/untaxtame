import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, Image, ActivityIndicator,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';

const SERVICIOS_OPCIONES = [
  { key: 'maletas', icon: '🧳', label: 'Maletas extras' },
  { key: 'discapacitado', icon: '♿', label: 'Pasajero discapacitado' },
  { key: 'bicicleta', icon: '🚲', label: 'Soporte bicicleta' },
  { key: 'aireAcondicionado', icon: '❄️', label: 'Aire acondicionado' },
  { key: 'mascotas', icon: '🐾', label: 'Mascotas permitidas' },
];

export default function MiTaxiScreen() {
  const { perfil, setPerfil } = useAuth();
  const [serviciosOfrecidos, setServiciosOfrecidos] = useState(perfil?.serviciosOfrecidos || []);
  const [subiendoFoto, setSubiendoFoto] = useState(false);

  const toggleServicio = async (key) => {
    const nuevos = serviciosOfrecidos.includes(key)
      ? serviciosOfrecidos.filter(s => s !== key)
      : [...serviciosOfrecidos, key];
    setServiciosOfrecidos(nuevos);
    try {
      await api.put(`/auth/perfil/${perfil?.uid}`, { serviciosOfrecidos: nuevos });
      if (setPerfil) setPerfil(prev => ({ ...prev, serviciosOfrecidos: nuevos }));
    } catch {}
  };

  const cambiarFotoVehiculo = async () => {
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        return Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería');
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [16, 9],
        quality: 0.9,
      });
      if (result.canceled) return;

      setSubiendoFoto(true);
      const uri = result.assets[0].uri;
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const token = await AsyncStorage.getItem('authToken');

      const fd = new FormData();
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      fd.append('imagen', {
        uri,
        name: `vehiculo.${ext}`,
        type: `image/${ext === 'png' ? 'png' : 'jpeg'}`,
      });

      const response = await fetch(`${api.defaults.baseURL}/upload/imagen`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: fd,
      });
      const data = await response.json();

      if (response.ok && data.url) {
        const url = data.url.startsWith('http')
          ? data.url
          : `${api.defaults.baseURL.replace('/api', '')}${data.url}`;
        await api.put(`/auth/perfil/${perfil?.uid}`, { fotoVehiculo: url });
        if (setPerfil) setPerfil(prev => ({ ...prev, fotoVehiculo: url }));
        Alert.alert('✅', 'Foto del taxi actualizada');
      } else {
        Alert.alert('Error', data.error || 'No se pudo subir la foto');
      }
    } catch (err) {
      Alert.alert('Error', 'No se pudo subir la foto');
    } finally {
      setSubiendoFoto(false);
    }
  };

  if (!perfil) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#FFC107" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <Text style={styles.titulo}>🚕 Mi Taxi</Text>
      <Text style={styles.placa}>{perfil.placa || 'Sin placa'}</Text>

      {/* Foto del vehículo */}
      <TouchableOpacity style={styles.fotoCard} onPress={cambiarFotoVehiculo} disabled={subiendoFoto}>
        {subiendoFoto ? (
          <View style={styles.fotoPlaceholder}>
            <ActivityIndicator size="large" color="#FFC107" />
            <Text style={{ color: '#888', marginTop: 8 }}>Subiendo foto...</Text>
          </View>
        ) : perfil.fotoVehiculo ? (
          <Image source={{ uri: perfil.fotoVehiculo }} style={styles.fotoImagen} />
        ) : (
          <View style={styles.fotoPlaceholder}>
            <Text style={{ fontSize: 48 }}>🚕</Text>
            <Text style={styles.fotoTexto}>Toca para agregar foto de tu taxi</Text>
            <Text style={styles.fotoHint}>Los clientes verán esta foto al solicitar</Text>
          </View>
        )}
        {perfil.fotoVehiculo && !subiendoFoto && (
          <View style={styles.fotoBtnCambiar}>
            <Text style={styles.fotoBtnTexto}>📷 Cambiar foto</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Servicios que ofrezco */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>🚐 Servicios que ofrezco</Text>
        <Text style={styles.seccionDesc}>
          Marca los servicios que tu taxi puede ofrecer. Los clientes verán esto al solicitar.
        </Text>

        {SERVICIOS_OPCIONES.map(({ key, icon, label }) => {
          const activo = serviciosOfrecidos.includes(key);
          return (
            <TouchableOpacity
              key={key}
              style={[styles.servicioItem, activo && styles.servicioItemActivo]}
              onPress={() => toggleServicio(key)}
              activeOpacity={0.7}
            >
              <Text style={styles.servicioIcono}>{icon}</Text>
              <Text style={styles.servicioLabel}>{label}</Text>
              <View style={[styles.check, activo && styles.checkActivo]}>
                {activo && <Text style={styles.checkMark}>✓</Text>}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Info */}
      <View style={styles.infoCard}>
        <Text style={styles.infoTexto}>
          💡 Los clientes pueden filtrar por estos servicios al solicitar un taxi. Marca los que tu vehículo ofrece para recibir más solicitudes.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flexGrow: 1, backgroundColor: '#f5f5f5', padding: 20, paddingBottom: 40 },
  titulo: { fontSize: 24, fontWeight: 'bold', color: '#1E293B', marginBottom: 4 },
  placa: { fontSize: 18, fontWeight: 'bold', color: '#FFC107', letterSpacing: 2, marginBottom: 20 },
  fotoCard: { width: '100%', borderRadius: 16, overflow: 'hidden', marginBottom: 20, elevation: 3, backgroundColor: '#fff' },
  fotoImagen: { width: '100%', height: 200, resizeMode: 'cover' },
  fotoPlaceholder: { width: '100%', height: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed', borderRadius: 16 },
  fotoTexto: { fontSize: 15, color: '#64748B', marginTop: 8 },
  fotoHint: { fontSize: 12, color: '#94A3B8', marginTop: 4 },
  fotoBtnCambiar: { padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f0f0f0', alignItems: 'center' },
  fotoBtnTexto: { color: '#1565C0', fontWeight: '600', fontSize: 14 },
  seccion: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, elevation: 2 },
  seccionTitulo: { fontSize: 17, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  seccionDesc: { fontSize: 13, color: '#888', marginBottom: 16 },
  servicioItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: '#E2E8F0' },
  servicioItemActivo: { backgroundColor: '#F0FDF4', borderColor: '#16A34A' },
  servicioIcono: { fontSize: 24, marginRight: 14 },
  servicioLabel: { flex: 1, fontSize: 16, color: '#333', fontWeight: '500' },
  check: { width: 30, height: 30, borderRadius: 8, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  checkActivo: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  checkMark: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  infoCard: { backgroundColor: '#FFF7ED', borderRadius: 12, padding: 16, borderLeftWidth: 4, borderLeftColor: '#F97316' },
  infoTexto: { fontSize: 13, color: '#92400E', lineHeight: 20 },
});
