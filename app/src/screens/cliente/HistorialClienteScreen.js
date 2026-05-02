import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, StyleSheet,
  ActivityIndicator, TouchableOpacity
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';
import CalificacionModal from '../../components/CalificacionModal';

const ESTADO_COLOR = {
  pendiente:  '#FFC107',
  aceptado:   '#1565C0',
  completado: '#2E7D32',
  cancelado:  '#E53935',
};

const PAGO_ICON = {
  daviplata: '🔴',
  nequi:     '🟣',
  pse:       '🔵',
  efectivo:  '💵',
};

export default function HistorialClienteScreen() {
  const { perfil } = useAuth();
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [servicioACalificar, setServicioACalificar] = useState(null);

  const cargar = () => {
    api.get(`/services/historial/${perfil.uid}/cliente`)
      .then(res => setServicios(res.data))
      .catch(() => {})
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  // Estadísticas rápidas
  const completados = servicios.filter(s => s.estado === 'completado').length;
  const totalViajes = servicios.length;
  const promedioEstrellas = () => {
    const calificados = servicios.filter(s => s.calificacion?.estrellas);
    if (!calificados.length) return '—';
    const suma = calificados.reduce((acc, s) => acc + s.calificacion.estrellas, 0);
    return (suma / calificados.length).toFixed(1);
  };

  if (cargando) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#FFC107" />;

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Mis Viajes</Text>

      {/* Resumen */}
      <View style={styles.resumen}>
        <View style={styles.resumenItem}>
          <Text style={styles.resumenNum}>{totalViajes}</Text>
          <Text style={styles.resumenLabel}>Total</Text>
        </View>
        <View style={styles.resumenDivider} />
        <View style={styles.resumenItem}>
          <Text style={styles.resumenNum}>{completados}</Text>
          <Text style={styles.resumenLabel}>Completados</Text>
        </View>
        <View style={styles.resumenDivider} />
        <View style={styles.resumenItem}>
          <Text style={styles.resumenNum}>⭐ {promedioEstrellas()}</Text>
          <Text style={styles.resumenLabel}>Promedio</Text>
        </View>
      </View>

      <FlatList
        data={servicios}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={<Text style={styles.vacio}>No tienes viajes aún</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            {/* Encabezado */}
            <View style={styles.cardHeader}>
              <View style={[styles.estadoBadge, { backgroundColor: ESTADO_COLOR[item.estado] || '#999' }]}>
                <Text style={styles.estadoTexto}>{item.estado.toUpperCase()}</Text>
              </View>
              <Text style={styles.fecha}>{new Date(item.creadoEn).toLocaleDateString('es-CO')}</Text>
            </View>

            {/* Ruta */}
            <View style={styles.ruta}>
              <View style={styles.rutaPunto}>
                <View style={[styles.punto, { backgroundColor: '#1565C0' }]} />
                <Text style={styles.rutaTexto}>{item.origen}</Text>
              </View>
              <View style={styles.rutaLinea} />
              <View style={styles.rutaPunto}>
                <View style={[styles.punto, { backgroundColor: '#E53935' }]} />
                <Text style={styles.rutaTexto}>{item.destino}</Text>
              </View>
            </View>

            {/* Info */}
            <View style={styles.infoFila}>
              {item.conductorNombre && (
                <Text style={styles.infoTexto}>🚕 {item.conductorNombre}</Text>
              )}
              <Text style={styles.infoTexto}>
                {PAGO_ICON[item.metodoPago]} {item.metodoPago?.toUpperCase()}
              </Text>
            </View>

            {/* Calificación existente */}
            {item.calificacion?.estrellas && (
              <View style={styles.calificacionFila}>
                <Text style={styles.estrellasTexto}>
                  {'★'.repeat(item.calificacion.estrellas)}{'☆'.repeat(5 - item.calificacion.estrellas)}
                </Text>
                {item.calificacion.comentario ? (
                  <Text style={styles.comentario}>"{item.calificacion.comentario}"</Text>
                ) : null}
              </View>
            )}

            {/* Botón calificar */}
            {item.estado === 'completado' && !item.calificacion?.estrellas && (
              <TouchableOpacity
                style={styles.btnCalificar}
                onPress={() => setServicioACalificar(item)}
              >
                <Text style={styles.btnCalificarTexto}>⭐ Calificar este viaje</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      />

      <CalificacionModal
        visible={!!servicioACalificar}
        servicio={servicioACalificar}
        onCerrar={() => { setServicioACalificar(null); cargar(); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  titulo: { fontSize: 22, fontWeight: 'bold', marginBottom: 14 },

  resumen: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    flexDirection: 'row', justifyContent: 'space-around',
    marginBottom: 16, elevation: 2,
  },
  resumenItem: { alignItems: 'center' },
  resumenNum: { fontSize: 22, fontWeight: 'bold', color: '#FFC107' },
  resumenLabel: { fontSize: 12, color: '#888', marginTop: 2 },
  resumenDivider: { width: 1, backgroundColor: '#eee' },

  card: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, marginBottom: 12, elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  estadoBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  estadoTexto: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  fecha: { fontSize: 12, color: '#aaa' },

  ruta: { marginBottom: 10 },
  rutaPunto: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  punto: { width: 10, height: 10, borderRadius: 5 },
  rutaTexto: { fontSize: 14, color: '#333', flex: 1 },
  rutaLinea: { width: 2, height: 14, backgroundColor: '#ddd', marginLeft: 4, marginVertical: 2 },

  infoFila: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  infoTexto: { fontSize: 13, color: '#666' },

  calificacionFila: { marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  estrellasTexto: { fontSize: 18, color: '#FFC107', letterSpacing: 2 },
  comentario: { fontSize: 13, color: '#888', fontStyle: 'italic', marginTop: 2 },

  btnCalificar: {
    marginTop: 10, borderWidth: 2, borderColor: '#FFC107',
    borderRadius: 8, padding: 10, alignItems: 'center',
  },
  btnCalificarTexto: { color: '#FFC107', fontWeight: 'bold', fontSize: 14 },

  vacio: { textAlign: 'center', color: '#999', marginTop: 40, fontSize: 16 },
});
