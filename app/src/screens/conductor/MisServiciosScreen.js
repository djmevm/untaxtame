import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Alert, ActivityIndicator, Linking, RefreshControl, Modal, TextInput, Share
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';
import * as Location from 'expo-location';
import ChatServicio from '../../components/ChatServicio';
import BotonSOS from '../../components/BotonSOS';
import AlertasConductores from '../../components/AlertasConductores';
import ReconocimientoVozSOS from '../../components/ReconocimientoVozSOS';
import MapaViajeConductor from '../../components/MapaViajeConductor';
import { reproducirSonido } from '../../services/sonido';
import useChatNotificacion from '../../hooks/useChatNotificacion';
import useWebSocket from '../../hooks/useWebSocket';

function minutosDesde(iso) {
  if (!iso) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
}

function PasosViaje({ estado }) {
  const pasos = [
    { key: 'aceptado', label: 'En camino' },
    { key: 'conductor_en_sitio', label: 'En sitio' },
    { key: 'en_curso', label: 'En viaje' },
  ];
  const idx = Math.max(0, pasos.findIndex((p) => p.key === estado));
  return (
    <View style={styles.pasosRow}>
      {pasos.map((p, i) => (
        <View key={p.key} style={styles.pasoItem}>
          <View style={[styles.pasoDot, i <= idx && styles.pasoDotActivo]} />
          <Text style={[styles.pasoLabel, i <= idx && styles.pasoLabelActivo]}>{p.label}</Text>
          {i < pasos.length - 1 ? <View style={[styles.pasoLinea, i < idx && styles.pasoLineaActiva]} /> : null}
        </View>
      ))}
    </View>
  );
}

