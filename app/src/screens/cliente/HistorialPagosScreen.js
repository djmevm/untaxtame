import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, TouchableOpacity
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';

const METODO_CONFIG = {
  daviplata: { color: '#E53935', icon: '🔴', label: 'Daviplata' },
  nequi:     { color: '#6A1B9A', icon: '🟣', label: 'Nequi' },
  pse:       { color: '#1565C0', icon: '🔵', label: 'PSE' },
  efectivo:  { color: '#2E7D32', icon: '💵', label: 'Efectivo' },
};

const FILTROS = ['Todos', 'Daviplata', 'Nequi', 'PSE', 'Efectivo'];

export default function HistorialPagosScreen() {
  const { perfil } = useAuth();
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('Todos');

  useEffect(() => {
    api.get(`/services/historial/${perfil.uid}/cliente`)
      .then(res => {
        // Solo mostrar servicios completados (con pago realizado)
        const completados = res.data.filter(s => s.estado === 'completado');
        setServicios(completados);
      })
      .catch(() => {})
      .finally(() => setCargando(false));
  }, []);

  const filtrados = filtro === 'Todos'
    ? servicios
    : servicios.filter(s => s.metodoPago === filtro.toLowerCase());

  // Totales por método
  const totalesPorMetodo = Object.keys(METODO_CONFIG).reduce((acc, key) => {
    acc[key] = servicios.filter(s => s.metodoPago === key).length;
    return acc;
  }, {});

  if (cargando) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#FFC107" />;

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Historial de Pagos</Text>

      {/* Resumen por método */}
      <View style={styles.metodosGrid}>
        {Object.entries(METODO_CONFIG).map(([key, cfg]) => (
          <View key={key} style={[styles.metodoCard, { borderLeftColor: cfg.color }]}>
            <Text style={styles.metodoIcon}>{cfg.icon}</Text>
            <Text style={styles.metodoNum}>{totalesPorMetodo[key]}</Text>
            <Text style={styles.metodoLabel}>{cfg.label}</Text>
          </View>
        ))}
      </View>

      {/* Filtros */}
      <FlatList
        horizontal
        data={FILTROS}
        keyExtractor={f => f}
        showsHorizontalScrollIndicator={false}
        style={styles.filtrosLista}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.filtroBtn, filtro === item && styles.filtroActivo]}
            onPress={() => setFiltro(item)}
          >
            <Text style={[styles.filtroTexto, filtro === item && styles.filtroTextoActivo]}>
              {item}
            </Text>
          </TouchableOpacity>
        )}
      />

      {/* Lista de pagos */}
      <FlatList
        data={filtrados}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <Text style={styles.vacio}>No hay pagos con este método</Text>
        }
        renderItem={({ item }) => {
          const cfg = METODO_CONFIG[item.metodoPago] || {};
          return (
            <View style={styles.pagoCard}>
              <View style={[styles.pagoIconCircle, { backgroundColor: cfg.color + '20' }]}>
                <Text style={styles.pagoIconTexto}>{cfg.icon}</Text>
              </View>
              <View style={styles.pagoInfo}>
                <Text style={styles.pagoMetodo}>{cfg.label}</Text>
                <Text style={styles.pagoRuta} numberOfLines={1}>
                  {item.origen} → {item.destino}
                </Text>
                {item.conductorNombre && (
                  <Text style={styles.pagoConductor}>🚕 {item.conductorNombre}</Text>
                )}
              </View>
              <View style={styles.pagoFechaCol}>
                <Text style={styles.pagoFecha}>
                  {new Date(item.completadoEn || item.creadoEn).toLocaleDateString('es-CO')}
                </Text>
                <View style={[styles.pagoBadge, { backgroundColor: cfg.color }]}>
                  <Text style={styles.pagoBadgeTexto}>Pagado</Text>
                </View>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  titulo: { fontSize: 22, fontWeight: 'bold', marginBottom: 14 },

  metodosGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16,
  },
  metodoCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    alignItems: 'center', flex: 1, minWidth: '45%',
    borderLeftWidth: 4, elevation: 2,
  },
  metodoIcon: { fontSize: 24, marginBottom: 4 },
  metodoNum: { fontSize: 24, fontWeight: 'bold', color: '#222' },
  metodoLabel: { fontSize: 12, color: '#888', marginTop: 2 },

  filtrosLista: { marginBottom: 14, flexGrow: 0 },
  filtroBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#fff', marginRight: 8, borderWidth: 1, borderColor: '#ddd',
  },
  filtroActivo: { backgroundColor: '#FFC107', borderColor: '#FFC107' },
  filtroTexto: { fontSize: 13, color: '#666', fontWeight: '600' },
  filtroTextoActivo: { color: '#000' },

  pagoCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', marginBottom: 10, elevation: 2,
  },
  pagoIconCircle: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  pagoIconTexto: { fontSize: 22 },
  pagoInfo: { flex: 1 },
  pagoMetodo: { fontSize: 15, fontWeight: 'bold', color: '#222', marginBottom: 2 },
  pagoRuta: { fontSize: 13, color: '#666', marginBottom: 2 },
  pagoConductor: { fontSize: 12, color: '#888' },
  pagoFechaCol: { alignItems: 'flex-end', gap: 6 },
  pagoFecha: { fontSize: 12, color: '#aaa' },
  pagoBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pagoBadgeTexto: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  vacio: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 },
});
