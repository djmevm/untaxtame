import React, { useState, useEffect } from 'react';
import {
  View, TouchableOpacity, Text, StyleSheet, Share, Alert,
  ActivityIndicator, Linking,
} from 'react-native';
import api from '../config/api';

const ESTADOS_COMPARTIR = ['aceptado', 'conductor_en_sitio', 'en_curso'];

export default function CompartirViaje({ servicioActivo, ubicacionConductor }) {
  const [cargando, setCargando] = useState(false);
  const [contactos, setContactos] = useState([]);

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await api.get('/users/contactos-confianza');
        if (activo) setContactos(res.data?.contactos || []);
      } catch {}
    })();
    return () => { activo = false; };
  }, []);

  if (!servicioActivo) return null;
  if (!ESTADOS_COMPARTIR.includes(servicioActivo.estado)) return null;

  const armarMensaje = async () => {
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

    return (
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
      `\n_Comparte solo con personas de confianza._`
    );
  };

  const compartir = async () => {
    setCargando(true);
    try {
      const mensaje = await armarMensaje();
      await Share.share({ message: mensaje, title: 'Mi viaje UntaXtame' });
    } catch {
      Alert.alert('Error', 'No se pudo compartir el viaje.');
    } finally {
      setCargando(false);
    }
  };

  const avisarContactos = async () => {
    if (!contactos.length) {
      return Alert.alert(
        'Sin contactos',
        'Agrega contactos de confianza en tu Perfil para avisarles automáticamente.'
      );
    }
    setCargando(true);
    try {
      const res = await api.post(`/services/${servicioActivo.id}/alerta-seguridad`, {
        tipo: 'manual',
      });
      const n = res.data?.contactosNotificados || 0;
      if (n > 0) {
        Alert.alert('✅ Avisados', `${n} contacto(s) recibieron el enlace de seguimiento.`);
      } else {
        // Fallback: abrir WhatsApp al primero
        const mensaje = await armarMensaje();
        const tel = String(contactos[0].telefono).replace(/\D/g, '');
        const wa = tel.startsWith('57') ? tel : `57${tel}`;
        Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent(mensaje)}`);
      }
    } catch {
      Alert.alert('Error', 'No se pudo avisar a tus contactos.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <View style={styles.wrap}>
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
      {contactos.length > 0 && (
        <TouchableOpacity
          style={styles.botonConfianza}
          onPress={avisarContactos}
          disabled={cargando}
          activeOpacity={0.85}
        >
          <Text style={styles.botonConfianzaTexto}>
            🔐 Avisar a mis {contactos.length} contacto(s)
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginVertical: 8 },
  boton: {
    backgroundColor: '#25D366',
    borderRadius: 25,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    elevation: 3,
  },
  botonTexto: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  botonConfianza: {
    marginTop: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 25,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#1565C0',
  },
  botonConfianzaTexto: {
    color: '#1565C0',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
