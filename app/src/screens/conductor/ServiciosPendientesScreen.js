import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, RefreshControl, Linking, TextInput, Modal
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';
import { useConductorServiciosListener, useConductorOfertaAceptada } from '../../hooks/useServicioListener';
import BotonSOS from '../../components/BotonSOS';
import AlertasConductores from '../../components/AlertasConductores';
import ReconocimientoVozSOS from '../../components/ReconocimientoVozSOS';
import BarraConductor, { useSaldoConductor } from '../../components/BarraConductor';
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

  // Saldo del conductor
  const { saldo, sinSaldo } = useSaldoConductor(perfil?.uid);

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
    const intervalo = setInterval(cargar, 30000);
    return () => clearInterval(intervalo);
  }, []);

  useConductorServiciosListener(perfil?.uid, () => {
    setNuevos(prev => prev + 1);
    cargar();
  });

  useConductorOfertaAceptada(perfil?.uid, () => {
    cargar();
  });

  const abrirOferta = (servicio) => {
    if (perfil?.estadoVerificacion !== 'aprobado') {
      return Alert.alert('Cuenta no verificada', 'Tu cuenta debe ser aprobada por el administrador.');
    }
    if (sinSaldo) {
      return Alert.alert(
        '💰 Saldo insuficiente',
        'Tu saldo es $0. Necesitas recargar tu billetera para poder ofertar servicios.\n\nContacta al administrador para recargar.',
        [{ text: 'Entendido' }]
      );
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
      Alert.alert('¡Oferta enviada!', `Ofreciste ${monto.toLocaleString('es-CO')} para llevar a ${servicioSeleccionado.clienteNombre}. Espera a que el cliente acepte.`);
      setModalVisible(false);
      cargar();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo enviar la oferta');
    } finally {
      setEnviandoOferta(false);
    }
  };

  if (cargando) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#F97316" />
      </View>
    );
  }

  const noVerificado = perfil?.estadoVerificacion !== 'aprobado';

  const renderServiceCard = ({ item }) => (
    <View style={styles.card}>
      {/* Client name */}
      <View style={styles.cardHeader}>
        <View style={styles.clientRow}>
          <View style={styles.avatarCircle}>
            <Feather name="user" size={16} color="#64748B" />
          </View>
          <Text style={styles.clientName} numberOfLines={1}>{item.clienteNombre}</Text>
        </View>
        {item.totalOfertas > 0 && (
          <View style={styles.offersbadge}>
            <Feather name="tag" size={11} color="#F97316" />
            <Text style={styles.offersBadgeText}>{item.totalOfertas}</Text>
          </View>
        )}
      </View>

      {/* Route */}
      <View style={styles.routeContainer}>
        <View style={styles.routeDotsColumn}>
          <View style={styles.routeDotGreen} />
          <View style={styles.routeLine} />
          <View style={styles.routeDotRed} />
        </View>
        <View style={styles.routeTexts}>
          <Text style={styles.routeText} numberOfLines={1}>{item.origen}</Text>
          <Text style={styles.routeText} numberOfLines={1}>{item.destino}</Text>
        </View>
      </View>

      {/* Info row: payment + fare */}
      <View style={styles.cardInfoRow}>
        <View style={styles.paymentPill}>
          <Feather name={item.metodoPago === 'efectivo' ? 'dollar-sign' : 'credit-card'} size={11} color="#64748B" />
          <Text style={styles.paymentText}>{item.metodoPago?.toUpperCase()}</Text>
        </View>
        {item.tarifaEstimada && (
          <Text style={styles.fareText}>
            ${item.tarifaEstimada.tarifaEstimada?.toLocaleString('es-CO')}
          </Text>
        )}
      </View>

      {/* Requisitos */}
      {item.requisitos && item.requisitos.length > 0 && (
        <View style={styles.requisitosRow}>
          {item.requisitos.map(r => (
            <View key={r} style={styles.requisitoChip}>
              <Feather
                name={r === 'maletas' ? 'briefcase' : r === 'discapacitado' ? 'heart' : r === 'bicicleta' ? 'wind' : r === 'aireAcondicionado' ? 'thermometer' : r === 'mascotas' ? 'github' : 'check'}
                size={11}
                color="#64748B"
              />
              <Text style={styles.requisitoText}>
                {r === 'maletas' ? 'Maletas' : r === 'discapacitado' ? 'Discapacitado' : r === 'bicicleta' ? 'Bicicleta' : r === 'aireAcondicionado' ? 'A/C' : r === 'mascotas' ? 'Mascotas' : r}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Action buttons row */}
      <View style={styles.cardActions}>
        {item.clienteCelular && (
          <TouchableOpacity style={styles.iconBtn} onPress={() => Linking.openURL(`tel:${item.clienteCelular}`)}>
            <Feather name="phone" size={16} color="#64748B" />
          </TouchableOpacity>
        )}
        {item.ubicacionGPS && (
          <TouchableOpacity style={styles.iconBtn} onPress={() => Linking.openURL(`https://www.google.com/maps?q=${item.ubicacionGPS.lat},${item.ubicacionGPS.lng}`)}>
            <Feather name="map-pin" size={16} color="#64748B" />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.ofertarBtn, (noVerificado || servicioActivo || penalizado || sinSaldo) && styles.ofertarBtnDisabled]}
          onPress={() => abrirOferta(item)}
          activeOpacity={0.8}
        >
          <Text style={[styles.ofertarBtnText, (noVerificado || servicioActivo || penalizado || sinSaldo) && styles.ofertarBtnTextDisabled]}>
            {noVerificado ? 'PENDIENTE' : penalizado ? 'PENALIZADO' : sinSaldo ? 'SIN SALDO' : servicioActivo ? 'EN SERVICIO' : 'OFERTAR'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandName}>Untax</Text>
          <View style={styles.countBadge}>
            <Text style={styles.countBadgeText}>{servicios.length}</Text>
          </View>
        </View>
        {nuevos > 0 && (
          <View style={styles.newBadge}>
            <Feather name="bell" size={12} color="#fff" />
            <Text style={styles.newBadgeText}>{nuevos}</Text>
          </View>
        )}
      </View>

      {/* Wallet bar */}
      <BarraConductor uid={perfil?.uid} />

      {/* Verification notice */}
      {noVerificado && (
        <View style={styles.noticeCard}>
          <Feather name="clock" size={20} color="#F97316" />
          <View style={styles.noticeContent}>
            <Text style={styles.noticeTitle}>Cuenta en revisión</Text>
            <Text style={styles.noticeText}>Podrás ofertar cuando el administrador apruebe tus documentos.</Text>
          </View>
        </View>
      )}

      {/* Penalization notice */}
      {penalizado && (
        <View style={[styles.noticeCard, styles.noticeCardRed]}>
          <Feather name="slash" size={20} color="#DC2626" />
          <View style={styles.noticeContent}>
            <Text style={[styles.noticeTitle, { color: '#DC2626' }]}>Penalización activa</Text>
            <Text style={styles.noticeText}>
              5 cancelaciones frecuentes. Hasta: {penalizadoHasta ? new Date(penalizadoHasta).toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '—'}
            </Text>
          </View>
        </View>
      )}

      {/* Active service notice */}
      {servicioActivo && (
        <View style={[styles.noticeCard, styles.noticeCardBlue]}>
          <Feather name="navigation" size={20} color="#2563EB" />
          <View style={styles.noticeContent}>
            <Text style={[styles.noticeTitle, { color: '#2563EB' }]}>Servicio en curso</Text>
            <Text style={styles.noticeText} numberOfLines={1}>
              {servicioActivo.clienteNombre} — {servicioActivo.origen}
            </Text>
          </View>
        </View>
      )}

      {/* Alertas de emergencia */}
      <AlertasConductores />

      {/* Mini mapa con servicios pendientes */}
      {servicios.filter(s => s.ubicacionGPS?.lat).length > 0 && (
        <View style={styles.miniMapaContainer}>
          <MapView
            style={styles.miniMapa}
            initialRegion={{
              latitude: servicios.find(s => s.ubicacionGPS?.lat)?.ubicacionGPS?.lat || 7.08,
              longitude: servicios.find(s => s.ubicacionGPS?.lat)?.ubicacionGPS?.lng || -73.17,
              latitudeDelta: 0.05,
              longitudeDelta: 0.05,
            }}
            showsUserLocation={true}
          >
            {servicios.filter(s => s.ubicacionGPS?.lat).map(s => (
              <Marker
                key={s.id}
                coordinate={{ latitude: s.ubicacionGPS.lat, longitude: s.ubicacionGPS.lng }}
                title={s.clienteNombre}
                description={s.origen}
              >
                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 20 }}>👤</Text>
                  <View style={{ backgroundColor: '#F97316', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                    <Text style={{ fontSize: 8, color: '#fff', fontWeight: 'bold' }}>{s.clienteNombre?.split(' ')[0]}</Text>
                  </View>
                </View>
              </Marker>
            ))}
          </MapView>
          <Text style={styles.miniMapaLabel}>📍 {servicios.filter(s => s.ubicacionGPS?.lat).length} clientes esperando</Text>
        </View>
      )}

      {/* Error */}
      {error && (
        <View style={styles.errorCard}>
          <Feather name="alert-triangle" size={16} color="#DC2626" />
          <Text style={styles.errorText} numberOfLines={2}>{error}</Text>
          <TouchableOpacity onPress={cargar}>
            <Text style={styles.errorRetry}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Service list */}
      <FlatList
        data={servicios}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); cargar(); }}
            colors={['#F97316']}
            tintColor="#F97316"
          />
        }
        contentContainerStyle={servicios.length === 0 ? styles.emptyListContainer : styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="radio" size={64} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>Sin servicios disponibles</Text>
            <Text style={styles.emptySubtitle}>Desliza hacia abajo para actualizar</Text>
          </View>
        }
        renderItem={renderServiceCard}
      />

      {/* FAB buttons */}
      <BotonSOS servicioId={null} />
      <ReconocimientoVozSOS servicioId={null} usuarioUid={perfil?.uid} />

      {/* Modal de oferta */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            {/* Modal handle */}
            <View style={styles.modalHandle} />

            <Text style={styles.modalTitle}>Tu oferta</Text>
            <Text style={styles.modalSubtitle} numberOfLines={2}>
              {servicioSeleccionado?.clienteNombre} — {servicioSeleccionado?.origen} → {servicioSeleccionado?.destino}
            </Text>

            {servicioSeleccionado?.tarifaEstimada && (
              <View style={styles.suggestedFareRow}>
                <Feather name="info" size={14} color="#16A34A" />
                <Text style={styles.suggestedFareText}>
                  Sugerida: ${servicioSeleccionado.tarifaEstimada.tarifaEstimada?.toLocaleString('es-CO')}
                </Text>
              </View>
            )}

            <Text style={styles.modalLabel}>¿Cuánto cobras? (mínimo $8,000)</Text>
            <TextInput
              style={styles.modalInput}
              value={montoOferta}
              onChangeText={setMontoOferta}
              keyboardType="numeric"
              placeholder="8000"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.modalLabel}>Mensaje al cliente (opcional)</Text>
            <TextInput
              style={[styles.modalInput, { height: 64, textAlignVertical: 'top' }]}
              value={mensajeOferta}
              onChangeText={setMensajeOferta}
              placeholder="Ej: Estoy cerca, llego en 5 min"
              placeholderTextColor="#94A3B8"
              multiline
            />

            <TouchableOpacity
              style={styles.modalSubmitBtn}
              onPress={enviarOferta}
              disabled={enviandoOferta}
              activeOpacity={0.8}
            >
              {enviandoOferta
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.modalSubmitText}>ENVIAR OFERTA ${parseInt(montoOferta || 0).toLocaleString('es-CO')}</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingTop: 4,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  countBadge: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  countBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
  },
  newBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  newBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
  },

  // Notice cards
  noticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  noticeCardRed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  noticeCardBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  noticeContent: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F97316',
    marginBottom: 2,
  },
  noticeText: {
    fontSize: 12,
    color: '#64748B',
  },

  // Error
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#DC2626',
  },
  errorRetry: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#2563EB',
  },

  // List
  listContent: {
    paddingBottom: 100,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#94A3B8',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#CBD5E1',
    marginTop: 4,
  },

  // Service card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  clientName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#1E293B',
    flex: 1,
  },
  offersbadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  offersBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#F97316',
  },

  // Route
  routeContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  routeDotsColumn: {
    alignItems: 'center',
    paddingTop: 4,
    width: 12,
  },
  routeDotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#16A34A',
  },
  routeLine: {
    width: 1.5,
    flex: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 3,
  },
  routeDotRed: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
  },
  routeTexts: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 8,
  },
  routeText: {
    fontSize: 12,
    color: '#64748B',
  },

  // Info row
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  paymentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  paymentText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  fareText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#16A34A',
  },

  // Requisitos
  requisitosRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  requisitoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  requisitoText: {
    fontSize: 12,
    color: '#64748B',
  },

  // Card actions
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ofertarBtn: {
    flex: 1,
    backgroundColor: '#F97316',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ofertarBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  ofertarBtnText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  ofertarBtnTextDisabled: {
    color: '#94A3B8',
  },

  // Mini mapa
  miniMapaContainer: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  miniMapa: {
    width: '100%',
    height: 150,
  },
  miniMapaLabel: {
    backgroundColor: '#fff',
    padding: 8,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    textAlign: 'center',
  },

  // FAB container
  fabContainer: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    alignItems: 'center',
    gap: 12,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingTop: 16,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1E293B',
    textAlign: 'center',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 16,
  },
  suggestedFareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 20,
  },
  suggestedFareText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#16A34A',
  },
  modalLabel: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1E293B',
    backgroundColor: '#F8FAFC',
    marginBottom: 14,
  },
  modalSubmitBtn: {
    backgroundColor: '#F97316',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  modalSubmitText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  modalCancelBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  modalCancelText: {
    fontSize: 15,
    color: '#94A3B8',
    fontWeight: '600',
  },
});
