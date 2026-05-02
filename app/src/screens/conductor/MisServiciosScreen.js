import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Linking, RefreshControl, Modal, TextInput
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';
import * as Location from 'expo-location';
import ChatServicio from '../../components/ChatServicio';
import BotonSOS from '../../components/BotonSOS';
import AlertasConductores from '../../components/AlertasConductores';
import { reproducirSonido } from '../../services/sonido';
import useChatNotificacion from '../../hooks/useChatNotificacion';

export default function MisServiciosScreen() {
  const { perfil } = useAuth();
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chatServicioId, setChatServicioId] = useState(null);

  const servicioActivoAnterior = React.useRef(null);

  // Notificar mensajes de chat cuando el chat está cerrado
  const servicioActivoParaChat = servicios.find(function(s) { return ['aceptado', 'conductor_en_sitio'].includes(s.estado); });
  useChatNotificacion(servicioActivoParaChat?.id, perfil?.uid, !!chatServicioId);

  const cargar = async () => {
    try {
      const res = await api.get(`/services/historial/${perfil?.uid}/conductor`);
      const nuevos = res.data;
      
      // Detectar si hay un nuevo servicio aceptado
      const activoNuevo = nuevos.find(s => s.estado === 'aceptado');
      if (activoNuevo && !servicioActivoAnterior.current) {
        // Nuevo servicio aceptado — el cliente aceptó la oferta
        reproducirSonido();
        Alert.alert(
          '🎉 ¡Oferta aceptada!',
          `${activoNuevo.clienteNombre} aceptó tu oferta.\n\n📍 ${activoNuevo.origen}\n🏁 ${activoNuevo.destino}${activoNuevo.tarifaAcordada ? `\n💰 $${activoNuevo.tarifaAcordada.toLocaleString('es-CO')}` : ''}`,
          [{ text: '¡Vamos!' }]
        );
      }
      servicioActivoAnterior.current = activoNuevo?.id || null;
      
      setServicios(nuevos);
    } catch {}
    finally { setCargando(false); setRefreshing(false); }
  };

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 30000);

    // Verificar notificaciones de calificación
    const verificarNotificaciones = async () => {
      if (!perfil?.uid) return;
      try {
        const res = await api.get(`/users/notificaciones/${perfil.uid}`);
        const calificaciones = res.data.filter(n => n.tipo === 'calificacion');
        for (const notif of calificaciones) {
          reproducirSonido();
          Alert.alert(notif.titulo, notif.mensaje);
          // Marcar como leída
          try { await api.put(`/users/notificaciones/${notif.id}/leer`); } catch {}
        }
      } catch {}
    };

    verificarNotificaciones();
    const intervaloNotif = setInterval(verificarNotificaciones, 15000);

    return () => { clearInterval(intervalo); clearInterval(intervaloNotif); };
    return () => clearInterval(intervalo);
  }, []);

  const completar = async (servicio) => {
    Alert.alert(
      '✅ Completar servicio',
      `¿Confirmas que el viaje con ${servicio.clienteNombre} ha finalizado?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, completar', onPress: async () => {
            try {
              await api.put(`/services/completar/${servicio.id}`);
              reproducirSonido();
              Alert.alert('✅ Servicio completado', 'El cliente recibirá una notificación para calificar tu servicio.');
              cargar();
            } catch {
              Alert.alert('Error', 'No se pudo completar el servicio');
            }
          }
        }
      ]
    );
  };

  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [modalCancelar, setModalCancelar] = useState(null);

  const cancelar = (servicio) => {
    setMotivoCancelacion('');
    setModalCancelar(servicio);
  };

  const confirmarCancelacion = async () => {
    if (!motivoCancelacion.trim() || motivoCancelacion.trim().length < 5) {
      return Alert.alert('Error', 'Escribe el motivo de la cancelación (mínimo 5 caracteres)');
    }
    try {
      const res = await api.put(`/services/cancelar/${modalCancelar.id}`, {
        motivo: motivoCancelacion.trim(),
        canceladoPor: 'conductor',
      });
      setModalCancelar(null);

      if (res.data.penalizado) {
        Alert.alert(
          '🚫 Penalización activada',
          'Has acumulado ' + res.data.cancelaciones + ' cancelaciones en los últimos 30 días.\n\n' +
          'Tu cuenta está BLOQUEADA por 12 horas.\n' +
          'No podrás ofertar ni aceptar servicios hasta:\n' +
          new Date(res.data.penalizadoHasta).toLocaleString('es-CO') + '\n\n' +
          'Estado: FUERA DE SERVICIO',
        );
      } else {
        Alert.alert('Servicio cancelado', res.data.cancelaciones
          ? 'Cancelaciones acumuladas: ' + res.data.cancelaciones + '/5\n\nAl llegar a 5 serás penalizado por 12 horas.'
          : 'El cliente ha sido notificado.');
      }
      cargar();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo cancelar');
    }
  };

  // Separar servicios activos de historial
  const servicioActivo = servicios.find(s => ['aceptado', 'conductor_en_sitio'].includes(s.estado));
  const historial = servicios.filter(s => !['aceptado', 'conductor_en_sitio'].includes(s.estado));

  if (cargando) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#FFC107" />;

  const confirmarLlegada = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permiso requerido', 'Necesitamos tu ubicación para confirmar la llegada');
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await api.put(`/services/llegada/${servicioActivo.id}`, {
        conductorUid: perfil.uid,
        ubicacionConductor: { lat: loc.coords.latitude, lng: loc.coords.longitude },
      });
      reproducirSonido();
      Alert.alert('📍 Llegada confirmada', 'El cliente ha sido notificado de tu llegada.');
      cargar();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo confirmar la llegada');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.titulo}>Mis Servicios</Text>

      <AlertasConductores />

      {/* Servicio activo / en proceso */}
      {servicioActivo ? (
        <View style={styles.activoCard}>
          <View style={styles.activoHeader}>
            <Text style={styles.activoTitulo}>🚕 Servicio en proceso</Text>
            <View style={styles.enProcesoBadge}>
              <Text style={styles.enProcesoTexto}>EN PROCESO</Text>
            </View>
          </View>

          <View style={styles.activoInfo}>
            <Text style={styles.activoCliente}>👤 {servicioActivo.clienteNombre}</Text>
            {servicioActivo.clienteCelular && (
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${servicioActivo.clienteCelular}`)}>
                <Text style={styles.activoTelefono}>📞 {servicioActivo.clienteCelular}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.activoRuta}>
            <Text style={styles.rutaTexto}>📍 {servicioActivo.origen}</Text>
            <Text style={styles.rutaFlecha}>↓</Text>
            <Text style={styles.rutaTexto}>🏁 {servicioActivo.destino}</Text>
          </View>

          <View style={styles.activoDetalles}>
            <Text style={styles.activoPago}>💳 {servicioActivo.metodoPago?.toUpperCase()}</Text>
            {servicioActivo.tarifaAcordada && (
              <Text style={styles.activoTarifa}>💰 ${servicioActivo.tarifaAcordada.toLocaleString('es-CO')}</Text>
            )}
          </View>

          {servicioActivo.ubicacionGPS && (
            <TouchableOpacity style={styles.btnMapa}
              onPress={() => Linking.openURL(`https://www.google.com/maps?q=${servicioActivo.ubicacionGPS.lat},${servicioActivo.ubicacionGPS.lng}`)}>
              <Text style={styles.btnMapaTexto}>📌 Ver ubicación del cliente</Text>
            </TouchableOpacity>
          )}

          {/* Acciones */}
          <View style={styles.activoAcciones}>
            <TouchableOpacity style={styles.btnChat} onPress={() => setChatServicioId(servicioActivo.id)}>
              <Text style={styles.btnChatTexto}>💬 Chat</Text>
            </TouchableOpacity>
            {servicioActivo.estado === 'aceptado' && (
              <TouchableOpacity style={styles.btnLlegue} onPress={confirmarLlegada}>
                <Text style={styles.btnLlegueTexto}>📍 Llegué</Text>
              </TouchableOpacity>
            )}
            {servicioActivo.estado === 'conductor_en_sitio' && (
              <View style={styles.enSitioBadgeCard}>
                <Text style={styles.enSitioBadgeTexto}>📍 EN EL PUNTO</Text>
              </View>
            )}
            <TouchableOpacity style={styles.btnCompletar} onPress={() => completar(servicioActivo)}>
              <Text style={styles.btnCompletarTexto}>✅ Completar</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.btnCancelarServicio} onPress={() => cancelar(servicioActivo)}>
            <Text style={styles.btnCancelarTexto}>❌ No puedo ir — Cancelar servicio</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.sinServicioCard}>
          <Text style={styles.sinServicioIcon}>🚕</Text>
          <Text style={styles.sinServicioTexto}>No tienes servicios en proceso</Text>
          <Text style={styles.sinServicioSub}>Ve a "Disponibles" para aceptar un servicio</Text>
        </View>
      )}

      {/* Historial */}
      <Text style={styles.subtitulo}>Historial ({historial.length})</Text>
      <FlatList
        data={historial}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} />}
        ListEmptyComponent={<Text style={styles.vacio}>Sin servicios anteriores</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardCliente}>👤 {item.clienteNombre}</Text>
              <View style={[styles.estadoBadge, {
                backgroundColor: item.estado === 'completado' ? '#2E7D32' : item.estado === 'cancelado' ? '#E53935' : '#FFC107'
              }]}>
                <Text style={styles.estadoTexto}>{item.estado?.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.cardRuta}>📍 {item.origen} → 🏁 {item.destino}</Text>
            <View style={styles.cardFooter}>
              <Text style={styles.cardPago}>💳 {item.metodoPago?.toUpperCase()}</Text>
              {item.tarifaAcordada && <Text style={styles.cardTarifa}>${item.tarifaAcordada.toLocaleString('es-CO')}</Text>}
              <Text style={styles.cardFecha}>{new Date(item.creadoEn).toLocaleDateString('es-CO')}</Text>
            </View>
            {item.calificacion?.puntuacion && (
              <Text style={styles.cardCalificacion}>⭐ {item.calificacion.puntuacion}/10 {item.calificacion.comentario ? `"${item.calificacion.comentario}"` : ''}</Text>
            )}
          </View>
        )}
      />

      {/* Chat */}
      <ChatServicio servicioId={chatServicioId} visible={!!chatServicioId} onCerrar={() => setChatServicioId(null)} />

      {/* SOS */}
      {servicioActivo && <BotonSOS servicioId={servicioActivo.id} />}

      {/* Modal de cancelación con motivo */}
      <Modal visible={!!modalCancelar} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>❌ Cancelar servicio</Text>
            <Text style={styles.modalSub}>
              Servicio con {modalCancelar?.clienteNombre}
            </Text>
            <Text style={styles.modalLabel}>¿Por qué cancelas? (obligatorio)</Text>
            <TextInput
              style={styles.modalInput}
              value={motivoCancelacion}
              onChangeText={setMotivoCancelacion}
              placeholder="Ej: Problemas mecánicos, emergencia personal..."
              multiline
              maxLength={200}
            />
            <Text style={styles.modalAviso}>
              ⚠️ Al acumular 5 cancelaciones serás penalizado por 24 horas
            </Text>
            <TouchableOpacity style={styles.btnConfirmarCancelar} onPress={confirmarCancelacion}>
              <Text style={styles.btnConfirmarTexto}>Confirmar cancelación</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnVolverModal} onPress={() => setModalCancelar(null)}>
              <Text style={styles.btnVolverTexto}>Volver</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5', padding: 16 },
  titulo: { fontSize: 22, fontWeight: 'bold', marginBottom: 12 },
  subtitulo: { fontSize: 17, fontWeight: 'bold', marginBottom: 8, marginTop: 12, color: '#555' },

  // Servicio activo
  activoCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18,
    marginBottom: 12, elevation: 4, borderLeftWidth: 5, borderLeftColor: '#FFC107',
  },
  activoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  activoTitulo: { fontSize: 17, fontWeight: 'bold', color: '#333' },
  enProcesoBadge: { backgroundColor: '#1565C0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 4 },
  enProcesoTexto: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  activoInfo: { marginBottom: 10 },
  activoCliente: { fontSize: 16, fontWeight: '600', color: '#222', marginBottom: 4 },
  activoTelefono: { fontSize: 14, color: '#1565C0', fontWeight: '600' },
  activoRuta: { backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 10 },
  rutaTexto: { fontSize: 14, color: '#333' },
  rutaFlecha: { textAlign: 'center', color: '#999', fontSize: 16, marginVertical: 2 },
  activoDetalles: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  activoPago: { fontSize: 14, color: '#666' },
  activoTarifa: { fontSize: 16, fontWeight: 'bold', color: '#2E7D32' },
  btnMapa: { backgroundColor: '#E3F2FD', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 12 },
  btnMapaTexto: { color: '#1565C0', fontWeight: '600', fontSize: 13 },
  activoAcciones: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  btnChat: { flex: 1, backgroundColor: '#1565C0', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnChatTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnCompletar: { flex: 1, backgroundColor: '#2E7D32', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnCompletarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnLlegue: { flex: 1, backgroundColor: '#FF9800', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnLlegueTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  enSitioBadgeCard: { flex: 1, backgroundColor: '#FFF3E0', borderRadius: 10, padding: 14, alignItems: 'center', borderWidth: 2, borderColor: '#FF9800' },
  enSitioBadgeTexto: { color: '#E65100', fontWeight: 'bold', fontSize: 12 },
  btnCancelarServicio: { borderWidth: 2, borderColor: '#E53935', borderRadius: 10, padding: 12, alignItems: 'center' },
  btnCancelarTexto: { color: '#E53935', fontWeight: '600', fontSize: 13 },

  // Sin servicio
  sinServicioCard: { backgroundColor: '#fff', borderRadius: 16, padding: 30, alignItems: 'center', marginBottom: 12, elevation: 2 },
  sinServicioIcon: { fontSize: 48, marginBottom: 10 },
  sinServicioTexto: { fontSize: 16, fontWeight: 'bold', color: '#999' },
  sinServicioSub: { fontSize: 13, color: '#bbb', marginTop: 4 },

  // Historial
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardCliente: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  estadoBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  estadoTexto: { color: '#fff', fontWeight: 'bold', fontSize: 11 },
  cardRuta: { fontSize: 13, color: '#555', marginBottom: 6 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPago: { fontSize: 13, color: '#888' },
  cardTarifa: { fontSize: 14, fontWeight: 'bold', color: '#2E7D32' },
  cardFecha: { fontSize: 12, color: '#aaa' },
  cardCalificacion: { fontSize: 13, color: '#FFC107', marginTop: 6 },
  vacio: { textAlign: 'center', color: '#999', marginTop: 20, fontSize: 14 },

  // Modal cancelación
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24 },
  modalTitulo: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  modalSub: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: '#555', marginBottom: 6 },
  modalInput: { borderWidth: 2, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, minHeight: 80, textAlignVertical: 'top', marginBottom: 10 },
  modalAviso: { fontSize: 12, color: '#E53935', textAlign: 'center', marginBottom: 16 },
  btnConfirmarCancelar: { backgroundColor: '#E53935', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 8 },
  btnConfirmarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnVolverModal: { padding: 12, alignItems: 'center' },
  btnVolverTexto: { color: '#999', fontWeight: 'bold' },
});
