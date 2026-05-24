import React from 'react';
import { TouchableOpacity, Text, StyleSheet, Share, Alert } from 'react-native';

export default function CompartirViaje({ servicioActivo }) {
  if (!servicioActivo) return null;

  const compartir = async () => {
    const { clienteNombre, conductorNombre, conductorPlaca, origen, destino, ubicacionGPS } = servicioActivo;

    const mapsLink = ubicacionGPS
      ? `https://www.google.com/maps?q=${ubicacionGPS.lat},${ubicacionGPS.lng}`
      : '';

    const mensaje =
      `🚕 *Mi viaje en UntaXtame*\n\n` +
      `👤 Cliente: ${clienteNombre || 'No disponible'}\n` +
      `🧑‍✈️ Conductor: ${conductorNombre || 'Asignando...'}\n` +
      `🚗 Placa: ${conductorPlaca || '---'}\n` +
      `📍 Origen: ${origen || 'No especificado'}\n` +
      `🏁 Destino: ${destino || 'No especificado'}\n` +
      (mapsLink ? `\n📌 Mi ubicación:\n${mapsLink}\n` : '') +
      `\n⏰ ${new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}`;

    try {
      await Share.share({ message: mensaje });
    } catch {
      Alert.alert('Error', 'No se pudo compartir el viaje.');
    }
  };

  return (
    <TouchableOpacity style={styles.boton} onPress={compartir} activeOpacity={0.85}>
      <Text style={styles.botonTexto}>📤 Compartir viaje</Text>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  botonTexto: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
