import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, TextInput, ActivityIndicator, Switch, Image, Vibration,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';

const ESTADO_CONFIG = {
  pendiente: { color: '#FFC107', textColor: '#000', icon: '⏳', titulo: 'En revisión', mensaje: 'Tus documentos están siendo verificados.' },
  aprobado: { color: '#2E7D32', textColor: '#fff', icon: '✅', titulo: 'Aprobado', mensaje: 'Tu cuenta está activa.' },
  rechazado: { color: '#E53935', textColor: '#fff', icon: '❌', titulo: 'Rechazado', mensaje: 'Tu postulación fue rechazada.' },
};

const DOCUMENTOS = [
  { key: 'cedulaFrente', label: 'Cédula (frente)' },
  { key: 'cedulaReverso', label: 'Cédula (reverso)' },
  { key: 'licencia', label: 'Licencia de conducción' },
  { key: 'tarjetaPropiedad', label: 'Tarjeta de propiedad' },
  { key: 'tarjetaOperacion', label: 'Tarjeta de operación' },
];

const SERVICIOS_OPCIONES = [
  { key: 'maletas', icon: '🧳', label: 'Maletas extras' },
  { key: 'discapacitado', icon: '♿', label: 'Pasajero discapacitado' },
  { key: 'bicicleta', icon: '🚲', label: 'Soporte bicicleta' },
  { key: 'aireAcondicionado', icon: '❄️', label: 'Aire acondicionado' },
  { key: 'mascotas', icon: '🐾', label: 'Mascotas permitidas' },
];

