import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../config/api';

const MAX = 3;

export default function ContactosConfianza() {
  const [contactos, setContactos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');

  const cargar = useCallback(async () => {
    try {
      const res = await api.get('/users/contactos-confianza');
      setContactos(res.data?.contactos || []);
    } catch {
      setContactos([]);
    } finally {
      setCargando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  const guardar = async (lista) => {
    setGuardando(true);
    try {
      const res = await api.put('/users/contactos-confianza', { contactos: lista });
      setContactos(res.data?.contactos || lista);
      return true;
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudieron guardar los contactos');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const agregar = async () => {
    if (!nombre.trim() || !telefono.trim()) {
      return Alert.alert('Datos incompletos', 'Nombre y teléfono son obligatorios');
    }
    if (contactos.length >= MAX) {
      return Alert.alert('Límite', `Máximo ${MAX} contactos de confianza`);
    }
    const ok = await guardar([...contactos, { nombre: nombre.trim(), telefono: telefono.trim() }]);
    if (ok) {
      setNombre('');
      setTelefono('');
      Alert.alert('✅', 'Contacto agregado. Recibirá alertas de tus viajes.');
    }
  };

  const eliminar = (idx) => {
    Alert.alert('Eliminar contacto', `¿Quitar a ${contactos[idx]?.nombre}?`, [
      { text: 'No', style: 'cancel' },
      {
        text: 'Sí', style: 'destructive',
        onPress: () => guardar(contactos.filter((_, i) => i !== idx)),
      },
    ]);
  };

  return (
    <View style={styles.seccion}>
      <Text style={styles.titulo}>🔐 Contactos de confianza</Text>
      <Text style={styles.sub}>
        Hasta {MAX} personas. Se les avisa al iniciar el viaje, si pierdes GPS o activas SOS.
      </Text>

      {cargando ? (
        <ActivityIndicator color="#1565C0" style={{ marginVertical: 12 }} />
      ) : (
        contactos.map((c, i) => (
          <View key={`${c.telefono}-${i}`} style={styles.fila}>
            <View style={{ flex: 1 }}>
              <Text style={styles.nombre}>{c.nombre}</Text>
              <Text style={styles.tel}>{c.telefono}</Text>
            </View>
            <TouchableOpacity onPress={() => eliminar(i)} disabled={guardando}>
              <Text style={styles.quitar}>✕</Text>
            </TouchableOpacity>
          </View>
        ))
      )}

      {contactos.length < MAX && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="Nombre (mamá, pareja…)"
            placeholderTextColor="#aaa"
            value={nombre}
            onChangeText={setNombre}
          />
          <TextInput
            style={styles.input}
            placeholder="Celular (WhatsApp)"
            placeholderTextColor="#aaa"
            keyboardType="phone-pad"
            value={telefono}
            onChangeText={setTelefono}
          />
          <TouchableOpacity style={styles.btn} onPress={agregar} disabled={guardando}>
            {guardando
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnTexto}>＋ Agregar contacto</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: {
    width: '100%', backgroundColor: '#fff', borderRadius: 16,
    padding: 20, marginBottom: 16, elevation: 2,
  },
  titulo: { fontSize: 16, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  sub: { fontSize: 12, color: '#777', marginBottom: 12, lineHeight: 18 },
  fila: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F9FF', borderRadius: 10, padding: 12, marginBottom: 8,
  },
  nombre: { fontSize: 15, fontWeight: '600', color: '#222' },
  tel: { fontSize: 13, color: '#1565C0', marginTop: 2 },
  quitar: { color: '#E53935', fontWeight: 'bold', fontSize: 18, padding: 8 },
  form: { marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12,
    fontSize: 15, backgroundColor: '#fafafa', color: '#111', marginBottom: 8,
  },
  btn: {
    backgroundColor: '#1565C0', borderRadius: 10, padding: 14, alignItems: 'center',
  },
  btnTexto: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
