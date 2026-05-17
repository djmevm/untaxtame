import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, Linking, TextInput, Modal
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';
import { useConductorServiciosListener, useConductorOfertaAceptada } from '../../hooks/useServicioListener';
import BotonSOS from '../../components/BotonSOS';
import AlertasConductores from '../../components/AlertasConductores';
import ReconocimientoVozSOS from '../../components/ReconocimientoVozSOS';
import { reproducirSonido } from '../../services/sonido';

export default function ServiciosPendientesScreen() {
  const { perfil } = useAuth();
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [nuevos, setNuevos] = useState(0);
  const [error, setError] = useState(null);
  const [servicioActivo, setServicioActivo] = useState(null);
  const [penalizado, setPenalizado] = useState(false);
  const [penalizadoHasta, setPenalizadoHasta] = useState(null);

  // Modal de oferta
  const [modalVisible, setModalVisible] = useState(false);
  const [servicioSeleccionado, setServicioSeleccionado] = useState(null);
  const [montoOferta, setMontoOferta] = useState('');
  const [mensajeOferta, setMensajeOferta] = useState('');
  const [enviandoOferta, setEnviandoOferta] = useState(false);

  const verificarServicioActivo = async () => {
    try {
      const res = await api.get(`/services/activo/${perfil?.uid}`);
      setServicioActivo(res.data.tieneActivo ? res.data.servicio : null);
      return res.data.tieneActivo;
    } catch {
      return false;
    }
  };

  const cargar = async () => {
    setError(null);
    try {
      // Verificar penalización
      const perfilRes = await api.get('/auth/perfil/' + perfil?.uid);
      const p = perfilRes.data;
      if (p.penalizado && p.penalizadoHasta && new Date(p.penalizadoHasta) > new Date()) {
        setPenalizado(true);
        setPenalizadoHasta(p.penalizadoHasta);
      } else {
        setPenalizado(false);
        setPenalizadoHasta(null);
      }

      await verificarServicioActivo();
      const res = await api.get('/services/pendientes');
      const pendientes = res.data.filter(s => s.estado === 'pendiente');
      setServicios(pendientes);
      setNuevos(0);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setCargando(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    cargar();
    // Recargar cada 8 segundos para mantener sincronizado
    const intervalo = setInterval(cargar, 30000);
    return () => clearInterval(intervalo);
  }, []);

  useConductorServiciosListener(perfil?.uid, () => {
    setNuevos(prev => prev + 1);
    cargar();
  });

  // Detectar cuando el cliente acepta la oferta
  useConductorOfertaAceptada(perfil?.uid, () => {
    cargar();
  });

  const abrirOferta = (servicio) => {
    if (perfil?.estadoVerificacion !== 'aprobado') {
      return Alert.alert('Cuenta no verificada', 'Tu cuenta debe ser aprobada por el administrador.');
    }
    if (penalizado) {
      var horas = penalizadoHasta ? Math.ceil((new Date(penalizadoHasta) - new Date()) / (1000 * 60 * 60)) : 0;
      return Alert.alert(
        '🚫 Penalización activa',
        'Estás penalizado por 5 cancelaciones frecuentes.\n\nNo puedes ofertar servicios hasta cumplir la penalización.\n\n⏱️ Tiempo restante: ' + horas + ' hora' + (horas > 1 ? 's' : ''),
        [{ text: 'Entendido' }]
      );
    }
    if (servicioActivo) {
      return Alert.alert(
        '🚕 Servicio en curso',
        `Ya tienes un servicio activo con ${servicioActivo.clienteNombre}.\n\nDebes completarlo o cancelarlo antes de ofertar otro.`,
        [{ text: 'Entendido' }]
      );
    }
    setServicioSeleccionado(servicio);
    setMontoOferta(servicio.tarifaEstimada?.tarifaEstimada?.toString() || '8000');
    setMensajeOferta('');
    setModalVisible(true);
  };

  const enviarOferta = async () => {
    const monto = parseInt(montoOferta);
    if (!monto || monto < 8000) {
      return Alert.alert('Error', 'La tarifa mínima es $8,000 COP');
    }

    setEnviandoOferta(true);
    try {
      await api.post(`/ofertas/${servicioSeleccionado.id}`, {
        conductorUid: perfil.uid,
        conductorNombre: perfil.nombre,
        monto,
        mensaje: mensajeOferta,
      });
      Alert.alert('¡Oferta enviada!', `Ofreciste $${monto.toLocaleString('es-CO')} para llevar a ${servicioSeleccionado.clienteNombre}. Espera a que el cliente acepte.`);
      setModalVisible(false);
      cargar();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo enviar la oferta');
    } finally {
      setEnviandoOferta(false);
    }
  };

  if (cargando) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#FFC107" />;

  const noVerificado = perfil?.estadoVerificacion !== 'aprobado';

  return (
    <View style={styles.container}>
      {noVerificado && (
        <View style={styles.avisoCard}>
          <Text style={styles.avisoIcon}>⏳</Text>
          <Text style={styles.avisoTitulo}>Cuenta en revisión</Text>
          <Text style={styles.avisoTexto}>
            Podrás ofertar servicios cuando el administrador apruebe tus documentos.
          </Text>
        </View>
      )}

      {/* Aviso de penalización */}
      {penalizado && (
        <View style={styles.penalizadoCard}>
          <Text style={{ fontSize: 28, marginBottom: 6 }}>🚫</Text>
          <Text style={styles.penalizadoTitulo}>Penalización activa</Text>
          <Text style={styles.penalizadoTexto}>
            Has acumulado 5 cancelaciones. No puedes ofertar servicios hasta cumplir la penalización.
          </Text>
          <Text style={styles.penalizadoTiempo}>
            ⏱️ Hasta: {penalizadoHasta ? new Date(penalizadoHasta).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
          </Text>
        </View>
      )}

      {/* Aviso de servicio activo */}
      {servicioActivo && (
        <View style={styles.activoCard}>
          <Text style={{ fontSize: 28, marginBottom: 6 }}>🚕</Text>
          <Text style={styles.activoTitulo}>Tienes un servicio en curso</Text>
          <Text style={styles.activoCliente}>👤 {servicioActivo.clienteNombre}</Text>
          <Text style={styles.activoRuta}>📍 {servicioActivo.origen} → {servicioActivo.destino}</Text>
          <Text style={styles.activoEstado}>
            Estado: {servicioActivo.estado === 'aceptado' ? '✅ Aceptado' : '🚗 En curso'}
          </Text>
          <Text style={styles.activoHint}>Completa o cancela este servicio para poder ofertar nuevos</Text>
        </View>
      )}

      {/* Alertas de emergencia de compañeros */}
      <AlertasConductores />

      <View style={styles.encabezado}>
        <Text style={styles.titulo}>Servicios Disponibles</Text>
        {nuevos > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeTexto}>{nuevos} nuevo{nuevos > 1 ? 's' : ''}</Text>
          </View>
        )}
      </View>

      {error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorTexto}>⚠️ {error}</Text>
          <TouchableOpacity onPress={cargar}>
            <Text style={styles.errorRetry}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={servicios}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} />}
        ListEmptyComponent={
          <View style={styles.vacioContainer}>
            <Text style={styles.vacioIcon}>📡</Text>
            <Text style={styles.vacio}>No hay servicios pendientes</Text>
            <Text style={styles.vacioSub}>Desliza hacia abajo para actualizar</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cliente}>👤 {item.clienteNombre}</Text>
            <Text style={styles.ruta}>📍 {item.origen}</Text>
            <Text style={styles.ruta}>🏁 {item.destino}</Text>
            <View style={styles.infoRow}>
              <Text style={styles.pago}>💳 {item.metodoPago?.toUpperCase()}</Text>
              {item.tarifaEstimada && (
                <Text style={styles.tarifaSugerida}>
                  💰 Sugerida: ${item.tarifaEstimada.tarifaEstimada?.toLocaleString('es-CO')}
                </Text>
              )}
            </View>
            {item.totalOfertas > 0 && (
              <Text style={styles.ofertasCount}>
                🏷️ {item.totalOfertas} oferta{item.totalOfertas > 1 ? 's' : ''} recibida{item.totalOfertas > 1 ? 's' : ''}
              </Text>
            )}
            {item.requisitos && item.requisitos.length > 0 && (
              <View style={styles.requisitosContainer}>
                <Text style={styles.requisitosLabel}>📋 Requisitos:</Text>
                <View style={styles.requisitosChips}>
                  {item.requisitos.map(r => (
                    <View key={r} style={styles.requisitoChip}>
                      <Text style={styles.requisitoChipTexto}>
                        {r === 'maletas' ? '🧳 Maletas' : r === 'discapacitado' ? '♿ Discapacitado' : r === 'bicicleta' ? '🚲 Bicicleta' : r === 'aireAcondicionado' ? '❄️ A/C' : r === 'mascotas' ? '🐾 Mascotas' : r}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
            {item.clienteCelular && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${item.clienteCelular}`)}>
                <Text style={styles.telefono}>📞 {item.clienteCelular}</Text>
              </TouchableOpacity>
            )}
            {item.ubicacionGPS && (
              <TouchableOpacity onPress={() => Linking.openURL(`https://www.google.com/maps?q=${item.ubicacionGPS.lat},${item.ubicacionGPS.lng}`)}>
                <Text style={styles.gps}>📌 Ver ubicación del cliente</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.btnOfertar, (noVerificado || servicioActivo || penalizado) && styles.btnDisabled]}
              onPress={() => abrirOferta(item)}
            >
              <Text style={styles.btnTexto}>
                {noVerificado ? '⏳ PENDIENTE' : penalizado ? '🚫 PENALIZADO' : servicioActivo ? '🚕 EN SERVICIO' : '💰 HACER OFERTA'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Botón SOS flotante */}
      <BotonSOS servicioId={null} />

      {/* Reconocimiento de voz H1/H2 */}
      <ReconocimientoVozSOS servicioId={null} usuarioUid={perfil?.uid} />

      {/* Modal de oferta */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>💰 Tu oferta</Text>
            <Text style={styles.modalSub}>
              {servicioSeleccionado?.clienteNombre} — {servicioSeleccionado?.origen} → {servicioSeleccionado?.destino}
            </Text>

            {servicioSeleccionado?.tarifaEstimada && (
              <Text style={styles.modalSugerida}>
                Tarifa sugerida: ${servicioSeleccionado.tarifaEstimada.tarifaEstimada?.toLocaleString('es-CO')}
              </Text>
            )}

            <Text style={styles.modalLabel}>¿Cuánto cobras? (mínimo $8,000)</Text>
            <TextInput
              style={styles.modalInput}
              value={montoOferta}
              onChangeText={setMontoOferta}
              keyboardType="numeric"
              placeholder="8000"
            />

            <Text style={styles.modalLabel}>Mensaje al cliente (opcional)</Text>
            <TextInput
              style={[styles.modalInput, { height: 60 }]}
              value={mensajeOferta}
              onChangeText={setMensajeOferta}
              placeholder="Ej: Estoy cerca, llego en 5 min"
              multiline
            />

            <TouchableOpacity style={styles.btnEnviarOferta} onPress={enviarOferta} disabled={enviandoOferta}>
              {enviandoOferta
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.btnEnviarTexto}>ENVIAR OFERTA ${parseInt(montoOferta || 0).toLocaleString('es-CO')}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnCancelarModal} onPress={() => setModalVisible(false)}>
              <Text style={styles.btnCancelarTexto}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  avisoCard: {
    backgroundColor: '#FFF3E0', borderRadius: 12, padding: 16,
    marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#FFC107', alignItems: 'center',
  },
  avisoIcon: { fontSize: 32, marginBottom: 8 },
  avisoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#E65100' },
  avisoTexto: { fontSize: 13, color: '#666', textAlign: 'center' },
  activoCard: {
    backgroundColor: '#E3F2FD', borderRadius: 12, padding: 16,
    marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#1565C0', alignItems: 'center',
  },
  activoTitulo: { fontSize: 16, fontWeight: 'bold', color: '#1565C0', marginBottom: 6 },
  activoCliente: { fontSize: 15, fontWeight: '600', color: '#333' },
  activoRuta: { fontSize: 13, color: '#555', marginTop: 2 },
  activoEstado: { fontSize: 13, fontWeight: 'bold', color: '#1565C0', marginTop: 6 },
  activoHint: { fontSize: 11, color: '#888', marginTop: 6, textAlign: 'center', fontStyle: 'italic' },
  penalizadoCard: {
    backgroundColor: '#FFEBEE', borderRadius: 12, padding: 16,
    marginBottom: 16, borderLeftWidth: 4, borderLeftColor: '#B71C1C', alignItems: 'center',
  },
  penalizadoTitulo: { fontSize: 17, fontWeight: 'bold', color: '#B71C1C', marginBottom: 4 },
  penalizadoTexto: { fontSize: 13, color: '#666', textAlign: 'center', marginBottom: 6 },
  penalizadoTiempo: { fontSize: 14, fontWeight: 'bold', color: '#E53935' },
  encabezado: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 },
  titulo: { fontSize: 22, fontWeight: 'bold' },
  badge: { backgroundColor: '#E53935', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeTexto: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  errorCard: {
    backgroundColor: '#FFEBEE', borderRadius: 8, padding: 12, marginBottom: 12,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  errorTexto: { fontSize: 13, color: '#C62828', flex: 1 },
  errorRetry: { color: '#1565C0', fontWeight: 'bold' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2 },
  cliente: { fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  ruta: { fontSize: 15, marginBottom: 4, color: '#333' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap' },
  pago: { fontSize: 14, color: '#666' },
  tarifaSugerida: { fontSize: 14, color: '#2E7D32', fontWeight: '600' },
  ofertasCount: { fontSize: 13, color: '#1565C0', fontWeight: '600', marginBottom: 8 },
  telefono: { fontSize: 14, color: '#1565C0', fontWeight: '600', marginBottom: 4 },
  requisitosContainer: { marginBottom: 8 },
  requisitosLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 4 },
  requisitosChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  requisitoChip: { backgroundColor: '#E3F2FD', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  requisitoChipTexto: { fontSize: 12, color: '#1565C0', fontWeight: '600' },
  gps: { fontSize: 13, color: '#1565C0', marginBottom: 10 },
  btnOfertar: { backgroundColor: '#FFC107', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 4 },
  btnDisabled: { backgroundColor: '#ddd' },
  btnTexto: { fontWeight: 'bold', fontSize: 15, color: '#000' },
  vacioContainer: { alignItems: 'center', marginTop: 60 },
  vacioIcon: { fontSize: 48, marginBottom: 12 },
  vacio: { fontSize: 16, fontWeight: 'bold', color: '#999' },
  vacioSub: { fontSize: 13, color: '#bbb', marginTop: 4 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitulo: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  modalSub: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 12 },
  modalSugerida: { fontSize: 15, color: '#2E7D32', fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  modalLabel: { fontSize: 13, color: '#888', marginBottom: 6, fontWeight: '600' },
  modalInput: {
    borderWidth: 2, borderColor: '#ddd', borderRadius: 10,
    padding: 12, fontSize: 16, marginBottom: 14, backgroundColor: '#fafafa',
  },
  btnEnviarOferta: {
    backgroundColor: '#FFC107', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 8,
  },
  btnEnviarTexto: { fontWeight: 'bold', fontSize: 16, color: '#000' },
  btnCancelarModal: { padding: 14, alignItems: 'center', marginTop: 4 },
  btnCancelarTexto: { color: '#999', fontWeight: 'bold', fontSize: 15 },
});