export default function PerfilConductorScreen() {
  const { perfil, setPerfil, cerrarSesion } = useAuth();
  const [editando, setEditando] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const [enServicio, setEnServicio] = useState(!!perfil?.enServicio);
  const [serviciosOfrecidos, setServiciosOfrecidos] = useState(perfil?.serviciosOfrecidos || []);
  const [mostrarChat, setMostrarChat] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const [textoChat, setTextoChat] = useState('');
  const [enviandoChat, setEnviandoChat] = useState(false);
  const [form, setForm] = useState({
    nombre: perfil?.nombre || '',
    telefono: perfil?.telefono || '',
    cedula: perfil?.cedula || '',
    placa: perfil?.placa || '',
  });

  const estado = ESTADO_CONFIG[perfil?.estadoVerificacion] || ESTADO_CONFIG.pendiente;

  // Chat polling
  useEffect(() => {
    if (!perfil?.uid || !mostrarChat) return;
    cargarChat();
    const intervalo = setInterval(cargarChat, 8000);
    return () => clearInterval(intervalo);
  }, [perfil?.uid, mostrarChat]);

  const cargarChat = async () => {
    try {
      const res = await api.get(`/chat/directo/${perfil?.uid}/mensajes`);
      setMensajes(res.data || []);
    } catch {}
  };

  const enviarChat = async () => {
    if (!textoChat.trim() || enviandoChat) return;
    setEnviandoChat(true);
    try {
      await api.post(`/chat/directo/${perfil?.uid}/mensaje`, { texto: textoChat.trim() });
      setTextoChat('');
      cargarChat();
    } catch {}
    finally { setEnviandoChat(false); }
  };

  const handleCerrarSesion = () => {
    Alert.alert('Cerrar sesión', '¿Estás seguro?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Salir', style: 'destructive', onPress: cerrarSesion },
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

  const toggleEnServicio = async () => {
    const nuevo = !enServicio;
    try {
      await api.put(`/users/conductor/${perfil?.uid}/ubicacion`, { lat: 0, lng: 0, enServicio: nuevo });
      setEnServicio(nuevo);
      if (setPerfil) setPerfil(prev => ({ ...prev, enServicio: nuevo, disponible: nuevo }));
    } catch { Alert.alert('Error', 'No se pudo cambiar el estado'); }
  };

  const toggleServicio = async (key) => {
    const nuevos = serviciosOfrecidos.includes(key)
      ? serviciosOfrecidos.filter(s => s !== key)
      : [...serviciosOfrecidos, key];
    setServiciosOfrecidos(nuevos);
    try {
      await api.put(`/auth/perfil/${perfil?.uid}`, { serviciosOfrecidos: nuevos });
      if (setPerfil) setPerfil(prev => ({ ...prev, serviciosOfrecidos: nuevos }));
    } catch {}
  };

  const seleccionarFoto = async (campo) => {
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permiso requerido');
      const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.9 });
      if (result.canceled) return;
      const uri = result.assets[0].uri;
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const token = await AsyncStorage.getItem('authToken');
      const fd = new FormData();
      const ext = uri.split('.').pop()?.toLowerCase() || 'jpg';
      fd.append('imagen', { uri, name: `${campo}.${ext}`, type: `image/${ext === 'png' ? 'png' : 'jpeg'}` });
      const response = await fetch(`${api.defaults.baseURL}/upload/imagen`, {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }, body: fd,
      });
      const data = await response.json();
      if (response.ok && data.url) {
        const url = data.url.startsWith('http') ? data.url : `${api.defaults.baseURL.replace('/api', '')}${data.url}`;
        const updateField = campo === 'vehiculo' ? 'fotoVehiculo' : 'fotoPerfil';
        await api.put(`/auth/perfil/${perfil?.uid}`, { [updateField]: url });
        if (setPerfil) setPerfil(prev => ({ ...prev, [updateField]: url }));
        Alert.alert('✅', 'Foto actualizada');
      }
    } catch { Alert.alert('Error', 'No se pudo subir la foto'); }
  };

  const subirDocumento = async (key, label) => {
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') return Alert.alert('Permiso requerido');
      const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.9 });
      if (result.canceled) return;
      const uri = result.assets[0].uri;
      if (setPerfil) setPerfil(prev => ({ ...prev, documentos: { ...(prev?.documentos || {}), [key]: uri } }));
      Alert.alert('✅', `${label} guardado`);
    } catch { Alert.alert('Error', 'No se pudo subir'); }
  };

  if (!perfil) return <View style={s.center}><ActivityIndicator size="large" color="#FFC107" /></View>;

  return (
    <ScrollView contentContainerStyle={s.container}>
      {/* Foto de perfil */}
      <TouchableOpacity style={s.avatarWrapper} onPress={() => seleccionarFoto('perfil')}>
        {perfil.fotoPerfil ? (
          <Image source={{ uri: perfil.fotoPerfil }} style={s.avatarImg} />
        ) : (
          <View style={s.avatarCircle}><Text style={s.avatarLetra}>{perfil.nombre?.charAt(0)?.toUpperCase() || '?'}</Text></View>
        )}
        <View style={s.avatarBadge}><Text style={{ fontSize: 13 }}>✏️</Text></View>
      </TouchableOpacity>
      <Text style={s.hint}>Toca para cambiar foto</Text>
      <Text style={s.nombre}>{perfil.nombre}</Text>
      <Text style={s.rolTag}>🚕 Conductor</Text>

      {/* Foto del vehículo */}
      <TouchableOpacity style={s.vehiculoCard} onPress={() => seleccionarFoto('vehiculo')}>
        {perfil.fotoVehiculo ? (
          <Image source={{ uri: perfil.fotoVehiculo }} style={s.vehiculoImg} />
        ) : (
          <View style={s.vehiculoEmpty}><Text style={{ fontSize: 32 }}>🚕</Text><Text style={{ color: '#94A3B8', marginTop: 4 }}>Agregar foto del taxi</Text></View>
        )}
      </TouchableOpacity>

      {/* Estado */}
      <View style={[s.card, { backgroundColor: estado.color, alignItems: 'center' }]}>
        <Text style={{ fontSize: 36 }}>{estado.icon}</Text>
        <Text style={{ fontSize: 18, fontWeight: 'bold', color: estado.textColor, marginTop: 6 }}>{estado.titulo}</Text>
        <Text style={{ fontSize: 13, color: estado.textColor, textAlign: 'center', marginTop: 4 }}>{estado.mensaje}</Text>
      </View>

      {/* Disponibilidad */}
      {perfil.estadoVerificacion === 'aprobado' && (
        <View style={[s.card, { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 5, borderLeftColor: enServicio ? '#2E7D32' : '#E53935' }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: enServicio ? '#2E7D32' : '#E53935' }}>{enServicio ? '🟢 EN SERVICIO' : '🔴 FUERA DE SERVICIO'}</Text>
            <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{enServicio ? 'Recibiendo solicitudes' : 'No recibes solicitudes'}</Text>
          </View>
          <Switch value={enServicio} onValueChange={toggleEnServicio} trackColor={{ false: '#ffcdd2', true: '#A5D6A7' }} thumbColor={enServicio ? '#2E7D32' : '#E53935'} />
        </View>
      )}

      {/* Reputación */}
      {perfil.reputacion && (
        <View style={s.card}>
          <Text style={s.cardTitle}>⭐ Mi Reputación</Text>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ fontSize: 36, fontWeight: 'bold', color: '#2E7D32' }}>{perfil.reputacion.porcentaje || 0}%</Text>
            <Text style={{ color: '#666' }}>Promedio: {perfil.reputacion.promedio || 0}/10</Text>
            <Text style={{ color: '#888', fontSize: 12, marginTop: 4 }}>{perfil.reputacion.totalCalificaciones || 0} calificaciones • {perfil.reputacion.totalServicios || 0} servicios</Text>
          </View>
        </View>
      )}

      {/* Datos personales */}
      {!editando ? (
        <View style={s.card}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={s.cardTitle}>Mis datos</Text>
            <TouchableOpacity onPress={() => setEditando(true)}><Text style={{ color: '#1565C0', fontWeight: '600' }}>✏️ Editar</Text></TouchableOpacity>
          </View>
          <View style={s.row}><Text style={s.label}>Nombre</Text><Text style={s.value}>{perfil.nombre || '—'}</Text></View>
          <View style={s.sep} />
          <View style={s.row}><Text style={s.label}>Cédula</Text><Text style={s.value}>{perfil.cedula || '—'}</Text></View>
          <View style={s.sep} />
          <View style={s.row}><Text style={s.label}>Celular</Text><Text style={s.value}>{perfil.telefono || '—'}</Text></View>
          <View style={s.sep} />
          <View style={s.row}><Text style={s.label}>Placa</Text><Text style={[s.value, { color: '#FFC107', fontWeight: 'bold' }]}>{perfil.placa || '—'}</Text></View>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.cardTitle}>Editar datos</Text>
          <TextInput style={s.input} value={form.nombre} onChangeText={v => setForm(p => ({ ...p, nombre: v }))} placeholder="Nombre" />
          <TextInput style={s.input} value={form.cedula} onChangeText={v => setForm(p => ({ ...p, cedula: v }))} placeholder="Cédula" keyboardType="numeric" />
          <TextInput style={s.input} value={form.telefono} onChangeText={v => setForm(p => ({ ...p, telefono: v }))} placeholder="Celular" keyboardType="phone-pad" />
          <TextInput style={s.input} value={form.placa} onChangeText={v => setForm(p => ({ ...p, placa: v.toUpperCase() }))} placeholder="Placa" />
          <TouchableOpacity style={s.btnGuardar} onPress={guardarPerfil} disabled={actualizando}>
            {actualizando ? <ActivityIndicator color="#000" /> : <Text style={{ fontWeight: 'bold' }}>Guardar</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditando(false)} style={{ marginTop: 10, alignItems: 'center' }}>
            <Text style={{ color: '#999' }}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Servicios que ofrezco */}
      <View style={s.card}>
        <Text style={s.cardTitle}>🚕 Servicios que ofrezco</Text>
        {SERVICIOS_OPCIONES.map(({ key, icon, label }) => (
          <TouchableOpacity key={key} onPress={() => toggleServicio(key)} style={[s.servItem, serviciosOfrecidos.includes(key) && s.servItemActivo]}>
            <Text style={{ fontSize: 20 }}>{icon}</Text>
            <Text style={{ flex: 1, fontSize: 14, color: '#555' }}>{label}</Text>
            <Text>{serviciosOfrecidos.includes(key) ? '✅' : '⬜'}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Códigos de radio */}
      <View style={s.card}>
        <Text style={s.cardTitle}>📻 Comandos de Radio</Text>
        <Text style={{ fontSize: 12, color: '#888', marginBottom: 10 }}>Di estos comandos por voz para alertar al panel</Text>
        <View style={s.radioItem}><Text style={s.radioCode}>H1</Text><Text style={s.radioDesc}>🔫 Atraco / Robo (alerta silenciosa)</Text></View>
        <View style={[s.radioItem, { marginTop: 8, borderLeftColor: '#880E4F' }]}><Text style={s.radioCode}>H2</Text><Text style={s.radioDesc}>🚨 Secuestro / Muerto en la vía</Text></View>
        <Text style={{ fontSize: 11, color: '#888', marginTop: 10, fontStyle: 'italic' }}>Activa el micrófono (botón VOZ) cuando te sientas inseguro.</Text>
      </View>

      {/* Documentos */}
      <View style={s.card}>
        <Text style={s.cardTitle}>📄 Documentos</Text>
        {DOCUMENTOS.map(({ key, label }) => (
          <View key={key} style={s.docItem}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ fontSize: 14, fontWeight: '600' }}>{label}</Text>
              <TouchableOpacity onPress={() => subirDocumento(key, label)}>
                <Text style={{ color: '#1565C0', fontWeight: '600', fontSize: 13 }}>{perfil.documentos?.[key] ? '📷 Cambiar' : '📷 Subir'}</Text>
              </TouchableOpacity>
            </View>
            {perfil.documentos?.[key] ? (
              <Image source={{ uri: perfil.documentos[key] }} style={s.docImg} />
            ) : (
              <View style={s.docEmpty}><Text style={{ color: '#999' }}>⚠️ Sin imagen</Text></View>
            )}
          </View>
        ))}
      </View>

      {/* Chat admin */}
      <View style={s.card}>
        <Text style={s.cardTitle}>💬 Mensajes Admin</Text>
        {!mostrarChat ? (
          <TouchableOpacity onPress={() => setMostrarChat(true)} style={{ padding: 12, backgroundColor: '#F8FAFC', borderRadius: 10 }}>
            <Text style={{ color: '#1565C0', fontWeight: '600', textAlign: 'center' }}>Abrir chat</Text>
          </TouchableOpacity>
        ) : (
          <View>
            <ScrollView style={{ maxHeight: 200, marginBottom: 10 }}>
              {mensajes.length === 0 && <Text style={{ color: '#999', textAlign: 'center' }}>Sin mensajes</Text>}
              {mensajes.map((msg, i) => (
                <View key={msg.id || i} style={{ padding: 8, marginBottom: 4, borderRadius: 8, backgroundColor: msg.rol === 'admin' ? '#FFF3E0' : '#E3F2FD' }}>
                  <Text style={{ fontSize: 11, color: '#888' }}>{msg.rol === 'admin' ? '🛡️ Admin' : '👤 Tú'}</Text>
                  <Text style={{ fontSize: 14 }}>{msg.texto}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 }}
                placeholder="Escribe..." value={textoChat} onChangeText={setTextoChat} onSubmitEditing={enviarChat} />
              <TouchableOpacity onPress={enviarChat} disabled={!textoChat.trim()}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: textoChat.trim() ? '#F97316' : '#ddd', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff' }}>➤</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Cerrar sesión */}
      <TouchableOpacity style={s.btnSalir} onPress={handleCerrarSesion}>
        <Text style={s.btnSalirTexto}>Cerrar sesión</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { flexGrow: 1, backgroundColor: '#f5f5f5', padding: 20, alignItems: 'center' },
  avatarWrapper: { position: 'relative', marginTop: 12, marginBottom: 4 },
  avatarImg: { width: 90, height: 90, borderRadius: 45, borderWidth: 3, borderColor: '#FFC107' },
  avatarCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#FFC107', alignItems: 'center', justifyContent: 'center' },
  avatarLetra: { fontSize: 36, fontWeight: 'bold', color: '#000' },
  avatarBadge: { position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFC107', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' },
  hint: { fontSize: 11, color: '#aaa', marginBottom: 6 },
  nombre: { fontSize: 20, fontWeight: 'bold', color: '#111', marginBottom: 2 },
  rolTag: { fontSize: 13, color: '#666', marginBottom: 16 },
  card: { width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 18, marginBottom: 12, elevation: 2 },
  cardTitle: { fontSize: 15, fontWeight: 'bold', color: '#333', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  label: { fontSize: 14, color: '#888' },
  value: { fontSize: 14, fontWeight: '600', color: '#222' },
  sep: { height: 1, backgroundColor: '#f0f0f0' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 15, backgroundColor: '#fafafa', marginBottom: 10 },
  btnGuardar: { backgroundColor: '#FFC107', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 6 },
  btnSalir: { width: '100%', borderWidth: 2, borderColor: '#E53935', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 30 },
  btnSalirTexto: { color: '#E53935', fontWeight: 'bold', fontSize: 16 },
  vehiculoCard: { width: '100%', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 12, elevation: 2, alignItems: 'center' },
  vehiculoImg: { width: '100%', height: 140, borderRadius: 10, resizeMode: 'cover' },
  vehiculoEmpty: { width: '100%', height: 90, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  servItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, marginBottom: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  servItemActivo: { backgroundColor: '#F0FDF4', borderColor: '#16A34A' },
  radioItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#f9f9f9', borderRadius: 10, padding: 12, borderLeftWidth: 4, borderLeftColor: '#E53935' },
  radioCode: { fontSize: 16, fontWeight: 'bold', minWidth: 36 },
  radioDesc: { fontSize: 13, color: '#555', flex: 1 },
  docItem: { marginBottom: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  docImg: { width: '100%', height: 180, borderRadius: 10, resizeMode: 'contain', backgroundColor: '#f0f0f0' },
  docEmpty: { height: 70, backgroundColor: '#f9f9f9', borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ddd', borderStyle: 'dashed' },
});
