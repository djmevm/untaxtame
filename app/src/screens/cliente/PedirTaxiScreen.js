import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, Alert, ScrollView, ActivityIndicator, Linking, Dimensions
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';
import { useClienteServicioListener } from '../../hooks/useServicioListener';
import CalificacionModal from '../../components/CalificacionModal';
import ChatServicio from '../../components/ChatServicio';
import OfertasRecibidas from '../../components/OfertasRecibidas';
import ConductoresCercanos from '../../components/ConductoresCercanos';
import MapaServicioActivo from '../../components/MapaServicioActivo';
import useChatNotificacion from '../../hooks/useChatNotificacion';

const { width } = Dimensions.get('window');

const METODOS_PAGO = [
  { id: 'daviplata', label: 'Daviplata', color: '#E53935' },
  { id: 'nequi',     label: 'Nequi',     color: '#6A1B9A' },
  { id: 'efectivo',  label: 'Efectivo',  color: '#2E7D32' },
];

const ESTADO_CONFIG = {
  pendiente:          { color: '#FFC107', textColor: '#000', label: 'Buscando conductor...', icon: '🔍' },
  aceptado:           { color: '#1565C0', textColor: '#fff', label: '¡Conductor en camino!', icon: '🚕' },
  conductor_en_sitio: { color: '#FF9800', textColor: '#fff', label: '¡Conductor en el punto!', icon: '📍' },
  completado:         { color: '#2E7D32', textColor: '#fff', label: 'Servicio completado',   icon: '✅' },
  cancelado:          { color: '#E53935', textColor: '#fff', label: 'Servicio cancelado',    icon: '❌' },
};

