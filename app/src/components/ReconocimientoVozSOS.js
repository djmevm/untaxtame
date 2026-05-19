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
// Emergencias silenciosas (H1, H2)
// Códigos operativos de radio (20-X)

const CLAVES_EMERGENCIA = {
  // H1 = Atraco (silenciosa)
  'h1': { tipo: 'robo', label: '🔫 Atraco / Robo', silenciosa: true, categoria: 'emergencia' },
  'hache1': { tipo: 'robo', label: '🔫 Atraco / Robo', silenciosa: true, categoria: 'emergencia' },
  'hache 1': { tipo: 'robo', label: '🔫 Atraco / Robo', silenciosa: true, categoria: 'emergencia' },
  'hache uno': { tipo: 'robo', label: '🔫 Atraco / Robo', silenciosa: true, categoria: 'emergencia' },
  'h uno': { tipo: 'robo', label: '🔫 Atraco / Robo', silenciosa: true, categoria: 'emergencia' },
  // H2 = Accidente
  'h2': { tipo: 'accidente', label: '🚗💥 Accidente', silenciosa: false, categoria: 'emergencia' },
  'hache2': { tipo: 'accidente', label: '🚗💥 Accidente', silenciosa: false, categoria: 'emergencia' },
  'hache 2': { tipo: 'accidente', label: '🚗💥 Accidente', silenciosa: false, categoria: 'emergencia' },
  'hache dos': { tipo: 'accidente', label: '🚗💥 Accidente', silenciosa: false, categoria: 'emergencia' },
  'h dos': { tipo: 'accidente', label: '🚗💥 Accidente', silenciosa: false, categoria: 'emergencia' },
};

// ═══ CÓDIGOS DE RADIO 20-X ═══
const CODIGOS_RADIO = {
  // 20-1 Tomé el servicio
  '20-1': { codigo: '20-1', label: '🚕 Tomé el servicio', accion: 'tomar_servicio', color: '#1565C0' },
  '201': { codigo: '20-1', label: '🚕 Tomé el servicio', accion: 'tomar_servicio', color: '#1565C0' },
  '20 1': { codigo: '20-1', label: '🚕 Tomé el servicio', accion: 'tomar_servicio', color: '#1565C0' },
  'veinte uno': { codigo: '20-1', label: '🚕 Tomé el servicio', accion: 'tomar_servicio', color: '#1565C0' },
  'veinte 1': { codigo: '20-1', label: '🚕 Tomé el servicio', accion: 'tomar_servicio', color: '#1565C0' },
  // 20-2 Ya recogí el servicio
  '20-2': { codigo: '20-2', label: '📍 Ya recogí el pasajero', accion: 'recoger_servicio', color: '#FF9800' },
  '202': { codigo: '20-2', label: '📍 Ya recogí el pasajero', accion: 'recoger_servicio', color: '#FF9800' },
  '20 2': { codigo: '20-2', label: '📍 Ya recogí el pasajero', accion: 'recoger_servicio', color: '#FF9800' },
  'veinte dos': { codigo: '20-2', label: '📍 Ya recogí el pasajero', accion: 'recoger_servicio', color: '#FF9800' },
  'veinte 2': { codigo: '20-2', label: '📍 Ya recogí el pasajero', accion: 'recoger_servicio', color: '#FF9800' },
  // 20-3 Terminé el servicio
  '20-3': { codigo: '20-3', label: '✅ Terminé el servicio', accion: 'terminar_servicio', color: '#2E7D32' },
  '203': { codigo: '20-3', label: '✅ Terminé el servicio', accion: 'terminar_servicio', color: '#2E7D32' },
  '20 3': { codigo: '20-3', label: '✅ Terminé el servicio', accion: 'terminar_servicio', color: '#2E7D32' },
  'veinte tres': { codigo: '20-3', label: '✅ Terminé el servicio', accion: 'terminar_servicio', color: '#2E7D32' },
  'veinte 3': { codigo: '20-3', label: '✅ Terminé el servicio', accion: 'terminar_servicio', color: '#2E7D32' },
  // 20-4 Servicio cancelado
  '20-4': { codigo: '20-4', label: '❌ Servicio cancelado', accion: 'cancelar_servicio', color: '#E53935' },
  '204': { codigo: '20-4', label: '❌ Servicio cancelado', accion: 'cancelar_servicio', color: '#E53935' },
  '20 4': { codigo: '20-4', label: '❌ Servicio cancelado', accion: 'cancelar_servicio', color: '#E53935' },
  'veinte cuatro': { codigo: '20-4', label: '❌ Servicio cancelado', accion: 'cancelar_servicio', color: '#E53935' },
  'veinte 4': { codigo: '20-4', label: '❌ Servicio cancelado', accion: 'cancelar_servicio', color: '#E53935' },
  // 20-13 Estoy varado
  '20-13': { codigo: '20-13', label: '🔧 Estoy varado', accion: 'varado', color: '#E65100' },
  '2013': { codigo: '20-13', label: '🔧 Estoy varado', accion: 'varado', color: '#E65100' },
  '20 13': { codigo: '20-13', label: '🔧 Estoy varado', accion: 'varado', color: '#E65100' },
  'veinte trece': { codigo: '20-13', label: '🔧 Estoy varado', accion: 'varado', color: '#E65100' },
  // 20-15 Carrera sospechosa
  '20-15': { codigo: '20-15', label: '⚠️ Carrera sospechosa', accion: 'sospechosa', color: '#880E4F' },
  '2015': { codigo: '20-15', label: '⚠️ Carrera sospechosa', accion: 'sospechosa', color: '#880E4F' },
  '20 15': { codigo: '20-15', label: '⚠️ Carrera sospechosa', accion: 'sospechosa', color: '#880E4F' },
  'veinte quince': { codigo: '20-15', label: '⚠️ Carrera sospechosa', accion: 'sospechosa', color: '#880E4F' },
  // 20-20 Muerto en la vía
  '20-20': { codigo: '20-20', label: '💀 Muerto en la vía', accion: 'muerto_via', color: '#000000' },
  '2020': { codigo: '20-20', label: '💀 Muerto en la vía', accion: 'muerto_via', color: '#000000' },
  '20 20': { codigo: '20-20', label: '💀 Muerto en la vía', accion: 'muerto_via', color: '#000000' },
  'veinte veinte': { codigo: '20-20', label: '💀 Muerto en la vía', accion: 'muerto_via', color: '#000000' },
};

