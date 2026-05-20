import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import api from '../config/api';
import { reproducirOfertaRecibida } from '../services/sonido';

export default function OfertasRecibidas({ servicioId, onAceptar }) {
  const [ofertas, setOfertas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [aceptando, setAceptando] = useState(null);
  const cantidadAnterior = useRef(0);

  const cargarOfertas = async () => {
    try {
      const res = await api.get(`/ofertas/${servicioId}`);
      if (res.data.length > cantidadAnterior.current && cantidadAnterior.current > 0) {
        reproducirOfertaRecibida();
      }
      cantidadAnterior.current = res.data.length;
      setOfertas(res.data);
    } catch {}
    finally { setCargando(false); }
  };

  // Polling cada 5 segundos para ver nuevas ofertas
  useEffect(() => {
    cargarOfertas();
    const intervalo = setInterval(cargarOfertas, 60000); // Cada 60 seg
    return () => clearInterval(intervalo);
  }, [servicioId]);

  const aceptarOferta = (oferta) => {
    Alert.alert(
      'Aceptar oferta',
      `¿Aceptas la oferta de ${oferta.conductorNombre} por $${oferta.monto.toLocaleString('es-CO')}?${oferta.conductorPlaca ? `\nPlaca: ${oferta.conductorPlaca}` : ''}${oferta.mensaje ? `\n"${oferta.mensaje}"` : ''}`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Aceptar', onPress: async () => {
            setAceptando(oferta.id);
            try {
              await api.put(`/ofertas/${servicioId}/aceptar/${oferta.id}`);
              Alert.alert('¡Conductor asignado!', `${oferta.conductorNombre} viene en camino.\nTarifa acordada: $${oferta.monto.toLocaleString('es-CO')}`);
              if (onAceptar) onAceptar(oferta);
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'No se pudo aceptar la oferta');
            } finally {
              setAceptando(null);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>🏷️ Ofertas de conductores</Text>

      {cargando && ofertas.length === 0 && (
        <View style={styles.esperando}>
          <ActivityIndicator size="small" color="#FFC107" />
          <Text style={styles.esperandoTexto}>Buscando conductores...</Text>
        </View>
      )}

      {!cargando && ofertas.length === 0 && (
        <View style={styles.esperando}>
          <Text style={styles.esperandoIcon}>📡</Text>
          <Text style={styles.esperandoTexto}>Esperando ofertas de conductores...</Text>
          <Text style={styles.esperandoSub}>Los conductores cercanos verán tu solicitud</Text>
        </View>
      )}

      {ofertas.map((oferta) => (
        <View key={oferta.id} style={styles.ofertaCard}>
          <View style={styles.ofertaHeader}>
            <View>
              <Text style={styles.conductorNombre}>🚕 {oferta.conductorNombre}</Text>
              {oferta.conductorPlaca && (
                <Text style={styles.conductorPlaca}>{oferta.conductorPlaca}</Text>
              )}
            </View>
            <Text style={styles.ofertaMonto}>${oferta.monto.toLocaleString('es-CO')}</Text>
          </View>

          {/* Reputación del conductor */}
          {oferta.reputacion && (
            <View style={styles.reputacionRow}>
              <Text style={styles.reputacionItem}>⭐ {oferta.reputacion.promedio || '—'}/10</Text>
              <Text style={styles.reputacionItem}>📊 {oferta.reputacion.porcentaje || 0}%</Text>
              <Text style={styles.reputacionItem}>🚕 {oferta.viajesCompletados || 0} viajes</Text>
            </View>
          )}

          {oferta.mensaje ? (
            <Text style={styles.ofertaMensaje}>"{oferta.mensaje}"</Text>
          ) : null}

          {oferta.conductorCelular && (
            <Text style={styles.ofertaCelular}>📞 {oferta.conductorCelular}</Text>
          )}

          <TouchableOpacity
            style={styles.btnAceptar}
            onPress={() => aceptarOferta(oferta)}
            disabled={aceptando === oferta.id}
          >
            {aceptando === oferta.id
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.btnAceptarTexto}>✅ ACEPTAR ESTA OFERTA</Text>
            }
          </TouchableOpacity>
        </View>
      ))}

      {ofertas.length > 0 && (
        <Text style={styles.hint}>
          {ofertas.length} oferta{ofertas.length > 1 ? 's' : ''} recibida{ofertas.length > 1 ? 's' : ''}. Elige la que prefieras.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, marginBottom: 12, elevation: 2,
  },
  titulo: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  esperando: { alignItems: 'center', paddingVertical: 20 },
  esperandoIcon: { fontSize: 36, marginBottom: 8 },
  esperandoTexto: { color: '#888', fontSize: 14, marginTop: 8 },
  esperandoSub: { color: '#bbb', fontSize: 12, marginTop: 4 },

  ofertaCard: {
    backgroundColor: '#f9f9f9', borderRadius: 12, padding: 14,
    marginBottom: 10, borderLeftWidth: 4, borderLeftColor: '#FFC107',
  },
  ofertaHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
  },
  conductorNombre: { fontSize: 16, fontWeight: 'bold', color: '#222' },
  conductorPlaca: { fontSize: 13, color: '#FFC107', fontWeight: 'bold', letterSpacing: 1, marginTop: 2 },
  ofertaMonto: { fontSize: 22, fontWeight: 'bold', color: '#2E7D32' },
  reputacionRow: {
    flexDirection: 'row', gap: 12, marginBottom: 8,
    backgroundColor: '#F0FDF4', borderRadius: 8, padding: 8,
  },
  reputacionItem: { fontSize: 12, color: '#333', fontWeight: '600' },
  ofertaMensaje: { fontSize: 13, color: '#666', fontStyle: 'italic', marginBottom: 8 },
  ofertaCelular: { fontSize: 13, color: '#1565C0', marginBottom: 8 },
  btnAceptar: {
    backgroundColor: '#FFC107', borderRadius: 8, padding: 12, alignItems: 'center',
  },
  btnAceptarTexto: { fontWeight: 'bold', fontSize: 14, color: '#000' },
  hint: { textAlign: 'center', color: '#999', fontSize: 12, marginTop: 8 },
});
