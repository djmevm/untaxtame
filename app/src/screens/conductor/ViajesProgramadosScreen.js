import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, RefreshControl, Linking,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';
import { reproducirSonido } from '../../services/sonido';

// Formatea el texto de hora programada (usa el texto que ya envía el backend)
function textoHora(viaje) {
  return viaje.horaProgramadaTexto || (viaje.horaProgramada
    ? new Date(viaje.horaProgramada).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
    : '');
}

export default function ViajesProgramadosScreen() {
  const { perfil } = useAuth();
  const [disponibles, setDisponibles] = useState([]);
  const [asignados, setAsignados] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [procesando, setProcesando] = useState(null);

  const cargar = useCallback(async () => {
    if (!perfil?.uid) return;
    try {
      const [resDisp, resAsig] = await Promise.all([
        api.get('/programados/disponibles'),
        api.get(`/programados/asignados/${perfil.uid}`),
      ]);
      setDisponibles(resDisp.data || []);
      setAsignados(resAsig.data || []);
    } catch (e) {
      // silencioso: la pantalla muestra listas vacías
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  }, [perfil?.uid]);

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 30000); // refrescar cada 30s
    return () => clearInterval(intervalo);
  }, [cargar]);

  const aceptar = (viaje) => {
    Alert.alert(
      '🕐 Aceptar viaje programado',
      `${textoHora(viaje)}\n📍 ${viaje.origen} → 🎯 ${viaje.destino}\n💰 $${(viaje.tarifaMadrugada || 10000).toLocaleString('es-CO')}`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, aceptar',
          onPress: async () => {
            setProcesando(viaje.id);
            try {
              await api.put(`/programados/aceptar/${viaje.id}`, {
                conductorUid: perfil.uid,
                conductorNombre: perfil.nombre || 'Conductor',
              });
              reproducirSonido();
              Alert.alert('✅ Viaje aceptado', 'El cliente será notificado con tus datos. Recibirás recordatorios antes del viaje.');
              cargar();
            } catch (err) {
              const msg = err.response?.data?.error || 'No se pudo aceptar el viaje';
              // "ya tomado" (409) o "máximo 3 por noche"
              Alert.alert('No disponible', msg);
              cargar(); // refrescar para quitar el que ya fue tomado
            } finally {
              setProcesando(null);
            }
          },
        },
      ]
    );
  };

  const marcarLlegada = (viaje) => {
    Alert.alert(
      '📍 Confirmar llegada',
      `¿Ya estás en el punto de encuentro para recoger a ${viaje.pasajeroNombre || 'tu pasajero'}?`,
      [
        { text: 'Aún no', style: 'cancel' },
        {
          text: 'Sí, llegué',
          onPress: async () => {
            setProcesando(viaje.id);
            try {
              await api.put(`/programados/llegada/${viaje.id}`, { conductorUid: perfil.uid });
              reproducirSonido();
              Alert.alert('📍 Llegada notificada', 'El cliente fue avisado de que ya llegaste.');
              cargar();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'No se pudo notificar la llegada');
            } finally {
              setProcesando(null);
            }
          },
        },
      ]
    );
  };

  if (cargando) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#FFC107" />;

  const data = [
    { tipo: 'header', key: 'h-disp', titulo: `🌙 Disponibles (${disponibles.length})` },
    ...disponibles.map((v) => ({ tipo: 'disponible', key: `d-${v.id}`, viaje: v })),
    { tipo: 'empty-disp', key: 'e-disp' },
    { tipo: 'header', key: 'h-asig', titulo: `🚖 Mis programados (${asignados.length})` },
    ...asignados.map((v) => ({ tipo: 'asignado', key: `a-${v.id}`, viaje: v })),
    { tipo: 'empty-asig', key: 'e-asig' },
  ];

  const renderItem = ({ item }) => {
    if (item.tipo === 'header') {
      return <Text style={styles.subtitulo}>{item.titulo}</Text>;
    }
    if (item.tipo === 'empty-disp' && disponibles.length === 0) {
      return <Text style={styles.vacio}>No hay viajes programados disponibles</Text>;
    }
    if (item.tipo === 'empty-asig' && asignados.length === 0) {
      return <Text style={styles.vacio}>No tienes viajes programados asignados</Text>;
    }
    if (item.tipo === 'empty-disp' || item.tipo === 'empty-asig') return null;

    const v = item.viaje;

    if (item.tipo === 'disponible') {
      return (
        <View style={styles.card}>
          <Text style={styles.cardHora}>⏰ {textoHora(v)}</Text>
          <Text style={styles.cardRuta}>📍 {v.origen}</Text>
          <Text style={styles.cardFlecha}>↓</Text>
          <Text style={styles.cardRuta}>🎯 {v.destino}</Text>
          <View style={styles.cardFooter}>
            <Text style={styles.cardTarifa}>💰 ${(v.tarifaMadrugada || 10000).toLocaleString('es-CO')}</Text>
            {!!v.cantidadPasajeros && <Text style={styles.cardMeta}>🚗 {v.cantidadPasajeros} pasajero(s)</Text>}
          </View>
          <TouchableOpacity
            style={[styles.btnAceptar, procesando === v.id && styles.btnDisabled]}
            disabled={procesando === v.id}
            onPress={() => aceptar(v)}
          >
            <Text style={styles.btnAceptarTexto}>{procesando === v.id ? 'Procesando...' : '✅ Aceptar viaje'}</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // asignado
    return (
      <View style={[styles.card, styles.cardAsignado]}>
        <Text style={styles.cardCodigo}>🎫 {v.codigoReserva || ''}</Text>
        <Text style={styles.cardHora}>⏰ {textoHora(v)}</Text>
        <Text style={styles.cardRuta}>📍 {v.puntoEncuentro || v.origen}</Text>
        <Text style={styles.cardFlecha}>↓</Text>
        <Text style={styles.cardRuta}>🎯 {v.destino}</Text>
        <Text style={styles.cardPasajero}>👤 {v.pasajeroNombre || 'Pasajero'}</Text>
        {!!v.contacto && (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${v.contacto}`)}>
            <Text style={styles.cardTelefono}>📞 {v.contacto}</Text>
          </TouchableOpacity>
        )}
        <View style={styles.activoAcciones}>
          <TouchableOpacity
            style={[styles.btnMapa]}
            onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.puntoEncuentro || v.origen || '')}`)}
          >
            <Text style={styles.btnMapaTexto}>🗺️ Mapa</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btnLlegue, procesando === v.id && styles.btnDisabled]}
            disabled={procesando === v.id}
            onPress={() => marcarLlegada(v)}
          >
            <Text style={styles.btnLlegueTexto}>📍 Llegué</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Viajes Programados 🕐</Text>
      <Text style={styles.ayuda}>Cualquier hora · anticipación 2–24 h · máx 3 por día</Text>
      <FlatList
        data={data}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} />}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  titulo: { fontSize: 22, fontWeight: 'bold', marginBottom: 2 },
  ayuda: { fontSize: 12, color: '#777', marginBottom: 12 },
  subtitulo: { fontSize: 17, fontWeight: 'bold', marginBottom: 8, marginTop: 12, color: '#555' },
  vacio: { textAlign: 'center', color: '#999', marginVertical: 12, fontSize: 14 },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, borderLeftWidth: 5, borderLeftColor: '#5C6BC0' },
  cardAsignado: { borderLeftColor: '#2E7D32' },
  cardCodigo: { fontSize: 13, fontWeight: 'bold', color: '#5C6BC0', marginBottom: 4 },
  cardHora: { fontSize: 15, fontWeight: 'bold', color: '#222', marginBottom: 6 },
  cardRuta: { fontSize: 14, color: '#333' },
  cardFlecha: { textAlign: 'center', color: '#999', fontSize: 14 },
  cardPasajero: { fontSize: 14, color: '#222', marginTop: 6, fontWeight: '600' },
  cardTelefono: { fontSize: 14, color: '#1565C0', fontWeight: '600', marginTop: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 4 },
  cardTarifa: { fontSize: 16, fontWeight: 'bold', color: '#2E7D32' },
  cardMeta: { fontSize: 13, color: '#666' },

  btnAceptar: { backgroundColor: '#5C6BC0', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8 },
  btnAceptarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnDisabled: { opacity: 0.6 },

  activoAcciones: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btnMapa: { flex: 1, backgroundColor: '#E3F2FD', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnMapaTexto: { color: '#1565C0', fontWeight: '600', fontSize: 14 },
  btnLlegue: { flex: 1, backgroundColor: '#FF9800', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnLlegueTexto: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