export default function MisServiciosScreen() {
  const { perfil } = useAuth();
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chatServicioId, setChatServicioId] = useState(null);
  const [ahoraTick, setAhoraTick] = useState(Date.now());

  const servicioActivoAnterior = React.useRef(null);
  const recordatorioLlegueRef = React.useRef(null);

  // Notificar mensajes de chat cuando el chat está cerrado
  const servicioActivoParaChat = servicios.find(function(s) { return ['aceptado', 'conductor_en_sitio', 'en_curso'].includes(s.estado); });
  useChatNotificacion(servicioActivoParaChat?.id, perfil?.uid, !!chatServicioId);

  const cargar = useCallback(async () => {
    try {
      const res = await api.get(`/services/historial/${perfil?.uid}/conductor`);
      const nuevos = res.data;
      const activoNuevo = nuevos.find(s => ['aceptado', 'conductor_en_sitio', 'en_curso'].includes(s.estado));
      servicioActivoAnterior.current = activoNuevo?.id || null;
      setServicios(nuevos);
    } catch {}
    finally { setCargando(false); setRefreshing(false); }
  }, [perfil?.uid]);

  const { onMensaje, conectado: wsConectado } = useWebSocket(perfil?.uid, 'conductor');

  useEffect(() => {
    if (!wsConectado) return;
    return onMensaje('servicio_actualizado', () => { cargar(); });
  }, [wsConectado, onMensaje, cargar]);

  // Al entrar a la pestaña (p. ej. tras aceptar oferta) refrescar al instante
  useFocusEffect(
    useCallback(() => {
      cargar();
    }, [cargar])
  );

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
          try { await api.put(`/users/notificaciones/${notif.id}/leer`); } catch {}
        }
      } catch {}
    };

    verificarNotificaciones();
    const intervaloNotif = setInterval(verificarNotificaciones, 60000);

    return () => { clearInterval(intervalo); clearInterval(intervaloNotif); };
  }, []);

  const completar = async (servicio) => {
    Alert.alert(
      '✅ ¿Finalizar servicio?',
      `¿Confirmas que el viaje con ${servicio.clienteNombre} terminó?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, terminó', onPress: () => {
            // Ahora preguntar si pagó
            setTimeout(() => {
              Alert.alert(
                '💰 ¿El cliente pagó?',
                `Método de pago: ${servicio.metodoPago?.toUpperCase() || 'EFECTIVO'}`,
                [
                  {
                    text: '✅ Sí pagó', onPress: () => confirmarCompletado(servicio, true)
                  },
                  {
                    text: '❌ No pagó', style: 'destructive', onPress: () => confirmarCompletado(servicio, false)
                  },
                ]
              );
            }, 500);
          }
        },
      ]
    );
  };

  const calificarCliente = (servicio) => {
    // Calificación simple 1-5 estrellas (se mapea a 1-10 como el resto del sistema)
    Alert.alert(
      '⭐ Califica al pasajero',
      `¿Cómo fue el viaje con ${servicio.clienteNombre}?`,
      [
        { text: '⭐ Malo', onPress: () => enviarCalifCliente(servicio, 2) },
        { text: '⭐⭐⭐ Regular', onPress: () => enviarCalifCliente(servicio, 6) },
        { text: '⭐⭐⭐⭐⭐ Excelente', onPress: () => enviarCalifCliente(servicio, 10) },
      ]
    );
  };

  const enviarCalifCliente = async (servicio, puntuacion) => {
    try {
      await api.put(`/services/calificar-cliente/${servicio.id}`, { calificacion: puntuacion });
      Alert.alert('¡Gracias!', 'Tu calificación del pasajero fue registrada.');
    } catch {
      // Silencioso: no bloquear al conductor si falla
    }
  };

  const compartirRecibo = async (servicio, recibo, clientePago) => {
    const tarifa = recibo?.tarifa || servicio.tarifaAcordada || servicio.tarifaMinima || 8000;
    const metodo = (recibo?.metodoPago || servicio.metodoPago || 'efectivo').toUpperCase();
    const mensaje =
      `🧾 *Recibo UntaXtame*\n\n` +
      `📍 ${servicio.origen}\n🏁 ${servicio.destino}\n` +
      `👤 ${servicio.clienteNombre || 'Cliente'}\n` +
      `🚕 ${servicio.conductorNombre || perfil?.nombre || 'Conductor'} · ${servicio.conductorPlaca || perfil?.placa || ''}\n` +
      `💰 $${Number(tarifa).toLocaleString('es-CO')} · ${metodo}\n` +
      `💳 Pago: ${clientePago ? 'Confirmado' : 'No confirmado'}\n` +
      `⏰ ${new Date().toLocaleString('es-CO')}`;
    try {
      await Share.share({ message: mensaje, title: 'Recibo UntaXtame' });
    } catch {}
  };

  const confirmarCompletado = async (servicio, clientePago) => {
    try {
      const res = await api.put(`/services/completar/${servicio.id}`, {
        clientePago,
        metodoPagoConfirmado: servicio.metodoPago,
      });
      reproducirSonido();
      const recibo = res.data?.recibo;
      Alert.alert(
        clientePago ? '✅ Servicio completado' : '⚠️ Servicio completado',
        clientePago
          ? 'Pago confirmado. El cliente recibió el recibo y puede calificarte.'
          : 'Se registró que el cliente NO pagó. Quedará en su historial.',
        [
          { text: 'Compartir recibo', onPress: () => compartirRecibo(servicio, recibo, clientePago) },
          { text: 'OK', onPress: () => setTimeout(() => calificarCliente(servicio), 400) },
        ]
      );
      cargar();
    } catch {
      Alert.alert('Error', 'No se pudo completar el servicio');
    }
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
  const servicioActivo = servicios.find(s => ['aceptado', 'conductor_en_sitio', 'en_curso'].includes(s.estado));
  const historial = servicios.filter(s => !['aceptado', 'conductor_en_sitio', 'en_curso'].includes(s.estado));

  // Reloj para minutos en camino / recordatorio Llegué
  useEffect(() => {
    const t = setInterval(() => setAhoraTick(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!servicioActivo || servicioActivo.estado !== 'aceptado') {
      recordatorioLlegueRef.current = null;
      return;
    }
    const mins = minutosDesde(servicioActivo.actualizadoEn || servicioActivo.creadoEn);
    if (mins >= 8 && recordatorioLlegueRef.current !== servicioActivo.id) {
      recordatorioLlegueRef.current = servicioActivo.id;
      reproducirSonido();
      Alert.alert(
        '📍 ¿Ya llegaste al punto?',
        'Llevas varios minutos en camino. Cuando estés con el cliente, marca “Llegué”.',
        [{ text: 'Entendido' }]
      );
    }
  }, [servicioActivo?.id, servicioActivo?.estado, ahoraTick]);

  if (cargando) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#FFC107" />;

  const minsEnCamino = servicioActivo
    ? minutosDesde(servicioActivo.actualizadoEn || servicioActivo.creadoEn)
    : 0;

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

  const iniciarViaje = async () => {
    Alert.alert(
      '🚗 ¿Iniciar viaje?',
      `¿El pasajero ${servicioActivo.clienteNombre} ya subió al taxi?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí, iniciamos', onPress: async () => {
            try {
              await api.put(`/services/iniciar/${servicioActivo.id}`, { conductorUid: perfil.uid });
              reproducirSonido();
              Alert.alert('🚗 Viaje iniciado', '¡Buen viaje! Completa el servicio al llegar al destino.');
              cargar();
            } catch (err) {
              Alert.alert('Error', err.response?.data?.error || 'No se pudo iniciar el viaje');
            }
          }
        },
      ]
    );
  };

  const headerActivo = (
    <>
      <Text style={styles.titulo}>Mis Servicios</Text>
      <AlertasConductores />
      {servicioActivo ? (
        <View style={styles.activoCard}>
          <View style={styles.activoHeader}>
            <Text style={styles.activoTitulo}>🚕 Servicio en proceso</Text>
            <View style={styles.enProcesoBadge}>
              <Text style={styles.enProcesoTexto}>
                {servicioActivo.estado === 'en_curso' ? 'EN VIAJE' : servicioActivo.estado === 'conductor_en_sitio' ? 'EN SITIO' : 'EN CAMINO'}
              </Text>
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

          <PasosViaje estado={servicioActivo.estado} />

          <View style={styles.activoDetalles}>
            <Text style={styles.activoPago}>💳 {servicioActivo.metodoPago?.toUpperCase()}</Text>
            {servicioActivo.tarifaAcordada && (
              <Text style={styles.activoTarifa}>💰 ${servicioActivo.tarifaAcordada.toLocaleString('es-CO')}</Text>
            )}
          </View>

          {servicioActivo.estado === 'aceptado' && (
            <View style={[styles.hintBanner, minsEnCamino >= 8 && styles.hintBannerUrgente]}>
              <Text style={styles.hintTexto}>
                {minsEnCamino >= 8
                  ? `⚠️ Llevas ~${minsEnCamino} min en camino. Si ya estás en el punto, marca Llegué.`
                  : `⏱️ En camino hace ~${minsEnCamino} min. Al llegar al cliente, marca Llegué.`}
              </Text>
            </View>
          )}
          {servicioActivo.estado === 'conductor_en_sitio' && (
            <View style={styles.hintBanner}>
              <Text style={styles.hintTexto}>👤 Esperando al pasajero. Cuando suba, pulsa Iniciar viaje.</Text>
            </View>
          )}
          {servicioActivo.estado === 'en_curso' && (
            <View style={[styles.hintBanner, { backgroundColor: '#E8F5E9' }]}>
              <Text style={[styles.hintTexto, { color: '#1B5E20' }]}>🛣️ Viaje en curso. Al llegar al destino, Completar.</Text>
            </View>
          )}

          <MapaViajeConductor servicioActivo={servicioActivo} />

          {servicioActivo.estado === 'en_curso' && (servicioActivo.destinoLat || servicioActivo.destino) ? (
            <TouchableOpacity
              style={[styles.btnMapa, { backgroundColor: '#2E7D32' }]}
              onPress={() => {
                if (servicioActivo.destinoLat && servicioActivo.destinoLng) {
                  Linking.openURL(`google.navigation:q=${servicioActivo.destinoLat},${servicioActivo.destinoLng}`);
                } else {
                  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(servicioActivo.destino)}`);
                }
              }}
            >
              <Text style={[styles.btnMapaTexto, { color: '#fff' }]}>🗺️ Navegar al destino</Text>
            </TouchableOpacity>
          ) : servicioActivo.ubicacionGPS ? (
            <TouchableOpacity style={[styles.btnMapa, { backgroundColor: '#1565C0' }]}
              onPress={() => Linking.openURL(`google.navigation:q=${servicioActivo.ubicacionGPS.lat},${servicioActivo.ubicacionGPS.lng}`)}>
              <Text style={[styles.btnMapaTexto, { color: '#fff' }]}>🗺️ Navegar GPS hacia el cliente</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.btnMapa, { backgroundColor: '#1565C0' }]}
              onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(servicioActivo.origen)}`)}>
              <Text style={[styles.btnMapaTexto, { color: '#fff' }]}>🗺️ Buscar dirección en el mapa</Text>
            </TouchableOpacity>
          )}

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
              <TouchableOpacity style={styles.btnIniciar} onPress={iniciarViaje}>
                <Text style={styles.btnIniciarTexto}>🚗 Iniciar viaje</Text>
              </TouchableOpacity>
            )}
            {servicioActivo.estado === 'en_curso' && (
              <TouchableOpacity style={styles.btnCompletar} onPress={() => completar(servicioActivo)}>
                <Text style={styles.btnCompletarTexto}>✅ Completar</Text>
              </TouchableOpacity>
            )}
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
      <Text style={styles.subtitulo}>Historial ({historial.length})</Text>
    </>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={historial}
        keyExtractor={item => item.id}
        ListHeaderComponent={headerActivo}
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

      {/* Reconocimiento de voz H1/H2 y códigos 20-X */}
      <ReconocimientoVozSOS servicioId={servicioActivo?.id} usuarioUid={perfil?.uid} />

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
  pasosRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 },
  pasoItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  pasoDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ddd' },
  pasoDotActivo: { backgroundColor: '#FFC107' },
  pasoLabel: { fontSize: 10, color: '#999', marginLeft: 4, fontWeight: '600' },
  pasoLabelActivo: { color: '#333' },
  pasoLinea: { flex: 1, height: 2, backgroundColor: '#eee', marginHorizontal: 4 },
  pasoLineaActiva: { backgroundColor: '#FFC107' },
  hintBanner: { backgroundColor: '#FFF8E1', borderRadius: 10, padding: 10, marginBottom: 10, borderWidth: 1, borderColor: '#FFE082' },
  hintBannerUrgente: { backgroundColor: '#FFEBEE', borderColor: '#EF9A9A' },
  hintTexto: { fontSize: 13, color: '#5D4037', fontWeight: '600' },
  btnMapa: { backgroundColor: '#E3F2FD', borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 12 },
  btnMapaTexto: { color: '#1565C0', fontWeight: '600', fontSize: 13 },
  activoAcciones: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  btnChat: { flex: 1, backgroundColor: '#1565C0', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnChatTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnCompletar: { flex: 1, backgroundColor: '#2E7D32', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnCompletarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnLlegue: { flex: 1, backgroundColor: '#FF9800', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnLlegueTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnIniciar: { flex: 1, backgroundColor: '#2E7D32', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnIniciarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
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