export default function ReconocimientoVozSOS({ servicioId, usuarioUid }) {
  const [escuchando, setEscuchando] = useState(false);
  const [permisoOk, setPermisoOk] = useState(false);
  const [ultimaDeteccion, setUltimaDeteccion] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const cooldownRef = useRef(false);
  const ultimoCodigoRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  // Auto-iniciar al montar
  useEffect(() => {
    const autoIniciar = async () => {
      const result = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      setPermisoOk(result.granted);
      if (result.granted) {
        setTimeout(() => iniciarEscucha(), 500);
      }
    };
    autoIniciar();
    return () => { try { ExpoSpeechRecognitionModule.stop(); } catch {} };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (appStateRef.current.match(/active/) && nextState.match(/background|inactive/)) {
        try { ExpoSpeechRecognitionModule.stop(); } catch {}
        setEscuchando(false);
      } else if (nextState === 'active' && permisoOk) {
        // Reiniciar al volver a la app
        setTimeout(() => iniciarEscucha(), 300);
      }
      appStateRef.current = nextState;
    });
    return () => subscription?.remove();
  }, [permisoOk]);

  // Evento: resultado del reconocimiento de voz
  useSpeechRecognitionEvent('result', (event) => {
    if (cooldownRef.current) return; // Ignorar si está en cooldown

    const textos = event.results?.map(r => r?.transcript?.toLowerCase().trim()) || [];

    for (const texto of textos) {
      if (!texto) continue;

      // Primero buscar códigos de radio 20-X (más específicos)
      for (const [clave, config] of Object.entries(CODIGOS_RADIO)) {
        if (texto.includes(clave)) {
          // Evitar duplicado del mismo código
          if (ultimoCodigoRef.current === config.codigo) return;
          ultimoCodigoRef.current = config.codigo;
          setTimeout(() => { ultimoCodigoRef.current = null; }, 15000);
          ejecutarCodigoRadio(config);
          return;
        }
      }

      // Luego buscar claves de emergencia H1/H2
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
        interimResults: true,
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

  // ═══ EJECUTAR CÓDIGO DE RADIO 20-X ═══
  const ejecutarCodigoRadio = async (config) => {
    if (cooldownRef.current || enviando) return;
    cooldownRef.current = true;
    setEnviando(true);
    setTimeout(() => { cooldownRef.current = false; }, 10000);

    Vibration.vibrate([0, 150, 100, 150]);
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

      // Enviar código de radio al backend
      await api.post('/radio/codigo', {
        codigo: config.codigo,
        accion: config.accion,
        label: config.label,
        servicioId: servicioId || null,
        ubicacionLat: ubicacion?.lat || null,
        ubicacionLng: ubicacion?.lng || null,
      });

      Alert.alert(
        `📻 ${config.codigo}`,
        `${config.label}\n\nReportado al panel de control.`
      );
    } catch (err) {
      Alert.alert('Error', 'No se pudo enviar el código. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
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
