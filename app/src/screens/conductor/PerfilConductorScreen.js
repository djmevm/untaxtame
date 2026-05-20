import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  ScrollView, Alert, TextInput, ActivityIndicator, Switch, Image, Vibration, Modal,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Audio } from 'expo-av';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';
import MensajesAdmin from '../../components/MensajesAdmin';

const ESTADO_CONFIG = {
  pendiente: { color: '#FFC107', textColor: '#000', icon: '⏳', titulo: 'En revisión', mensaje: 'Tus documentos están siendo verificados.' },
  aprobado: { color: '#2E7D32', textColor: '#fff', icon: '✅', titulo: 'Aprobado', mensaje: 'Tu cuenta está activa.' },
  rechazado: { color: '#E53935', textColor: '#fff', icon: '❌', titulo: 'Rechazado', mensaje: 'Tu postulación fue rechazada. Revisa tus documentos y vuelve a postularte.' },
};

const DOCUMENTOS = [
  { key: 'cedulaFrente', label: 'Cédula (frente)' },
  { key: 'cedulaReverso', label: 'Cédula (reverso)' },
  { key: 'licencia', label: 'Licencia de conducción' },
  { key: 'tarjetaPropiedad', label: 'Tarjeta de propiedad' },
  { key: 'tarjetaOperacion', label: 'Tarjeta de operación' },
];

const DOCS_CON_VENCIMIENTO = [
  { key: 'licencia', label: 'Licencia de conducción', icon: '📄' },
  { key: 'soat', label: 'SOAT', icon: '🛡️' },
  { key: 'tecnicomecanica', label: 'Revisión técnico-mecánica', icon: '🔧' },
  { key: 'tarjetaOperacion', label: 'Tarjeta de operación', icon: '🚕' },
];

function diasRestantes(fechaStr) {
  if (!fechaStr) return null;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  // Parsear fecha como local (no UTC) agregando T12:00:00
  const partes = fechaStr.split('-');
  const fecha = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
  fecha.setHours(0, 0, 0, 0);
  return Math.ceil((fecha - hoy) / (1000 * 60 * 60 * 24));
}

function colorPorDias(dias) {
  if (dias === null) return '#999';
  if (dias < 0) return '#B71C1C';
  if (dias <= 15) return '#E53935';
  if (dias <= 30) return '#FF9800';
  if (dias <= 60) return '#FFC107';
  return '#2E7D32';
}

function textoPorDias(dias) {
  if (dias === null) return 'Sin fecha';
  if (dias < 0) return `VENCIDO hace ${Math.abs(dias)} días`;
  if (dias === 0) return '¡VENCE HOY!';
  if (dias === 1) return 'Vence MAÑANA';
  return `Vence en ${dias} días`;
}

