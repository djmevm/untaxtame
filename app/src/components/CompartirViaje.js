import React, { useState } from 'react';
import { TouchableOpacity, Text, StyleSheet, Share, Alert, ActivityIndicator } from 'react-native';
import api from '../config/api';

const ESTADOS_COMPARTIR = ['aceptado', 'conductor_en_sitio', 'en_curso'];

export default function CompartirViaje({ servicioActivo, ubicacionConductor }) {
  const [cargando, setCargando] = useState(false);

  if (!servicioActivo) return null;
  if (!ESTADOS_COMPARTIR.includes(servicioActivo.estado)) return null;

  const compartir = async () => {
    setCargando(true);
    try {
      let linkSeguimiento = '';
      try {
        const res = await api.post(`/services/${servicioActivo.id}/compartir`);
        linkSeguimiento = res.data?.url || '';
      } catch {}

      const {
        clienteNombre, conductorNombre, conductorPlaca,
        origen, destino, ubicacionGPS, estado,
      } = servicioActivo;

      const lat = ubicacionConductor?.lat || ubicacionGPS?.lat;
      const lng = ubicacionConductor?.lng || ubicacionGPS?.lng;
      const mapsLink = (lat && lng)
        ? `https://www.google.com/maps?q=${lat},${lng}`
        : '';

      const estadoTexto = {
        aceptado: 'Conductor en camino',
        conductor_en_sitio: 'Conductor en el punto',
        en_curso: 'Viaje en curso',
      }[estado] || estado;

      const mensaje =
        `🚕 *Mi viaje en UntaXtame*\n\n` +
        `📡 Estado: ${estadoTexto}\n` +
        `👤 Pasajero: ${clienteNombre || '—'}\n` +
        `🧑‍✈️ Conductor: ${conductorNombre || 'Asignando...'}\n` +
        `🚗 Placa: ${conductorPlaca || '—'}\n` +
        `📍 Origen: ${origen || '—'}\n` +
        `🏁 Destino: ${destino || '—'}\n` +
        (linkSeguimiento
          ? `\n🔗 Sigue el viaje en vivo:\n${linkSeguimiento}\n`
          : mapsLink
            ? `\n📌 Ubicación:\n${mapsLink}\n`
            : '') +
        `\n⏰ ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}\n` +
        `\n_Comparte solo con personas de confianza._`;

      await Share.share({ message: mensaje, title: 'Mi viaje UntaXtame' });
    } catch {
      Alert.alert('Error', 'No se pudo compartir el viaje.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <TouchableOpacity
      style={styles.boton}
      onPress={compartir}
      activeOpacity={0.85}
      disabled={cargando}
    >
      {cargando ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.botonTexto}>📤 Compartir con un familiar</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  boton: {
    backgroundColor: '#25D366',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginVertical: 12,
    elevation: 3,
  },
  botonTexto: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
