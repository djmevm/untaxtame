import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Alert, Vibration, AppState
} from 'react-native';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import * as Location from 'expo-location';
import api from '../config/api';

// ═══ CÓDIGOS DE VOZ EN CLAVE ═══
// H1 = Atraco / Robo (emergencia silenciosa)
// H2 = Secuestro o Muerto en la vía (emergencia silenciosa)

const CLAVES_EMERGENCIA = {
  // H1 = Atraco / Robo
  'h1': { tipo: 'robo', label: '🔫 Atraco / Robo', silenciosa: true, categoria: 'emergencia' },
  'hache1': { tipo: 'robo', label: '🔫 Atraco / Robo', silenciosa: true, categoria: 'emergencia' },
  'hache 1': { tipo: 'robo', label: '🔫 Atraco / Robo', silenciosa: true, categoria: 'emergencia' },
  'hache uno': { tipo: 'robo', label: '🔫 Atraco / Robo', silenciosa: true, categoria: 'emergencia' },
  'h uno': { tipo: 'robo', label: '🔫 Atraco / Robo', silenciosa: true, categoria: 'emergencia' },
  // H2 = Secuestro o Muerto en la vía
  'h2': { tipo: 'secuestro', label: '🚨 Secuestro / Muerto en la vía', silenciosa: true, categoria: 'emergencia' },
  'hache2': { tipo: 'secuestro', label: '🚨 Secuestro / Muerto en la vía', silenciosa: true, categoria: 'emergencia' },
  'hache 2': { tipo: 'secuestro', label: '🚨 Secuestro / Muerto en la vía', silenciosa: true, categoria: 'emergencia' },
  'hache dos': { tipo: 'secuestro', label: '🚨 Secuestro / Muerto en la vía', silenciosa: true, categoria: 'emergencia' },
  'h dos': { tipo: 'secuestro', label: '🚨 Secuestro / Muerto en la vía', silenciosa: true, categoria: 'emergencia' },
};

export default function ReconocimientoVozSOS({ servicioId, usuarioUid }) {
  const [escuchando, setEscuchando] = useState(false);
  const [permisoOk, setPermisoOk] = useState(false);
  const [ultimaDeteccion, setUltimaDeteccion] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cooldownRef = useRef(false);
  const ultimoCodigoRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  // Solicitar permisos al montar (pero NO auto-iniciar)
  useEffect(() => {
    const solicitarPermisos = async () => {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setPermisoOk(result.granted);
    };
    solicitarPermisos();
    return () => { try { ExpoSpeechRecognitionModule.stop(); } catch {} };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/active/) && nextState.match(/background|inactive/)) {
        try { ExpoSpeechRecognitionModule.stop(); } catch {}
        setEscuchando(false);
      }
      appStateRef.current = nextState;
    });
    return () => subscription?.remove();
  }, [permisoOk]);

  // Evento: resultado del reconocimiento de voz
  useSpeechRecognitionEvent('result', (event) => {
    if (cooldownRef.current) return;

    const textos = event.results?.map(r => r?.transcript?.toLowerCase().trim()) || [];

    for (const texto of textos) {
      if (!texto) continue;

      // Buscar claves de emergencia H1/H2
      for (const [clave, config] of Object.entries(CLAVES_EMERGENCIA)) {
        if (texto.includes(clave)) {
          if (ultimoCodigoRef.current === config.tipo) return;
          ultimoCodigoRef.current = config.tipo;
          setTimeout(() => { ultimoCodigoRef.current = null; }, 30000);
          activarEmergencia(config);
          return;
        }
      }
    }
  });

  useSpeechRecognitionEvent('error', () => {
    if (escuchando) setTimeout(() => iniciarEscucha(), 300);
  });

  useSpeechRecognitionEvent('end', () => {
    // Reiniciar inmediatamente para mantener siempre activo
    if (escuchando) setTimeout(() => iniciarEscucha(), 100);
  });

  const iniciarEscucha = async () => {
    if (!permisoOk) {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!result.granted) {
        Alert.alert('Permiso requerido', 'Necesitamos acceso al micrófono para comandos de voz.');
        return;
      }
      setPermisoOk(true);
    }
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'es-CO',
        interimResults: false,
        continuous: true,
        requiresOnDeviceRecognition: false,
      });
      setEscuchando(true);
    } catch (err) {
      console.log('[VOZ] Error al iniciar:', err);
    }
  };

  const detenerEscucha = () => {
    try { ExpoSpeechRecognitionModule.stop(); } catch {}
    setEscuchando(false);
  };

  const toggleEscucha = () => {
    if (escuchando) detenerEscucha();
    else iniciarEscucha();
  };


  // ═══ ACTIVAR EMERGENCIA H1/H2 ═══
  const activarEmergencia = async (config) => {
    if (cooldownRef.current || enviando) return;
    cooldownRef.current = true;
    setEnviando(true);
    setTimeout(() => { cooldownRef.current = false; }, 30000);

    if (config.silenciosa) {
      Vibration.vibrate(100);
    } else {
      Vibration.vibrate([0, 200, 100, 200]);
    }

    setUltimaDeteccion(config.label);

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
        tipoEmergencia: config.tipo,
        mensaje: `🎙️ ALERTA POR VOZ: ${config.label}`,
      });

      if (!config.silenciosa) {
        Alert.alert('🚨 Emergencia activada', `${config.label}\n\nPlataforma y conductores notificados.`);
      }
    } catch {
      if (!config.silenciosa) {
        Alert.alert('Error', 'No se pudo enviar la alerta.');
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.boton, escuchando && styles.botonActivo]}
        onPress={toggleEscucha}
        activeOpacity={0.7}
      >
        <Text style={styles.botonIcono}>{escuchando ? '🎙️' : '🎤'}</Text>
        <Text style={styles.botonTexto}>{escuchando ? 'ON' : 'VOZ'}</Text>
      </TouchableOpacity>

      {ultimaDeteccion && (
        <View style={styles.deteccionBadge}>
          <Text style={styles.deteccionTexto}>✓</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 150,
    right: 20,
    zIndex: 49,
    alignItems: 'center',
  },
  boton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1565C0',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  botonActivo: {
    backgroundColor: '#2E7D32',
  },
  botonIcono: { fontSize: 20 },
  botonTexto: { color: '#fff', fontSize: 8, fontWeight: 'bold', marginTop: -2 },
  deteccionBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deteccionTexto: { color: '#fff', fontSize: 9, fontWeight: 'bold' },
});