// Región por defecto: Colombia
const REGION_DEFAULT = {
  latitude: 4.6097,
  longitude: -74.0817,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

export default function PedirTaxiScreen() {
  const { perfil } = useAuth();
  const mapRef = useRef(null);
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [metodoPago, setMetodoPago] = useState('');
  const [ubicacionGPS, setUbicacionGPS] = useState(null);
  const [destinoGPS, setDestinoGPS] = useState(null);
  const [cargandoGPS, setCargandoGPS] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [servicioActivo, setServicioActivo] = useState(null);
  const [mostrarCalificacion, setMostrarCalificacion] = useState(false);
  const [mostrarChat, setMostrarChat] = useState(false);
  const [region, setRegion] = useState(REGION_DEFAULT);
  const [tarifa, setTarifa] = useState(null);
  const [cargandoTarifa, setCargandoTarifa] = useState(false);
  const [seleccionandoDestino, setSeleccionandoDestino] = useState(false);
  const [requisitos, setRequisitos] = useState({
    maletas: false,
    discapacitado: false,
    bicicleta: false,
    aireAcondicionado: false,
    mascotas: false,
  });

  useClienteServicioListener(perfil?.uid);

  // GPS automático al abrir la app
  useEffect(() => {
    obtenerUbicacion();
  }, []);

  // Notificar mensajes de chat cuando el chat está cerrado
  useChatNotificacion(servicioActivo?.id, perfil?.uid, mostrarChat);

  // Verificar estado del servicio activo periódicamente
  useEffect(() => {
    if (!servicioActivo?.id) return;

    const verificar = async () => {
      try {
        const res = await api.get(`/services/historial/${perfil?.uid}/cliente`);
        const actual = res.data.find(s => s.id === servicioActivo.id);
        if (actual && actual.estado !== servicioActivo.estado) {
          setServicioActivo(actual);
          if (actual.estado === 'completado') {
            // Mostrar calificación automáticamente
            setTimeout(() => setMostrarCalificacion(true), 500);
          }
        }
      } catch {}
    };

    const intervalo = setInterval(verificar, 10000);
    return () => clearInterval(intervalo);
  }, [servicioActivo?.id, servicioActivo?.estado]);

  const obtenerUbicacion = async () => {
    setCargandoGPS(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu ubicación');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = loc.coords;

      const [lugar] = await Location.reverseGeocodeAsync({
        latitude: coords.latitude,
        longitude: coords.longitude,
      });

      const direccionTexto = lugar
        ? `${lugar.street || ''} ${lugar.streetNumber || ''}, ${lugar.city || lugar.district || ''}`
        : `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}`;

      const nuevaUbicacion = { lat: coords.latitude, lng: coords.longitude, texto: direccionTexto.trim() };
      setUbicacionGPS(nuevaUbicacion);
      setOrigen(direccionTexto.trim());

      const nuevaRegion = {
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      };
      setRegion(nuevaRegion);
      mapRef.current?.animateToRegion(nuevaRegion, 800);
    } catch {
      Alert.alert('Error', 'No se pudo obtener la ubicación');
    } finally {
      setCargandoGPS(false);
    }
  };

  // Seleccionar destino tocando el mapa
  const handleMapPress = async (e) => {
    if (!seleccionandoDestino) return;

    const { latitude, longitude } = e.nativeEvent.coordinate;
    setDestinoGPS({ lat: latitude, lng: longitude });

    try {
      const [lugar] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const direccionTexto = lugar
        ? `${lugar.street || ''} ${lugar.streetNumber || ''}, ${lugar.city || lugar.district || ''}`
        : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
      setDestino(direccionTexto.trim());
    } catch {
      setDestino(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
    }

    setSeleccionandoDestino(false);
  };

  // Estimar tarifa cuando hay origen y destino GPS
  useEffect(() => {
    if (ubicacionGPS && destinoGPS) {
      estimarTarifa();
    } else {
      setTarifa(null);
    }
  }, [ubicacionGPS, destinoGPS]);

  const estimarTarifa = async () => {
    if (!ubicacionGPS || !destinoGPS) return;
    setCargandoTarifa(true);
    try {
      const res = await api.post('/services/estimar-tarifa', {
        origenLat: ubicacionGPS.lat,
        origenLng: ubicacionGPS.lng,
        destinoLat: destinoGPS.lat,
        destinoLng: destinoGPS.lng,
      });
      setTarifa(res.data);
    } catch {
      setTarifa(null);
    } finally {
      setCargandoTarifa(false);
    }
  };

  const formatCOP = (valor) => {
    return '$' + valor.toLocaleString('es-CO');
  };

  const seleccionarMetodoPago = (id) => {
    setMetodoPago(id);
  };

  const solicitarTaxi = async () => {
    if (!origen) {
      return Alert.alert('Falta origen', 'Toca el botón 📡 para obtener tu ubicación');
    }
    if (!destino) {
      return Alert.alert('Falta destino', 'Selecciona a dónde vas tocando el mapa');
    }
    if (!metodoPago) {
      return Alert.alert('Falta método de pago', 'Selecciona cómo vas a pagar');
    }
    setCargando(true);
    try {
      const res = await api.post('/services/solicitar', {
        clienteUid:    perfil.uid,
        clienteNombre: perfil.nombre,
        clienteCelular: perfil.telefono,
        clienteDireccion: perfil.direccion,
        origen,
        destino,
        metodoPago,
        ubicacionGPS: ubicacionGPS || null,
        destinoLat: destinoGPS?.lat || null,
        destinoLng: destinoGPS?.lng || null,
        requisitos: Object.entries(requisitos).filter(([k, v]) => v).map(([k]) => k),
      });
      setServicioActivo(res.data.servicio);
    } catch (err) {
      const mensaje = err.response?.data?.error || err.message || 'No se pudo solicitar el taxi';
      Alert.alert('Error', mensaje);
    } finally {
      setCargando(false);
    }
  };

  const cancelarServicio = async () => {
    // Verificar si aplica penalización (conductor en sitio)
    if (servicioActivo.estado === 'conductor_en_sitio') {
      try {
        const verif = await api.get('/services/verificar-penalizacion/' + servicioActivo.id);
        if (verif.data.aplicaPenalizacion) {
          var p = verif.data;
          Alert.alert(
            '⚠️ ¡ATENCIÓN! Cargo por cancelación',
            'El conductor ' + (servicioActivo.conductorNombre || '') + ' ya está en el punto de recogida esperándote.\n\n' +
            'Si cancelas ahora, se aplicará un cargo de:\n' +
            '💰 $' + p.montoPenalizacion.toLocaleString('es-CO') + '\n' +
            '(' + p.porcentaje + '% de la tarifa acordada de $' + p.tarifa.toLocaleString('es-CO') + ')\n\n' +
            'Este valor será transferido al conductor como compensación por su tiempo y desplazamiento.\n\n' +
            '⏱️ Tiempo esperando: ' + p.minutosEnSitio + ' minutos',
            [
              { text: 'No cancelar', style: 'cancel' },
              { text: 'Cancelar y pagar cargo', style: 'destructive', onPress: function() { ejecutarCancelacion(); } },
            ]
          );
          return;
        }
        if (verif.data.minutosRestantes) {
          Alert.alert(
            '⏱️ Tiempo de gracia',
            'Estás dentro del tiempo de gracia (' + verif.data.minutosRestantes + ' min restantes).\n\nPuedes cancelar sin cargo, pero el conductor ya está en el punto.',
            [
              { text: 'No cancelar', style: 'cancel' },
              { text: 'Cancelar sin cargo', style: 'destructive', onPress: function() { ejecutarCancelacion(); } },
            ]
          );
          return;
        }
      } catch (e) {}
    }

    // Estado aceptado: advertir que el conductor viene en camino
    if (servicioActivo.estado === 'aceptado' && servicioActivo.conductorNombre) {
      Alert.alert(
        '🚕 Conductor en camino',
        servicioActivo.conductorNombre + ' ya está en camino hacia ti.\n\n¿Estás seguro de que deseas cancelar?',
        [
          { text: 'No cancelar', style: 'cancel' },
          { text: 'Sí, cancelar', style: 'destructive', onPress: function() { ejecutarCancelacion(); } },
        ]
      );
      return;
    }

    // Estado pendiente: cancelar sin problema
    Alert.alert('Cancelar servicio', '¿Estás seguro de que deseas cancelar la solicitud?', [
      { text: 'No', style: 'cancel' },
      { text: 'Sí, cancelar', style: 'destructive', onPress: function() { ejecutarCancelacion(); } },
    ]);
  };

  const ejecutarCancelacion = async () => {
    try {
      var res = await api.put('/services/cancelar/' + servicioActivo.id, { motivo: 'Cancelado por el cliente', canceladoPor: 'cliente' });
      setServicioActivo(function(prev) { return Object.assign({}, prev, { estado: 'cancelado' }); });
      if (res.data.penalizacionCliente) {
        var pen = res.data.penalizacionCliente;
        Alert.alert(
          '⚠️ Penalización aplicada',
          'Se aplicó un cargo de $' + pen.monto.toLocaleString('es-CO') + ' (' + pen.porcentaje + '% de $' + pen.tarifa.toLocaleString('es-CO') + ').\n\n' +
          'Motivo: Cancelación con conductor en punto de recogida (' + pen.minutosEnSitio + ' min esperando).\n\n' +
          'Este valor fue transferido al conductor como compensación.'
        );
      } else {
        Alert.alert('Servicio cancelado', 'Tu solicitud ha sido cancelada.');
      }
    } catch (err) { Alert.alert('Error', (err.response && err.response.data && err.response.data.error) || 'No se pudo cancelar'); }
  };

  const abrirMapa = () => {
    if (!ubicacionGPS) return;
    Linking.openURL(`https://www.google.com/maps?q=${ubicacionGPS.lat},${ubicacionGPS.lng}`);
  };

  const llamarConductor = (telefono) => {
    if (!telefono) return;
    Linking.openURL(`tel:${telefono}`);
  };

  // ── FORMULARIO ──
  if (!servicioActivo) {
    return (
      <View style={styles.containerFull}>
        {/* Mapa de fondo grande */}
        <MapView
          ref={mapRef}
          style={styles.mapaFull}
          initialRegion={region}
          showsUserLocation={true}
          showsMyLocationButton={false}
          onRegionChangeComplete={async (newRegion) => {
            if (!seleccionandoDestino) return;
            const lat = newRegion.latitude;
            const lng = newRegion.longitude;
            setDestinoGPS({ lat, lng });
            try {
              const [lugar] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
              const dir = lugar
                ? (lugar.street || '') + ' ' + (lugar.streetNumber || '') + ', ' + (lugar.city || lugar.district || '')
                : lat.toFixed(5) + ', ' + lng.toFixed(5);
              setDestino(dir.trim());
            } catch (e) {
              setDestino(lat.toFixed(5) + ', ' + lng.toFixed(5));
            }
          }}
        >
          {ubicacionGPS && (
            <Marker
              coordinate={{ latitude: ubicacionGPS.lat, longitude: ubicacionGPS.lng }}
              title="Tu ubicación"
              description={origen}
              pinColor="#1565C0"
            />
          )}
          {destinoGPS && !seleccionandoDestino && (
            <Marker
              coordinate={{ latitude: destinoGPS.lat, longitude: destinoGPS.lng }}
              title="Destino"
              description={destino}
              pinColor="#E53935"
            />
          )}
        </MapView>

        {/* Pin central cuando selecciona destino */}
        {seleccionandoDestino && (
          <View style={styles.pinCentral} pointerEvents="none">
            <Text style={styles.pinEmoji}>📍</Text>
            <View style={styles.pinSombra} />
          </View>
        )}

        {/* Banner instrucción destino */}
        {seleccionandoDestino && (
          <View style={styles.bannerDestino}>
            <Text style={styles.bannerDestinoTexto}>🚕 Mueve el mapa para elegir destino</Text>
            {destino ? <Text style={styles.bannerDireccion} numberOfLines={1}>{destino}</Text> : null}
            {destinoGPS && (
              <TouchableOpacity style={styles.btnConfirmarDestino} onPress={() => setSeleccionandoDestino(false)}>
                <Text style={styles.btnConfirmarDestinoTexto}>✅ Confirmar destino</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Botón menú / GPS */}
        <TouchableOpacity style={styles.btnMenuFloat} onPress={obtenerUbicacion} disabled={cargandoGPS}>
          {cargandoGPS
            ? <ActivityIndicator size="small" color="#333" />
            : <Text style={styles.btnMenuIcon}>📡</Text>
          }
        </TouchableOpacity>

        {/* Panel inferior */}
        {!seleccionandoDestino && (
          <View style={styles.panelInferior}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.panelScroll}>
              {/* Saludo con foto del cliente */}
              <View style={styles.saludoRow}>
                {perfil?.fotoPerfil ? (
                  <Image source={{ uri: perfil.fotoPerfil }} style={styles.saludoFoto} />
                ) : (
                  <View style={styles.saludoAvatarCircle}>
                    <Text style={styles.saludoAvatarLetra}>{perfil?.nombre?.charAt(0)?.toUpperCase() || '?'}</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.saludoTexto}>
                    ¡Hola! <Text style={styles.saludoNombre}>{perfil?.nombre?.split(' ')[0]}</Text>
                  </Text>
                  <Text style={styles.saludoSub}>¿A dónde vamos hoy?</Text>
                </View>
              </View>

              {/* Campo origen editable */}
              <View style={styles.inputRow}>
                <View style={styles.inputDot}>
                  <View style={styles.dotGreen} />
                </View>
                <TextInput
                  style={styles.inputField}
                  placeholder="¿Dónde estás? (Origen)"
                  placeholderTextColor="#94A3B8"
                  value={origen}
                  onChangeText={setOrigen}
                />
                <TouchableOpacity style={styles.inputAction} onPress={obtenerUbicacion} disabled={cargandoGPS}>
                  {cargandoGPS
                    ? <ActivityIndicator size="small" color="#16A34A" />
                    : <Text style={styles.inputActionIcon}>📡</Text>
                  }
                </TouchableOpacity>
              </View>

              {/* Campo destino editable */}
              <View style={styles.inputRow}>
                <View style={styles.inputDot}>
                  <View style={styles.dotRed} />
                </View>
                <TextInput
                  style={styles.inputField}
                  placeholder="¿Hacia dónde vamos? (Destino)"
                  placeholderTextColor="#94A3B8"
                  value={destino}
                  onChangeText={(text) => {
                    setDestino(text);
                    setDestinoGPS(null);
                    setTarifa(null);
                  }}
                />
                <TouchableOpacity style={styles.inputAction} onPress={() => setSeleccionandoDestino(true)}>
                  <Text style={styles.inputActionIcon}>📌</Text>
                </TouchableOpacity>
              </View>

              {/* Conductores cercanos */}
              <ConductoresCercanos />

              {/* Tarifa estimada */}
              {cargandoTarifa && (
                <View style={styles.tarifaCard}>
                  <ActivityIndicator size="small" color="#FFC107" />
                  <Text style={styles.tarifaCargando}>Calculando tarifa...</Text>
                </View>
              )}
              {tarifa && !cargandoTarifa && (
                <View style={styles.tarifaCard}>
                  <View style={styles.tarifaHeader}>
                    <Text style={styles.tarifaTitulo}>💰 Tarifa estimada</Text>
                    {tarifa.esNocturno && (
                      <View style={styles.nocturnoBadge}>
                        <Text style={styles.nocturnoTexto}>🌙 Nocturno</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.tarifaPrecio}>{formatCOP(tarifa.tarifaEstimada)}</Text>
                  <Text style={styles.tarifaRango}>
                    Rango: {formatCOP(tarifa.rangoMinimo)} — {formatCOP(tarifa.rangoMaximo)}
                  </Text>
                  <View style={styles.tarifaDetalles}>
                    <Text style={styles.tarifaDetalle}>📏 {tarifa.distanciaKm} km</Text>
                    <Text style={styles.tarifaDetalle}>⏱️ ~{tarifa.tiempoEstimadoMin} min</Text>
                  </View>
                </View>
              )}

              {/* Método de pago */}
              <Text style={styles.labelSeccion}>Método de pago</Text>
              <View style={styles.pagoGrid}>
                {METODOS_PAGO.map((m) => (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.pagoBtn, { borderColor: m.color }, metodoPago === m.id && { backgroundColor: m.color }]}
                    onPress={() => seleccionarMetodoPago(m.id)}
                  >
                    <Text style={[styles.pagoTexto, metodoPago === m.id && { color: '#fff' }]}>{m.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Requisitos especiales */}
              <Text style={styles.labelSeccion}>Requisitos especiales:</Text>
              <View style={styles.requisitosGrid}>
                {[
                  { key: 'maletas', icon: '🧳', label: 'Maletas extras' },
                  { key: 'discapacitado', icon: '♿', label: 'Pasajero discapacitado' },
                  { key: 'bicicleta', icon: '🚲', label: 'Soporte bicicleta' },
                  { key: 'aireAcondicionado', icon: '❄️', label: 'Aire acondicionado' },
                  { key: 'mascotas', icon: '🐾', label: 'Mascotas permitidas' },
                ].map((req) => (
                  <TouchableOpacity
                    key={req.key}
                    style={[styles.requisitoBtn, requisitos[req.key] && styles.requisitoBtnActivo]}
                    onPress={() => setRequisitos(prev => ({ ...prev, [req.key]: !prev[req.key] }))}
                  >
                    <Text style={styles.requisitoIcon}>{req.icon}</Text>
                    <Text style={styles.requisitoLabel}>{req.label}</Text>
                    {requisitos[req.key] && <Text style={styles.requisitoCheck}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Botón pedir taxi */}
              <TouchableOpacity style={styles.btnSolicitar} onPress={solicitarTaxi} disabled={cargando}>
                {cargando
                  ? <ActivityIndicator color="#000" />
                  : <Text style={styles.btnSolicitarTexto}>🚕 PEDIR TAXI</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        )}
      </View>
    );
  }

  // ── DETALLE DEL SERVICIO ACTIVO ──
  const estadoCfg = ESTADO_CONFIG[servicioActivo.estado] || ESTADO_CONFIG.pendiente;

  return (
    <>
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.titulo}>🚕 Pide Taxi</Text>

      {/* Mapa en tiempo real */}
      <MapaServicioActivo servicioActivo={servicioActivo} destinoGPS={destinoGPS} />

      {/* Estado del servicio */}
      <View style={[styles.estadoCard, { backgroundColor: estadoCfg.color }]}>
        <Text style={styles.estadoIcon}>{estadoCfg.icon}</Text>
        <Text style={[styles.estadoLabel, { color: estadoCfg.textColor }]}>{estadoCfg.label}</Text>
        {servicioActivo.estado === 'pendiente' && (
          <ActivityIndicator color={estadoCfg.textColor} style={{ marginTop: 6 }} />
        )}
      </View>

      {/* Tarifa estimada en servicio activo */}
      {servicioActivo.tarifaEstimada && (
        <View style={styles.tarifaCardActivo}>
          <Text style={styles.tarifaTitulo}>💰 Tarifa estimada</Text>
          <Text style={styles.tarifaPrecioActivo}>
            {formatCOP(servicioActivo.tarifaEstimada.tarifaEstimada)}
          </Text>
          <Text style={styles.tarifaRango}>
            {formatCOP(servicioActivo.tarifaEstimada.rangoMinimo)} — {formatCOP(servicioActivo.tarifaEstimada.rangoMaximo)}
          </Text>
        </View>
      )}

      {/* Datos del Cliente */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>👤 Datos del Cliente</Text>
        <View style={styles.datoFila}>
          <Text style={styles.datoLabel}>Nombre</Text>
          <Text style={styles.datoValor}>{servicioActivo.clienteNombre}</Text>
        </View>
        <View style={styles.separador} />
        <View style={styles.datoFila}>
          <Text style={styles.datoLabel}>Celular</Text>
          <Text style={styles.datoValor}>{servicioActivo.clienteCelular || perfil?.telefono || '—'}</Text>
        </View>
        <View style={styles.separador} />
        <View style={styles.datoFila}>
          <Text style={styles.datoLabel}>Pago</Text>
          <View style={[styles.pagoBadge, { backgroundColor: METODOS_PAGO.find(m => m.id === servicioActivo.metodoPago)?.color || '#999' }]}>
            <Text style={styles.pagoBadgeTexto}>{servicioActivo.metodoPago?.toUpperCase()}</Text>
          </View>
        </View>
      </View>

      {/* Ruta */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>🗺️ Ruta</Text>
        <View style={styles.rutaFila}>
          <View style={[styles.rutaPunto, { backgroundColor: '#1565C0' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rutaEtiqueta}>Origen</Text>
            <Text style={styles.rutaTexto}>{servicioActivo.origen}</Text>
          </View>
        </View>
        <View style={styles.rutaLinea} />
        <View style={styles.rutaFila}>
          <View style={[styles.rutaPunto, { backgroundColor: '#E53935' }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.rutaEtiqueta}>Destino</Text>
            <Text style={styles.rutaTexto}>{servicioActivo.destino}</Text>
          </View>
        </View>
      </View>

      {/* Conductor */}
      {servicioActivo.conductorNombre ? (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>🚕 Datos del Conductor</Text>
          <View style={styles.datoFila}>
            <Text style={styles.datoLabel}>Nombre</Text>
            <Text style={styles.datoValor}>{servicioActivo.conductorNombre}</Text>
          </View>
          <View style={styles.separador} />
          <View style={styles.datoFila}>
            <Text style={styles.datoLabel}>Placa</Text>
            <Text style={[styles.datoValor, styles.placa]}>{servicioActivo.conductorPlaca || '—'}</Text>
          </View>
          <View style={styles.separador} />
          <View style={styles.datoFila}>
            <Text style={styles.datoLabel}>Celular</Text>
            {servicioActivo.conductorCelular ? (
              <TouchableOpacity onPress={() => llamarConductor(servicioActivo.conductorCelular)}>
                <Text style={styles.telefonoLink}>📞 {servicioActivo.conductorCelular}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.datoValor}>—</Text>
            )}
          </View>
        </View>
      ) : servicioActivo.estado === 'pendiente' ? (
        <OfertasRecibidas servicioId={servicioActivo.id} onAceptar={(oferta) => {
          setServicioActivo(prev => ({
            ...prev,
            conductorNombre: oferta.conductorNombre,
            conductorPlaca: oferta.conductorPlaca,
            conductorCelular: oferta.conductorCelular,
            tarifaAcordada: oferta.monto,
            estado: 'aceptado',
          }));
        }} />
      ) : (
        <View style={[styles.seccion, styles.esperandoCard]}>
          <Text style={styles.esperandoTexto}>⏳ Procesando servicio...</Text>
        </View>
      )}

      {/* Calificación */}
      {servicioActivo.estado === 'completado' && !servicioActivo.calificacion?.puntuacion && (
        <TouchableOpacity style={styles.btnCalificar} onPress={() => setMostrarCalificacion(true)}>
          <Text style={styles.btnCalificarTexto}>⭐ Calificar este viaje</Text>
        </TouchableOpacity>
      )}
      {servicioActivo.calificacion?.puntuacion && (
        <View style={styles.calificacionMostrada}>
          <Text style={styles.calificacionPuntuacion}>
            {servicioActivo.calificacion.puntuacion}/10
          </Text>
          {servicioActivo.calificacion.comentario ? (
            <Text style={styles.calificacionComentario}>"{servicioActivo.calificacion.comentario}"</Text>
          ) : null}
        </View>
      )}

      {/* Chat y SOS — solo cuando hay conductor */}
      {servicioActivo.conductorNombre && ['pendiente', 'aceptado', 'conductor_en_sitio'].includes(servicioActivo.estado) && (
        <View style={styles.chatSOSRow}>
          <TouchableOpacity style={styles.btnChat} onPress={() => setMostrarChat(true)}>
            <Text style={styles.btnChatTexto}>💬 Chat con conductor</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Acciones */}
      <View style={styles.acciones}>
        {['pendiente', 'aceptado', 'conductor_en_sitio'].includes(servicioActivo.estado) && (
          <TouchableOpacity style={styles.btnCancelar} onPress={cancelarServicio}>
            <Text style={styles.btnCancelarTexto}>Cancelar servicio</Text>
          </TouchableOpacity>
        )}
        {servicioActivo.estado === 'aceptado' && (
          <TouchableOpacity style={styles.btnNuevo} onPress={() => {
            setServicioActivo(null);
            setTarifa(null);
            setDestinoGPS(null);
            setOrigen('');
            setDestino('');
            setMetodoPago('');
            setRequisitos({ maletas: false, discapacitado: false, bicicleta: false, aireAcondicionado: false, mascotas: false });
          }}>
            <Text style={styles.btnNuevoTexto}>🚕 Solicitar otro taxi</Text>
          </TouchableOpacity>
        )}
        {['completado', 'cancelado'].includes(servicioActivo.estado) && (
          <TouchableOpacity style={styles.btnNuevo} onPress={() => {
            setServicioActivo(null);
            setTarifa(null);
            setDestinoGPS(null);
            setOrigen('');
            setDestino('');
            setMetodoPago('');
            setRequisitos({ maletas: false, discapacitado: false, bicicleta: false, aireAcondicionado: false, mascotas: false });
          }}>
            <Text style={styles.btnNuevoTexto}>🚕 Pedir nuevo taxi</Text>
          </TouchableOpacity>
        )}
      </View>

      <CalificacionModal
        visible={mostrarCalificacion}
        servicio={servicioActivo}
        onCerrar={() => {
          setMostrarCalificacion(false);
          setServicioActivo(prev => ({ ...prev, calificacion: { puntuacion: 10 } }));
        }}
      />

    </ScrollView>
    <ChatServicio
      servicioId={servicioActivo?.id}
      visible={mostrarChat}
      onCerrar={() => setMostrarChat(false)}
    />
    </>
  );
}


const styles = StyleSheet.create({
  // ═══ NUEVO DISEÑO PROFESIONAL ═══
  containerFull: { flex: 1, backgroundColor: '#f5f5f5' },
  mapaFull: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 0 },

  btnMenuFloat: {
    position: 'absolute', top: 50, left: 16,
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4,
  },
  btnMenuIcon: { fontSize: 20 },

  pinCentral: {
    position: 'absolute', top: '40%', left: '50%',
    marginLeft: -20, marginTop: -48,
    alignItems: 'center', zIndex: 5,
  },
  pinEmoji: { fontSize: 40 },
  pinSombra: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: 'rgba(0,0,0,0.3)', marginTop: -6,
  },

  bannerDestino: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: 'rgba(229, 57, 53, 0.95)', padding: 16,
    paddingTop: 50, alignItems: 'center', zIndex: 10,
  },
  bannerDestinoTexto: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  bannerDireccion: { color: '#FFE082', fontSize: 13, marginTop: 4 },
  btnConfirmarDestino: {
    backgroundColor: '#fff', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 30,
    marginTop: 12, elevation: 4,
  },
  btnConfirmarDestinoTexto: { color: '#2E7D32', fontWeight: 'bold', fontSize: 15 },

  // Panel inferior
  panelInferior: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '50%', elevation: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 8,
  },
  panelScroll: { padding: 20, paddingBottom: 30 },

  // Saludo
  saludoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  saludoFoto: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: '#FFC107' },
  saludoAvatarCircle: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFC107',
    alignItems: 'center', justifyContent: 'center',
  },
  saludoAvatarLetra: { fontSize: 20, fontWeight: 'bold', color: '#000' },
  saludoTexto: { fontSize: 18, color: '#333' },
  saludoNombre: { fontWeight: 'bold', color: '#000' },
  saludoSub: { fontSize: 13, color: '#888', marginTop: 2 },

  // Inputs editables
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#E2E8F0',
  },
  inputDot: { width: 20, alignItems: 'center' },
  dotGreen: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#16A34A' },
  dotRed: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#DC2626' },
  inputField: { flex: 1, fontSize: 14, color: '#1E293B' },
  inputAction: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
  },
  inputActionIcon: { fontSize: 18 },

  // Tarifa
  tarifaCard: {
    backgroundColor: '#FFFDE7', borderRadius: 14, padding: 16,
    marginBottom: 14, borderLeftWidth: 4, borderLeftColor: '#FFC107',
  },
  tarifaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  tarifaTitulo: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  tarifaCargando: { color: '#999', fontSize: 13, marginLeft: 8 },
  tarifaPrecio: { fontSize: 26, fontWeight: 'bold', color: '#2E7D32', marginBottom: 2 },
  tarifaRango: { fontSize: 13, color: '#888', marginBottom: 8 },
  tarifaDetalles: { flexDirection: 'row', gap: 16 },
  tarifaDetalle: { fontSize: 13, color: '#666' },
  nocturnoBadge: { backgroundColor: '#311B92', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  nocturnoTexto: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  // Secciones
  labelSeccion: { fontWeight: 'bold', marginBottom: 10, fontSize: 14, color: '#333' },

  // Pago
  pagoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pagoBtn: {
    borderWidth: 2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16,
    alignItems: 'center', backgroundColor: '#fff',
  },
  pagoTexto: { fontWeight: 'bold', fontSize: 13 },

  // Requisitos chips
  requisitosGrid: { gap: 10, marginBottom: 16 },
  requisitoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#FFFDE7', borderRadius: 14, padding: 16,
    borderWidth: 2, borderColor: '#FFC107',
  },
  requisitoBtnActivo: {
    backgroundColor: '#FFFDE7', borderColor: '#FFC107',
  },
  requisitoIcon: { fontSize: 26 },
  requisitoLabel: { flex: 1, fontSize: 16, fontWeight: 'bold', color: '#333' },
  requisitoCheck: { fontSize: 22, color: '#16A34A', fontWeight: 'bold' },

  // Botón solicitar
  btnSolicitar: {
    backgroundColor: '#FFC107', borderRadius: 14,
    padding: 16, alignItems: 'center', elevation: 4,
    shadowColor: '#FFC107', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8,
  },
  btnSolicitarTexto: { fontWeight: 'bold', fontSize: 17, color: '#000' },

  // ═══ ESTILOS SERVICIO ACTIVO (se mantienen) ═══
  container: { flexGrow: 1, backgroundColor: '#f5f5f5', padding: 16 },
  titulo: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 2 },
  subtitulo: { textAlign: 'center', color: '#666', marginBottom: 12 },

  tarifaCardActivo: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 12, elevation: 2, alignItems: 'center',
    borderLeftWidth: 4, borderLeftColor: '#2E7D32',
  },
  tarifaPrecioActivo: { fontSize: 24, fontWeight: 'bold', color: '#2E7D32', marginVertical: 4 },

  estadoCard: {
    borderRadius: 16, padding: 20, alignItems: 'center',
    marginBottom: 16, elevation: 2,
  },
  estadoIcon: { fontSize: 36, marginBottom: 6 },
  estadoLabel: { fontSize: 18, fontWeight: 'bold' },

  seccion: {
    backgroundColor: '#fff', borderRadius: 14,
    padding: 16, marginBottom: 12, elevation: 2,
  },
  seccionTitulo: { fontSize: 15, fontWeight: 'bold', marginBottom: 12, color: '#333' },
  datoFila: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  datoLabel: { fontSize: 13, color: '#888' },
  datoValor: { fontSize: 14, fontWeight: '600', color: '#222', textAlign: 'right', maxWidth: '60%' },
  separador: { height: 1, backgroundColor: '#f0f0f0' },
  placa: { fontSize: 16, color: '#FFC107', fontWeight: 'bold', letterSpacing: 2 },
  telefonoLink: { fontSize: 14, color: '#1565C0', fontWeight: 'bold' },
  pagoBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  pagoBadgeTexto: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  rutaFila: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  rutaPunto: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  rutaLinea: { width: 2, height: 20, backgroundColor: '#ddd', marginLeft: 5, marginVertical: 2 },
  rutaEtiqueta: { fontSize: 11, color: '#aaa', marginBottom: 2 },
  rutaTexto: { fontSize: 14, fontWeight: '600', color: '#333' },
  esperandoCard: { alignItems: 'center', paddingVertical: 20 },
  esperandoTexto: { color: '#888', fontSize: 14, textAlign: 'center' },
  btnCalificar: {
    borderWidth: 2, borderColor: '#FFC107', borderRadius: 10,
    padding: 14, alignItems: 'center', marginBottom: 12, backgroundColor: '#fff',
  },
  btnCalificarTexto: { color: '#FFC107', fontWeight: 'bold', fontSize: 15 },
  calificacionMostrada: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14,
    alignItems: 'center', marginBottom: 12, elevation: 1,
  },
  calificacionPuntuacion: { fontSize: 28, color: '#FFC107', fontWeight: 'bold' },
  calificacionComentario: { fontSize: 13, color: '#888', fontStyle: 'italic', marginTop: 4 },
  acciones: { marginBottom: 24 },
  chatSOSRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  btnChat: {
    flex: 1, backgroundColor: '#1565C0', borderRadius: 10,
    padding: 14, alignItems: 'center', elevation: 2,
  },
  btnChatTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnCancelar: {
    borderWidth: 2, borderColor: '#E53935', borderRadius: 10,
    padding: 14, alignItems: 'center',
  },
  btnCancelarTexto: { color: '#E53935', fontWeight: 'bold', fontSize: 15 },
  btnNuevo: {
    backgroundColor: '#FFC107', borderRadius: 12,
    padding: 18, alignItems: 'center', elevation: 4, marginTop: 8,
  },
  btnNuevoTexto: { fontWeight: 'bold', fontSize: 18, color: '#000' },
});