function SelectorFecha({ visible, onClose, onSelect, fechaActual }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(fechaActual ? new Date(fechaActual).getFullYear() : hoy.getFullYear());
  const [mes, setMes] = useState(fechaActual ? new Date(fechaActual).getMonth() : hoy.getMonth());
  const [dia, setDia] = useState(fechaActual ? new Date(fechaActual).getDate() : hoy.getDate());
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  useEffect(() => {
    if (visible && fechaActual) {
      const f = new Date(fechaActual);
      setAnio(f.getFullYear()); setMes(f.getMonth()); setDia(f.getDate());
    }
  }, [visible, fechaActual]);

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={sel.overlay}>
        <View style={sel.card}>
          <Text style={sel.titulo}>Fecha de vencimiento</Text>
          <Text style={sel.label}>Año</Text>
          <View style={sel.fila}>
            <TouchableOpacity onPress={() => setAnio(a => a - 1)} style={sel.btnF}><Text style={sel.flecha}>◀</Text></TouchableOpacity>
            <Text style={sel.valor}>{anio}</Text>
            <TouchableOpacity onPress={() => setAnio(a => a + 1)} style={sel.btnF}><Text style={sel.flecha}>▶</Text></TouchableOpacity>
          </View>
          <Text style={sel.label}>Mes</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {meses.map((m, i) => (
                <TouchableOpacity key={i} onPress={() => { setMes(i); if (dia > new Date(anio, i+1, 0).getDate()) setDia(1); }}
                  style={[sel.mesBtn, mes === i && sel.mesBtnAct]}>
                  <Text style={[sel.mesTxt, mes === i && { color: '#fff' }]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <Text style={sel.label}>Día</Text>
          <View style={sel.fila}>
            <TouchableOpacity onPress={() => setDia(d => Math.max(1, d - 1))} style={sel.btnF}><Text style={sel.flecha}>◀</Text></TouchableOpacity>
            <Text style={sel.valor}>{dia}</Text>
            <TouchableOpacity onPress={() => setDia(d => Math.min(diasEnMes, d + 1))} style={sel.btnF}><Text style={sel.flecha}>▶</Text></TouchableOpacity>
          </View>
          <Text style={sel.preview}>{dia}/{mes + 1}/{anio}</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 16 }}>
            <TouchableOpacity style={[sel.btnAcc, { backgroundColor: '#eee' }]} onPress={onClose}>
              <Text style={{ fontWeight: 'bold', color: '#666' }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[sel.btnAcc, { backgroundColor: '#FFC107', flex: 1 }]}
              onPress={() => { onSelect(`${anio}-${String(mes+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`); onClose(); }}>
              <Text style={{ fontWeight: 'bold' }}>Guardar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const sel = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24 },
  titulo: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 20, color: '#333' },
  label: { fontSize: 13, color: '#888', marginBottom: 6, fontWeight: '600' },
  fila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 16, gap: 20 },
  btnF: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' },
  flecha: { fontSize: 18, color: '#333' },
  valor: { fontSize: 28, fontWeight: 'bold', color: '#222', minWidth: 60, textAlign: 'center' },
  mesBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0' },
  mesBtnAct: { backgroundColor: '#FFC107' },
  mesTxt: { fontWeight: '600', color: '#555' },
  preview: { textAlign: 'center', fontSize: 16, color: '#666', marginTop: 8 },
  btnAcc: { borderRadius: 12, padding: 14, alignItems: 'center' },
});

