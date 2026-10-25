import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Platform, KeyboardAvoidingView, Linking,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import api from '../../config/api';

const TARIFA_PROGRAMADA = 10000;

// Estados de un viaje programado
const ESTADO_INFO = {
  programado_buscando: { label: '🔍 Buscando conductor', color: '#F57F17' },
  programado_asignado: { label: '✅ Conductor asignado', color: '#2E7D32' },
  cancelado: { label: '❌ Cancelado', color: '#B71C1C' },
  completado_auto: { label: '🏁 Completado', color: '#1565C0' },
};

export default function ProgramarViajeScreen() {
  const { perfil } = useAuth();
  const [form, setForm] = useState({
    fecha: '', hora: '', origen: '', destino: '',
    pasajeros: '1', equipaje: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [misViajes, setMisViajes] = useState([]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const cargarMisViajes = useCallback(async () => {
    if (!perfil?.uid) return;
    try {
      // Reutiliza el historial de servicios del cliente y filtra programados
      const res = await api.get(`/services/historial/${perfil.uid}/cliente`);
      const prog = (res.data || []).filter((s) => s.esProgramado);
      setMisViajes(prog);
    } catch {}
  }, [perfil?.uid]);

  useFocusEffect(useCallback(() => { cargarMisViajes(); }, [cargarMisViajes]));

  const crear = async () => {
    if (!form.fecha.trim() || !form.hora.trim()) {
      return Alert.alert('Falta fecha u hora', 'Indica la fecha (DD/MM) y la hora (ej: 04:30 AM).');
    }
    if (!form.origen.trim() || !form.destino.trim()) {
      return Alert.alert('Falta origen o destino', 'Indica desde dónde te recogemos y a dónde vas.');
    }

    // Parsear fecha DD/MM y hora HH:MM AM/PM → instante en Bogotá (UTC-5)
    const mFecha = form.fecha.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
    const mHora = form.hora.trim().match(/^(\d{1,2}):(\d{2})\s*(a\.?m\.?|p\.?m\.?|am|pm)?$/i);
    if (!mFecha) return Alert.alert('Fecha inválida', 'Escribe la fecha así: DD/MM (ejemplo: 15/06).');
    if (!mHora) return Alert.alert('Hora inválida', 'Escribe la hora así: 04:30 AM (ejemplo).');

    const dia = parseInt(mFecha[1], 10);
    const mes = parseInt(mFecha[2], 10);
    let hh = parseInt(mHora[1], 10);
    const mm = parseInt(mHora[2], 10);
    const periodo = (mHora[3] || '').toLowerCase().replace(/[.\s]/g, '');
    if (periodo.startsWith('p') && hh < 12) hh += 12;
    if (periodo.startsWith('a') && hh === 12) hh = 0;

    const ahora = new Date();
    let anio = ahora.getUTCFullYear();
    // Construir instante en Bogotá (UTC-5): UTC = local + 5h
    let horaProgramada = new Date(Date.UTC(anio, mes - 1, dia, hh, mm) + 5 * 3600 * 1000);
    if (horaProgramada.getTime() <= ahora.getTime()) {
      anio += 1;
      horaProgramada = new Date(Date.UTC(anio, mes - 1, dia, hh, mm) + 5 * 3600 * 1000);
    }

    const horaProgramadaTexto = horaProgramada.toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota',
    });

    setEnviando(true);
    try {
      await api.post('/programados', {
        horaProgramada: horaProgramada.toISOString(),
        horaProgramadaTexto,
        clienteUid: perfil.uid,
        clienteNombre: perfil.nombre || null,
        clienteCelular: perfil.telefono || null,
        origen: form.origen.trim(),
        destino: form.destino.trim(),
        pasajeroNombre: perfil.nombre || null,
        contacto: perfil.telefono || null,
        cantidadPasajeros: parseInt(form.pasajeros, 10) || 1,
        equipaje: form.equipaje.trim() || 'Ninguno',
      });
      Alert.alert(
        '✅ ¡Viaje programado!',
        'Estamos buscando un conductor. Te avisaremos cuando un taxista acepte, con los datos del vehículo. Recibirás recordatorios antes del viaje.'
      );
      setForm({ fecha: '', hora: '', origen: '', destino: '', pasajeros: '1', equipaje: '' });
      cargarMisViajes();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo programar el viaje. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.titulo}>⏰ Programar un viaje</Text>
        <Text style={styles.sub}>Agenda tu taxi para cualquier fecha y hora. Tarifa fija: ${TARIFA_PROGRAMADA.toLocaleString('es-CO')}.</Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>📅 Fecha (DD/MM)</Text>
              <TextInput style={styles.input} value={form.fecha} onChangeText={(v) => set('fecha', v)} placeholder="15/06" placeholderTextColor="#94A3B8" keyboardType="numbers-and-punctuation" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>⏰ Hora</Text>
              <TextInput style={styles.input} value={form.hora} onChangeText={(v) => set('hora', v)} placeholder="04:30 AM" placeholderTextColor="#94A3B8" />
            </View>
          </View>

          <Text style={styles.label}>📍 ¿Desde dónde te recogemos?</Text>
          <TextInput style={styles.input} value={form.origen} onChangeText={(v) => set('origen', v)} placeholder="Ej: Cra 5 #12-34, Barrio Centro" placeholderTextColor="#94A3B8" />

          <Text style={styles.label}>🎯 ¿A dónde vas?</Text>
          <TextInput style={styles.input} value={form.destino} onChangeText={(v) => set('destino', v)} placeholder="Ej: Hospital San Antonio" placeholderTextColor="#94A3B8" />

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>🚗 Pasajeros</Text>
              <View style={styles.pasajerosRow}>
                {[1, 2, 3, 4].map((n) => (
                  <TouchableOpacity key={n} style={[styles.pasBtn, form.pasajeros === String(n) && styles.pasBtnActivo]} onPress={() => set('pasajeros', String(n))}>
                    <Text style={[styles.pasBtnTexto, form.pasajeros === String(n) && styles.pasBtnTextoActivo]}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <Text style={styles.label}>🧳 Equipaje / notas (opcional)</Text>
          <TextInput style={styles.input} value={form.equipaje} onChangeText={(v) => set('equipaje', v)} placeholder="Opcional" placeholderTextColor="#94A3B8" />

          <View style={styles.resumenTarifa}>
            <Text style={styles.resumenTarifaTexto}>💰 Tarifa viaje programado: ${TARIFA_PROGRAMADA.toLocaleString('es-CO')} COP</Text>
          </View>

          <TouchableOpacity style={styles.btnCrear} onPress={crear} disabled={enviando} activeOpacity={0.8}>
            {enviando ? <ActivityIndicator color="#000" /> : <Text style={styles.btnCrearTexto}>Programar viaje</Text>}
          </TouchableOpacity>
        </View>

        {/* Mis viajes programados */}
        <Text style={styles.seccion}>Mis viajes programados</Text>
        {misViajes.length === 0 ? (
          <Text style={styles.vacio}>No tienes viajes programados</Text>
        ) : (
          misViajes.map((v) => {
            const ei = ESTADO_INFO[v.estado] || { label: v.estado, color: '#555' };
            return (
              <View key={v.id} style={styles.viajeCard}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.viajeHora}>⏰ {v.horaProgramadaTexto || ''}</Text>
                  <Text style={[styles.viajeEstado, { color: ei.color }]}>{ei.label}</Text>
                </View>
                <Text style={styles.viajeRuta}>📍 {v.origen} → 🎯 {v.destino}</Text>
                {v.estado === 'programado_asignado' && v.conductorNombre && (
                  <View style={styles.conductorBox}>
                    <Text style={styles.conductorTexto}>🚕 {v.conductorNombre} · Placa {v.conductorPlaca || 'N/D'}</Text>
                    {v.conductorCelular && (
                      <TouchableOpacity onPress={() => Linking.openURL(`tel:${v.conductorCelular}`)}>
                        <Text style={styles.conductorTel}>📞 {v.conductorCelular}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: '#f5f5f5', flexGrow: 1 },
  titulo: { fontSize: 22, fontWeight: 'bold', color: '#111', marginBottom: 2 },
  sub: { fontSize: 13, color: '#777', marginBottom: 16 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 18, elevation: 2, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 12, color: '#64748B', fontWeight: '600', marginTop: 12, marginBottom: 6, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12, fontSize: 15, backgroundColor: '#fafafa', color: '#111' },
  pasajerosRow: { flexDirection: 'row', gap: 8 },
  pasBtn: { width: 48, height: 44, borderRadius: 10, borderWidth: 2, borderColor: '#ddd', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  pasBtnActivo: { borderColor: '#FFC107', backgroundColor: '#FFF8E1' },
  pasBtnTexto: { fontSize: 16, fontWeight: 'bold', color: '#555' },
  pasBtnTextoActivo: { color: '#000' },
  resumenTarifa: { backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12, marginTop: 16 },
  resumenTarifaTexto: { color: '#2E7D32', fontWeight: 'bold', textAlign: 'center' },
  btnCrear: { backgroundColor: '#FFC107', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  btnCrearTexto: { fontWeight: 'bold', fontSize: 16, color: '#000' },
  seccion: { fontSize: 17, fontWeight: 'bold', color: '#333', marginBottom: 10 },
  vacio: { color: '#999', textAlign: 'center', marginVertical: 12 },
  viajeCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 1, borderLeftWidth: 4, borderLeftColor: '#5C6BC0' },
  viajeHora: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  viajeEstado: { fontSize: 12, fontWeight: 'bold' },
  viajeRuta: { fontSize: 13, color: '#555', marginTop: 6 },
  conductorBox: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f0f0' },
  conductorTexto: { fontSize: 13, color: '#222', fontWeight: '600' },
  conductorTel: { fontSize: 13, color: '#1565C0', fontWeight: '600', marginTop: 2 },
});
