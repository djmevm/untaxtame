import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useAlertasWebSocket } from '../hooks/useWebSocket';
import api from '../config/api';
import { reproducirSonidoSOS } from '../services/sonido';

const ICONOS = {
  accidente: '🚗💥', robo: '🔫', secuestro: '🚨',
  mecanico: '🔧', pinchado: '🛞', otro: '⚠️',
};

const COLORES = {
  accidente: '#E53935', robo: '#B71C1C', secuestro: '#880E4F',
  mecanico: '#E65100', pinchado: '#F57F17', otro: '#455A64',
};

export default function AlertasConductores() {
  const [alertas, setAlertas] = useState([]);
  const cantidadAnterior = useRef(0);
  const { usuario } = useAuth();

  // ═══ WEBSOCKET: Recibir alertas en tiempo real ═══
  const { alertas: alertasWS, conectado } = useAlertasWebSocket(usuario?.uid);

  // Agregar alertas recibidas por WebSocket
  useEffect(() => {
    if (alertasWS.length > 0) {
      const ultima = alertasWS[0];
      setAlertas(prev => {
        if (prev.some(a => a.emergenciaId === ultima.emergenciaId)) return prev;
        reproducirSonidoSOS();
        return [ultima, ...prev];
      });
    }
  }, [alertasWS]);

  // Carga inicial + fallback polling (cada 120s si WS conectado, 60s si no)
  useEffect(() => {
    const cargar = async () => {
      try {
        const res = await api.get('/emergencia/alertas-conductores');
        const activas = res.data.filter(a => !a.resuelta);
        if (activas.length > cantidadAnterior.current && cantidadAnterior.current > 0) {
          reproducirSonidoSOS();
        }
        cantidadAnterior.current = activas.length;
        setAlertas(activas);
      } catch {}
    };

    cargar();
    const intervaloMs = conectado ? 120000 : 60000; // 2min con WS, 1min sin WS
    const intervalo = setInterval(cargar, intervaloMs);
    return () => clearInterval(intervalo);
  }, [conectado]);

  if (alertas.length === 0) return null;

  return (
    <View style={styles.container}>
      {alertas.map((alerta) => (
        <View key={alerta.id} style={[styles.alertaCard, { borderLeftColor: COLORES[alerta.tipoEmergencia] || '#E53935' }]}>
          <View style={styles.alertaHeader}>
            <Text style={styles.alertaIcono}>{ICONOS[alerta.tipoEmergencia] || '⚠️'}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.alertaTitulo}>{alerta.mensaje}</Text>
              <Text style={styles.alertaNombre}>
                {alerta.nombre} — hace {Math.round((Date.now() - new Date(alerta.creadoEn).getTime()) / 1000 / 60)} min
              </Text>
            </View>
          </View>

          {alerta.servicio && (
            <Text style={styles.alertaRuta}>
              📍 {alerta.servicio.origen} → {alerta.servicio.destino}
              {alerta.servicio.conductorPlaca ? ` | Placa: ${alerta.servicio.conductorPlaca}` : ''}
            </Text>
          )}

          {alerta.ubicacion && (
            <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps?q=${alerta.ubicacion.lat},${alerta.ubicacion.lng}`)}>
              <Text style={styles.alertaUbicacion}>📌 Ver ubicación en mapa</Text>
            </TouchableOpacity>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  alertaCard: {
    backgroundColor: '#FFF3E0', borderRadius: 12, padding: 14,
    marginBottom: 8, borderLeftWidth: 5, elevation: 2,
  },
  alertaHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  alertaIcono: { fontSize: 28 },
  alertaTitulo: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  alertaNombre: { fontSize: 12, color: '#888' },
  alertaRuta: { fontSize: 12, color: '#555', marginBottom: 4 },
  alertaUbicacion: { fontSize: 13, color: '#1565C0', fontWeight: '600' },
});
