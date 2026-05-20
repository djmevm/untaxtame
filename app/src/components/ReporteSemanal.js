import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import api from '../config/api';

export default function ReporteSemanal({ uid }) {
  const [reporte, setReporte] = useState(null);
  const [mostrar, setMostrar] = useState(false);

  useEffect(() => {
    if (!uid || !mostrar) return;
    cargar();
  }, [uid, mostrar]);

  const cargar = async () => {
    try {
      const res = await api.get(`/services/historial/${uid}/conductor`);
      const servicios = res.data || [];

      // Filtrar últimos 7 días
      const hace7Dias = new Date();
      hace7Dias.setDate(hace7Dias.getDate() - 7);

      const semana = servicios.filter(s => new Date(s.creadoEn) >= hace7Dias);
      const completados = semana.filter(s => s.estado === 'completado');
      const cancelados = semana.filter(s => s.estado === 'cancelado');

      const ganancias = completados.reduce((total, s) => total + (s.tarifaAcordada || 8000), 0);
      const calificaciones = completados
        .map(s => s.calificacion?.puntuacion)
        .filter(p => p > 0);
      const promedio = calificaciones.length > 0
        ? (calificaciones.reduce((a, b) => a + b, 0) / calificaciones.length).toFixed(1)
        : '—';

      setReporte({
        totalViajes: semana.length,
        completados: completados.length,
        cancelados: cancelados.length,
        ganancias,
        promedioCalificacion: promedio,
        mejorDia: obtenerMejorDia(completados),
      });
    } catch {}
  };

  const obtenerMejorDia = (servicios) => {
    const dias = {};
    servicios.forEach(s => {
      const dia = new Date(s.creadoEn).toLocaleDateString('es-CO', { weekday: 'long' });
      dias[dia] = (dias[dia] || 0) + 1;
    });
    const mejor = Object.entries(dias).sort((a, b) => b[1] - a[1])[0];
    return mejor ? `${mejor[0]} (${mejor[1]} viajes)` : '—';
  };

  return (
    <View style={styles.seccion}>
      <TouchableOpacity onPress={() => setMostrar(!mostrar)}>
        <Text style={styles.titulo}>📊 Resumen Semanal {mostrar ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {mostrar && reporte && (
        <View style={styles.contenido}>
          <View style={styles.fila}>
            <View style={styles.stat}>
              <Text style={styles.statNumero}>{reporte.completados}</Text>
              <Text style={styles.statLabel}>Completados</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNumero, { color: '#16A34A' }]}>
                ${reporte.ganancias.toLocaleString('es-CO')}
              </Text>
              <Text style={styles.statLabel}>Ganancias</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNumero, { color: '#F97316' }]}>⭐ {reporte.promedioCalificacion}</Text>
              <Text style={styles.statLabel}>Calificación</Text>
            </View>
          </View>

          <View style={styles.detalles}>
            <Text style={styles.detalle}>🚕 Total viajes: {reporte.totalViajes}</Text>
            <Text style={styles.detalle}>❌ Cancelados: {reporte.cancelados}</Text>
            <Text style={styles.detalle}>📅 Mejor día: {reporte.mejorDia}</Text>
          </View>
        </View>
      )}

      {mostrar && !reporte && (
        <Text style={styles.cargando}>Cargando reporte...</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 12, elevation: 2, width: '100%',
  },
  titulo: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  contenido: { marginTop: 14 },
  fila: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  stat: { alignItems: 'center', flex: 1 },
  statNumero: { fontSize: 18, fontWeight: 'bold', color: '#1E293B' },
  statLabel: { fontSize: 11, color: '#64748B', marginTop: 2 },
  detalles: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, gap: 6 },
  detalle: { fontSize: 13, color: '#555' },
  cargando: { color: '#999', textAlign: 'center', marginTop: 12 },
});