export default function PerfilConductorScreen() {
  const { perfil, setPerfil, cerrarSesion } = useAuth();
  const [editando, setEditando] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [form, setForm] = useState({ nombre: perfil?.nombre||'', telefono: perfil?.telefono||'', cedula: perfil?.cedula||'', placa: perfil?.placa||'' });
  const estado = ESTADO_CONFIG[perfil?.estadoVerificacion] || ESTADO_CONFIG.pendiente;
  const [enServicio, setEnServicio] = useState(!!perfil?.enServicio);
  const [repostulandose, setRepostulandose] = useState(false);
  const ubicacionInterval = useRef(null);
  const [vencimientos, setVencimientos] = useState(perfil?.vencimientoDocumentos || {});
  const [selectorVisible, setSelectorVisible] = useState(false);
  const [docSeleccionado, setDocSeleccionado] = useState(null);
  const [guardandoVenc, setGuardandoVenc] = useState(false);
  const [mostrarRadio, setMostrarRadio] = useState(false);
  const alertasMostradas = useRef({});

  // Verificar vencimientos al cargar y cada 60s
  useEffect(() => {
    const verificar = async () => {
      const venc = perfil?.vencimientoDocumentos || vencimientos;
      if (!venc || Object.keys(venc).length === 0) return;
      const alertas = [];
      for (const doc of DOCS_CON_VENCIMIENTO) {
        const fecha = venc[doc.key];
        if (!fecha) continue;
        const dias = diasRestantes(fecha);
        const aKey = `${doc.key}_${fecha}`;
        if (dias !== null && dias <= 15 && !alertasMostradas.current[aKey]) {
          alertasMostradas.current[aKey] = true;
          alertas.push({ ...doc, dias, fecha });
        }
      }
      if (alertas.length > 0) {
        try {
          await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, shouldDuckAndroid: true, playThroughEarpieceAndroid: false });
          const { sound } = await Audio.Sound.createAsync({ uri: 'https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg' }, { shouldPlay: true, volume: 1.0 });
          setTimeout(async () => { try { await sound.stopAsync(); await sound.unloadAsync(); } catch {} }, 2500);
        } catch {}
        Vibration.vibrate([0, 500, 200, 500, 200, 800]);
        const msgs = alertas.map(a => {
          if (a.dias < 0) return `🔴 ${a.icon} ${a.label}: VENCIDO hace ${Math.abs(a.dias)} días`;
          if (a.dias === 0) return `🔴 ${a.icon} ${a.label}: ¡VENCE HOY!`;
          return `⚠️ ${a.icon} ${a.label}: Vence en ${a.dias} días`;
        });
        Alert.alert('🚨 ALERTA DE DOCUMENTOS', msgs.join('\n\n') + '\n\nActualiza tus documentos para evitar sanciones.', [{ text: 'Entendido' }]);
      }
    };
    verificar();
    const intervalo = setInterval(verificar, 60000);
    return () => clearInterval(intervalo);
  }, [perfil?.vencimientoDocumentos, vencimientos]);

  const guardarVencimiento = async (key, fecha) => {
    const nuevos = { ...vencimientos, [key]: fecha };
    setVencimientos(nuevos);
    setGuardandoVenc(true);
    try {
      await api.put(`/auth/perfil/${perfil?.uid}`, { vencimientoDocumentos: nuevos });
      if (setPerfil) setPerfil(prev => ({ ...prev, vencimientoDocumentos: nuevos }));
      delete alertasMostradas.current[`${key}_${fecha}`];
      Alert.alert('✅', 'Fecha de vencimiento guardada');
    } catch { Alert.alert('Error', 'No se pudo guardar la fecha'); }
    finally { setGuardandoVenc(false); }
  };

  useEffect(() => {
    const enviarUbicacion = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await api.put(`/users/conductor/${perfil?.uid}/ubicacion`, { lat: loc.coords.latitude, lng: loc.coords.longitude, enServicio: true });
      } catch {}
    };
    enviarUbicacion();
    ubicacionInterval.current = setInterval(enviarUbicacion, 10000);
    return () => { if (ubicacionInterval.current) clearInterval(ubicacionInterval.current); };
  }, [perfil?.uid]);

  const toggleEnServicio = async () => {
    const nuevo = !enServicio;
    try {
      if (nuevo) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return Alert.alert('Permiso requerido', 'Necesitamos tu ubicación');
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        await api.put(`/users/conductor/${perfil?.uid}/ubicacion`, { lat: loc.coords.latitude, lng: loc.coords.longitude, enServicio: true });
      } else {
        await api.put(`/users/conductor/${perfil?.uid}/ubicacion`, { lat: 0, lng: 0, enServicio: false });
        await api.put(`/users/conductor/${perfil?.uid}/disponibilidad`, { disponible: false });
      }
      setEnServicio(nuevo);
      if (setPerfil) setPerfil(prev => ({ ...prev, enServicio: nuevo, disponible: nuevo }));
    } catch { Alert.alert('Error', 'No se pudo cambiar el estado'); }
  };

  const handleCerrarSesion = () => { Alert.alert('Cerrar sesión', '¿Estás seguro?', [{ text: 'Cancelar', style: 'cancel' }, { text: 'Salir', style: 'destructive', onPress: cerrarSesion }]); };

  const repostularse = () => {
    Alert.alert('Volver a postularse', 'Tus documentos serán enviados nuevamente para revisión. ¿Deseas continuar?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, re-postularme', onPress: async () => {
        setRepostulandose(true);
        try {
          const res = await api.put(`/users/conductor/${perfil?.uid}/repostularse`);
          if (setPerfil) setPerfil(prev => ({ ...prev, estadoVerificacion: 'pendiente' }));
          Alert.alert('✅ ¡Listo!', res.data.message || 'Tu postulación fue enviada nuevamente.');
        } catch (e) { Alert.alert('Error', e.response?.data?.error || 'No se pudo enviar'); }
        finally { setRepostulandose(false); }
      }},
    ]);
  };

  const guardarPerfil = async () => {
    if (!form.nombre || !form.telefono) return Alert.alert('Error', 'Nombre y teléfono son obligatorios');
    setActualizando(true);
    try {
      await api.put(`/auth/perfil/${perfil?.uid}`, form);
      if (setPerfil) setPerfil(prev => ({ ...prev, ...form }));
      setEditando(false);
      Alert.alert('¡Listo!', 'Perfil actualizado');
    } catch { Alert.alert('Error', 'No se pudo actualizar'); }
    finally { setActualizando(false); }
  };

  const seleccionarImagen = (callback) => {
    Alert.alert('Seleccionar imagen', '¿Cómo quieres agregar la foto?', [
      { text: 'Cámara', onPress: async () => {
        try {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') return Alert.alert('Permiso requerido', 'Necesitamos acceso a tu cámara');
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.9 });
          if (!result.canceled && result.assets?.[0]?.uri) callback(result.assets[0].uri);
        } catch { Alert.alert('Error', 'No se pudo abrir la cámara'); }
      }},
      { text: 'Galería', onPress: async () => {
        try {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') return Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería');
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.9 });
          if (!result.canceled && result.assets?.[0]?.uri) callback(result.assets[0].uri);
        } catch { Alert.alert('Error', 'No se pudo abrir la galería'); }
      }},
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const subirImagen = async (uri, campo) => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const token = await AsyncStorage.getItem('authToken');
      const fd = new FormData();
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      fd.append('imagen', { uri, name: `${campo}.${ext}`, type: `image/${ext === 'png' ? 'png' : 'jpeg'}` });
      const response = await fetch(`${api.defaults.baseURL}/upload/imagen`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
      const data = await response.json();
      if (response.ok && data.url) {
        // Si la URL ya es completa (Firebase Storage), usarla directamente
        if (data.url.startsWith('http')) return data.url;
        // Si es relativa, agregar base URL
        return `${api.defaults.baseURL.replace('/api', '')}${data.url}`;
      }
    } catch {}
    return uri;
  };

  const cambiarFotoPerfil = () => {
    seleccionarImagen(async (uri) => {
      if (setPerfil) setPerfil(prev => ({ ...prev, fotoPerfil: uri }));
      try {
        const url = await subirImagen(uri, 'perfil');
        await api.put(`/auth/perfil/${perfil?.uid}`, { fotoPerfil: url });
        if (setPerfil) setPerfil(prev => ({ ...prev, fotoPerfil: url }));
        Alert.alert('✅', 'Foto actualizada');
      } catch {}
    });
  };

  const cambiarDocumento = (key, label) => {
    seleccionarImagen(async (uri) => {
      if (setPerfil) setPerfil(prev => ({ ...prev, documentos: { ...(perfil?.documentos || {}), [key]: uri } }));
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const token = await AsyncStorage.getItem('authToken');
        const fd = new FormData();
        const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
        fd.append(key, { uri, name: `${key}.${ext}`, type: `image/${ext === 'png' ? 'png' : 'jpeg'}` });
        const response = await fetch(`${api.defaults.baseURL}/upload/documentos`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd });
        const data = await response.json();
        if (response.ok && data.documentos?.[key]) {
          const url = `http://192.168.0.101:3000${data.documentos[key]}`;
          if (setPerfil) setPerfil(prev => ({ ...prev, documentos: { ...(prev?.documentos || {}), [key]: url } }));
        }
        Alert.alert('✅', `${label} actualizado`);
      } catch { Alert.alert('✅', `${label} guardado localmente`); }
    });
  };

  if (!perfil) return <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" color="#FFC107" /></View>;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SelectorFecha visible={selectorVisible} fechaActual={docSeleccionado ? vencimientos[docSeleccionado] : null}
        onClose={() => setSelectorVisible(false)} onSelect={(fecha) => { if (docSeleccionado) guardarVencimiento(docSeleccionado, fecha); }} />

      <TouchableOpacity style={styles.avatarWrapper} onPress={cambiarFotoPerfil}>
        {perfil.fotoPerfil ? <Image source={{ uri: perfil.fotoPerfil }} style={styles.avatarImagen} />
          : <View style={styles.avatarCirculo}><Text style={styles.avatarLetra}>{perfil.nombre?.charAt(0)?.toUpperCase() || '?'}</Text></View>}
        <View style={styles.avatarBadge}><Text style={{ fontSize: 13 }}>✏️</Text></View>
      </TouchableOpacity>
      <Text style={styles.fotoHint}>Toca para cambiar foto</Text>
      <Text style={styles.nombre}>{perfil.nombre}</Text>
      <Text style={styles.rolTag}>🚕 Conductor</Text>

      <View style={[styles.estadoCard, { backgroundColor: estado.color }]}>
        <Text style={{ fontSize: 36, marginBottom: 8 }}>{estado.icon}</Text>
        <Text style={{ fontSize: 20, fontWeight: 'bold', color: estado.textColor, marginBottom: 6 }}>{estado.titulo}</Text>
        <Text style={{ fontSize: 14, color: estado.textColor, textAlign: 'center' }}>{estado.mensaje}</Text>
      </View>

      {perfil.estadoVerificacion === 'rechazado' && (
        <TouchableOpacity style={styles.btnRepostularse} onPress={repostularse} disabled={repostulandose}>
          {repostulandose ? <ActivityIndicator color="#fff" /> : (<>
            <Text style={styles.btnRepostularseTexto}>🔄 Volver a postularse</Text>
            <Text style={styles.btnRepostularseHint}>Revisa tus documentos antes de enviar</Text>
          </>)}
        </TouchableOpacity>
      )}

      {/* ═══ MENSAJES DEL ADMINISTRADOR ═══ */}
      <MensajesAdmin uid={perfil?.uid} />

      {/* ═══ COMANDOS DE RADIO ═══ */}
      <View style={styles.seccion}>
        <TouchableOpacity onPress={() => setMostrarRadio(!mostrarRadio)}>
          <Text style={styles.seccionTitulo}>📻 Comandos de Radio {mostrarRadio ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Di estos comandos por voz para comunicarte con el panel</Text>

        {mostrarRadio && (
          <View style={{ gap: 8 }}>
            <View style={styles.radioItem}>
              <Text style={styles.radioCode}>H1</Text>
              <Text style={styles.radioDesc}>🔫 Atraco / Robo (alerta silenciosa)</Text>
            </View>
            <View style={[styles.radioItem, { borderLeftColor: '#880E4F' }]}>
              <Text style={styles.radioCode}>H2</Text>
              <Text style={styles.radioDesc}>🚨 Secuestro / Muerto en la vía (alerta silenciosa)</Text>
            </View>
            <Text style={{ fontSize: 11, color: '#888', marginTop: 8, fontStyle: 'italic' }}>
              Activa el micrófono (botón VOZ) cuando te sientas inseguro. Di el código en voz baja.
            </Text>
          </View>
        )}
      </View>

      {/* ═══ VENCIMIENTO DE DOCUMENTOS ═══ */}
      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>📅 Vencimiento de Documentos</Text>
        <Text style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Registra las fechas para recibir alertas automáticas</Text>
        {DOCS_CON_VENCIMIENTO.map(({ key, label, icon }) => {
          const fecha = vencimientos[key];
          const dias = diasRestantes(fecha);
          const color = colorPorDias(dias);
          const texto = textoPorDias(dias);
          return (
            <View key={key} style={[styles.vencCard, { borderLeftColor: color }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <Text style={{ fontSize: 24, marginRight: 12 }}>{icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.vencLabel}>{label}</Text>
                  {fecha ? (<>
                    <Text style={[styles.vencEstado, { color }]}>{texto}</Text>
                    <Text style={styles.vencFecha}>Vence: {new Date(fecha + 'T12:00:00').toLocaleDateString('es-CO')}</Text>
                  </>) : <Text style={styles.vencSinFecha}>Sin fecha registrada</Text>}
                </View>
              </View>
              <TouchableOpacity style={[styles.vencBtn, { borderColor: color }]}
                onPress={() => { setDocSeleccionado(key); setSelectorVisible(true); }}>
                <Text style={[styles.vencBtnTxt, { color }]}>{fecha ? '✏️' : '📅'}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        {guardandoVenc && <View style={{ alignItems: 'center', marginTop: 8 }}><ActivityIndicator size="small" color="#FFC107" /><Text style={{ fontSize: 12, color: '#888', marginTop: 4 }}>Guardando...</Text></View>}
      </View>

      {perfil.reputacion && (
        <View style={styles.reputacionCard}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 12 }}>⭐ Mi Reputación</Text>
          <View style={{ alignItems: 'center', marginBottom: 12 }}>
            <Text style={{ fontSize: 42, fontWeight: 'bold', color: perfil.reputacion.porcentaje >= 70 ? '#2E7D32' : perfil.reputacion.porcentaje >= 50 ? '#FFC107' : '#E53935' }}>{perfil.reputacion.porcentaje}%</Text>
            <Text style={{ fontSize: 15, color: '#666' }}>Promedio: {perfil.reputacion.promedio}/10</Text>
          </View>
          <View style={styles.barraReputacion}><View style={[styles.barraLlena, { width: `${perfil.reputacion.porcentaje}%`, backgroundColor: perfil.reputacion.porcentaje >= 70 ? '#2E7D32' : perfil.reputacion.porcentaje >= 50 ? '#FFC107' : '#E53935' }]} /></View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={{ fontSize: 12, color: '#888' }}>📊 {perfil.reputacion.totalCalificaciones} calificaciones</Text>
            <Text style={{ fontSize: 12, color: '#888' }}>🚕 {perfil.reputacion.totalServicios} servicios</Text>
          </View>
        </View>
      )}

      {perfil.estadoVerificacion === 'aprobado' && (
        <View style={[styles.disponibilidadCard, { borderLeftWidth: 5, borderLeftColor: enServicio ? '#2E7D32' : '#E53935' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 17, fontWeight: 'bold', color: enServicio ? '#2E7D32' : '#E53935' }}>{enServicio ? '🟢 EN SERVICIO' : '🔴 FUERA DE SERVICIO'}</Text>
            <Text style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{enServicio ? 'Tu ubicación se comparte con clientes' : 'No estás recibiendo solicitudes'}</Text>
          </View>
          <Switch value={enServicio} onValueChange={toggleEnServicio} trackColor={{ false: '#ffcdd2', true: '#A5D6A7' }} thumbColor={enServicio ? '#2E7D32' : '#E53935'} />
        </View>
      )}

      {!editando ? (
        <View style={styles.seccion}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 }}>
            <Text style={styles.seccionTitulo}>Mis datos</Text>
            <TouchableOpacity onPress={() => setEditando(true)}><Text style={{ color: '#1565C0', fontWeight: '600' }}>✏️ Editar</Text></TouchableOpacity>
          </View>
          <View style={styles.datoFila}><Text style={styles.datoLabel}>Nombre</Text><Text style={styles.datoValor}>{perfil.nombre || '—'}</Text></View>
          <View style={styles.separador} />
          <View style={styles.datoFila}><Text style={styles.datoLabel}>Cédula</Text><Text style={styles.datoValor}>{perfil.cedula || '—'}</Text></View>
          <View style={styles.separador} />
          <View style={styles.datoFila}><Text style={styles.datoLabel}>Celular</Text><Text style={styles.datoValor}>{perfil.telefono || '—'}</Text></View>
          <View style={styles.separador} />
          <View style={styles.datoFila}><Text style={styles.datoLabel}>Placa</Text><Text style={[styles.datoValor, { color: '#FFC107', fontWeight: 'bold', letterSpacing: 2 }]}>{perfil.placa || '—'}</Text></View>
        </View>
      ) : (
        <View style={styles.seccion}>
          <Text style={styles.seccionTitulo}>Editar datos</Text>
          <Text style={styles.inputLabel}>Nombre</Text>
          <TextInput style={styles.input} value={form.nombre} onChangeText={v => setForm(p => ({ ...p, nombre: v }))} />
          <Text style={styles.inputLabel}>Cédula</Text>
          <TextInput style={styles.input} value={form.cedula} onChangeText={v => setForm(p => ({ ...p, cedula: v }))} keyboardType="numeric" />
          <Text style={styles.inputLabel}>Celular</Text>
          <TextInput style={styles.input} value={form.telefono} onChangeText={v => setForm(p => ({ ...p, telefono: v }))} keyboardType="phone-pad" />
          <Text style={styles.inputLabel}>Placa</Text>
          <TextInput style={styles.input} value={form.placa} onChangeText={v => setForm(p => ({ ...p, placa: v.toUpperCase() }))} />
          <View style={{ marginTop: 16, gap: 10 }}>
            <TouchableOpacity style={styles.btnGuardar} onPress={guardarPerfil} disabled={actualizando}>
              {actualizando ? <ActivityIndicator color="#000" /> : <Text style={{ fontWeight: 'bold', fontSize: 15 }}>Guardar</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCancelar} onPress={() => setEditando(false)}><Text style={{ color: '#666', fontWeight: 'bold' }}>Cancelar</Text></TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.seccion}>
        <Text style={styles.seccionTitulo}>Documentos</Text>
        {DOCUMENTOS.map(({ key, label }) => {
          const uri = perfil.documentos?.[key];
          return (
            <View key={key} style={styles.docItem}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#333' }}>{label}</Text>
                <TouchableOpacity onPress={() => cambiarDocumento(key, label)}><Text style={{ color: '#1565C0', fontWeight: '600', fontSize: 13 }}>{uri ? '📷 Cambiar' : '📷 Subir'}</Text></TouchableOpacity>
              </View>
              {uri ? <Image source={{ uri }} style={styles.docImagen} /> : <View style={styles.docVacio}><Text style={{ color: '#999' }}>⚠️ Sin imagen — toca "Subir"</Text></View>}
            </View>
          );
        })}
      </View>

      <TouchableOpacity style={styles.btnSalir} onPress={handleCerrarSesion}><Text style={styles.btnSalirTexto}>Cerrar sesión</Text></TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, backgroundColor: '#f5f5f5', padding: 24, alignItems: 'center' },
  avatarWrapper: { position: 'relative', marginTop: 16, marginBottom: 4 },
  avatarImagen: { width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#FFC107' },
  avatarCirculo: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#FFC107', alignItems: 'center', justifyContent: 'center', elevation: 4 },
  avatarLetra: { fontSize: 40, fontWeight: 'bold', color: '#000' },
  avatarBadge: { position: 'absolute', bottom: 2, right: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFC107', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  fotoHint: { fontSize: 12, color: '#aaa', marginBottom: 8 },
  nombre: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 4 },
  rolTag: { fontSize: 14, color: '#666', marginBottom: 20 },
  estadoCard: { width: '100%', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 16, elevation: 2 },
  reputacionCard: { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, elevation: 2 },
  barraReputacion: { height: 10, backgroundColor: '#eee', borderRadius: 5, overflow: 'hidden' },
  barraLlena: { height: 10, borderRadius: 5 },
  disponibilidadCard: { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, elevation: 2, flexDirection: 'row', alignItems: 'center' },
  seccion: { width: '100%', backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 16, elevation: 2 },
  seccionTitulo: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 14 },
  datoFila: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  datoLabel: { fontSize: 14, color: '#888' },
  datoValor: { fontSize: 14, fontWeight: '600', color: '#222' },
  separador: { height: 1, backgroundColor: '#f0f0f0' },
  inputLabel: { fontSize: 12, color: '#888', marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#fafafa' },
  btnGuardar: { backgroundColor: '#FFC107', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnCancelar: { borderWidth: 2, borderColor: '#999', borderRadius: 10, padding: 12, alignItems: 'center' },
  docItem: { marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 12 },
  docImagen: { width: '100%', height: 200, borderRadius: 10, resizeMode: 'contain', backgroundColor: '#f0f0f0' },
  docVacio: { height: 80, backgroundColor: '#f9f9f9', borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed' },
  btnSalir: { width: '100%', borderWidth: 2, borderColor: '#E53935', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 8, marginBottom: 24 },
  btnSalirTexto: { color: '#E53935', fontWeight: 'bold', fontSize: 16 },
  btnRepostularse: { width: '100%', backgroundColor: '#1565C0', borderRadius: 16, padding: 18, alignItems: 'center', marginBottom: 16, elevation: 4, shadowColor: '#1565C0', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  btnRepostularseTexto: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  btnRepostularseHint: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },
  vencCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fafafa', borderRadius: 12, padding: 14, marginBottom: 10, borderLeftWidth: 4, elevation: 1 },
  vencLabel: { fontSize: 14, fontWeight: '600', color: '#333' },
  vencEstado: { fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  vencFecha: { fontSize: 11, color: '#aaa', marginTop: 2 },
  vencSinFecha: { fontSize: 12, color: '#bbb', fontStyle: 'italic', marginTop: 2 },
  vencBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginLeft: 10 },
  vencBtnTxt: { fontSize: 18 },
  radioItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, borderLeftWidth: 4, borderLeftColor: '#E53935' },
  radioCode: { fontSize: 16, fontWeight: 'bold', color: '#333', minWidth: 50 },
  radioDesc: { fontSize: 13, color: '#555', flex: 1 },
});
