import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, Linking, Vibration, Modal, FlatList
} from 'react-native';
import * as Location from 'expo-location';
import api from '../config/api';

const NUMERO_EMERGENCIA = '123';

const TIPOS_EMERGENCIA = [
  { id: 'accidente', icon: '🚗💥', label: 'Accidente de tránsito', color: '#E53935' },
  { id: 'robo', icon: '🔫', label: 'Robo / Atraco', color: '#B71C1C' },
  { id: 'secuestro', icon: '🚨', label: 'Secuestro', color: '#880E4F' },
  { id: 'mecanico', icon: '🔧', label: 'Problemas mecánicos', color: '#E65100' },
  { id: 'pinchado', icon: '🛞', label: 'Llanta pinchada', color: '#F57F17' },
  { id: 'otro', icon: '⚠️', label: 'Otra emergencia', color: '#455A64' },
];

export default function BotonSOS({ servicioId }) {
  const [modalVisible, setModalVisible] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [misAlertas, setMisAlertas] = useState([]);

  // Cargar mis alertas activas
  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await api.get('/emergencia/mis-alertas');
        setMisAlertas(res.data);
      } catch {}
    };
    cargar();
    const intervalo = setInterval(cargar, 15000);
    return () => clearInterval(intervalo);
  }, []);

  const activarSOS = () => {
    Vibration.vibrate([0, 200, 100, 200]);
    setModalVisible(true);
  };

  const enviarEmergencia = async (tipo) => {
    setEnviando(true);
    try {
      let ubicacion = null;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          ubicacion = { lat: loc.coords.latitude, lng: loc.coords.longitude };
        }
      } catch {}

      await api.post('/emergencia/sos', {
        servicioId: servicioId || null,
        ubicacionLat: ubicacion?.lat || null,
        ubicacionLng: ubicacion?.lng || null,
        tipoEmergencia: tipo.id,
        mensaje: `${tipo.icon} ${tipo.label}`,
      });

      // Recargar mis alertas
      const res = await api.get('/emergencia/mis-alertas');
      setMisAlertas(res.data);

      setModalVisible(false);
      Vibration.vibrate(500);

      if (['robo', 'secuestro', 'accidente'].includes(tipo.id)) {
        Alert.alert('🚨 Alerta enviada', `${tipo.label}\n\n¿Llamar al 123?`, [
          { text: 'OK' },
          { text: '📞 Llamar 123', onPress: () => Linking.openURL(`tel:${NUMERO_EMERGENCIA}`) },
        ]);
      } else {
        Alert.alert('✅ Reporte enviado', `${tipo.label}\nLos conductores cercanos fueron notificados.`);
      }
    } catch {
      Alert.alert('Error', 'No se pudo enviar. Llama al 123.');
    } finally {
      setEnviando(false);
    }
  };

  const retirarAlerta = (alerta) => {
    Alert.alert('Retirar alerta', `¿Retirar la alerta "${alerta.mensaje}"?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí, retirar', onPress: async () => {
          try {
            await api.put(`/emergencia/retirar/${alerta.id}`);
            setMisAlertas(prev => prev.filter(a => a.id !== alerta.id));
            Alert.alert('✅', 'Alerta retirada');
          } catch {
            Alert.alert('Error', 'No se pudo retirar');
          }
        }
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Botón SOS */}
      <TouchableOpacity
        style={[styles.boton, misAlertas.length > 0 && styles.botonActivo]}
        onPress={activarSOS}
        activeOpacity={0.7}
      >
        <Text style={styles.botonIcono}>🚨</Text>
        <Text style={styles.botonTexto}>SOS</Text>
        {misAlertas.length > 0 && (
          <View style={styles.botonBadge}>
            <Text style={styles.botonBadgeTexto}>{misAlertas.length}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>🚨 Emergencia SOS</Text>

            {/* Mis alertas activas */}
            {misAlertas.length > 0 && (
              <View style={styles.misAlertasSection}>
                <Text style={styles.misAlertasTitulo}>Tus alertas activas:</Text>
                {misAlertas.map((a) => (
                  <View key={a.id} style={styles.miAlertaItem}>
                    <Text style={styles.miAlertaTexto}>{a.mensaje}</Text>
                    <TouchableOpacity onPress={() => retirarAlerta(a)}>
                      <Text style={styles.miAlertaRetirar}>✕ Retirar</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.modalSub}>Reportar nueva emergencia:</Text>

            {TIPOS_EMERGENCIA.map((tipo) => (
              <TouchableOpacity
                key={tipo.id}
                style={[styles.tipoBtn, { borderLeftColor: tipo.color }]}
                onPress={() => enviarEmergencia(tipo)}
                disabled={enviando}
              >
                {enviando ? (
                  <ActivityIndicator size="small" color={tipo.color} />
                ) : (
                  <>
                    <Text style={styles.tipoIcon}>{tipo.icon}</Text>
                    <Text style={styles.tipoLabel}>{tipo.label}</Text>
                  </>
                )}
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.btnLlamar}
              onPress={() => { setModalVisible(false); Linking.openURL(`tel:${NUMERO_EMERGENCIA}`); }}>
              <Text style={styles.btnLlamarTexto}>📞 Llamar al 123</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnCerrar} onPress={() => setModalVisible(false)}>
              <Text style={styles.btnCerrarTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', bottom: 80, right: 20, zIndex: 50 },
  boton: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#E53935',
    alignItems: 'center', justifyContent: 'center', elevation: 8,
  },
  botonActivo: { backgroundColor: '#B71C1C' },
  botonIcono: { fontSize: 22 },
  botonTexto: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  botonBadge: {
    position: 'absolute', top: -4, right: -4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#FFC107', alignItems: 'center', justifyContent: 'center',
  },
  botonBadgeTexto: { fontSize: 11, fontWeight: 'bold', color: '#000' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 32 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 12 },
  modalSub: { fontSize: 14, color: '#888', marginBottom: 12, fontWeight: '600' },

  misAlertasSection: { backgroundColor: '#FFF3E0', borderRadius: 12, padding: 14, marginBottom: 16 },
  misAlertasTitulo: { fontSize: 13, fontWeight: 'bold', color: '#E65100', marginBottom: 8 },
  miAlertaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  miAlertaTexto: { fontSize: 14, color: '#333', flex: 1 },
  miAlertaRetirar: { color: '#E53935', fontWeight: 'bold', fontSize: 13, marginLeft: 10 },

  tipoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#f9f9f9', borderRadius: 12, padding: 14,
    marginBottom: 8, borderLeftWidth: 5, elevation: 1,
  },
  tipoIcon: { fontSize: 26 },
  tipoLabel: { fontSize: 15, fontWeight: '600', color: '#333' },
  btnLlamar: { backgroundColor: '#E53935', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  btnLlamarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnCerrar: { padding: 14, alignItems: 'center', marginTop: 4 },
  btnCerrarTexto: { color: '#999', fontWeight: 'bold', fontSize: 15 },
});
