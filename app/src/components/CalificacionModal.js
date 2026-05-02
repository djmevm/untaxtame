import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, Alert, ActivityIndicator
} from 'react-native';
import api from '../config/api';

const EMOJIS = {
  1: '😡', 2: '😠', 3: '😞', 4: '😐', 5: '🙂',
  6: '😊', 7: '😃', 8: '😄', 9: '🤩', 10: '🌟',
};

const COLORES = {
  1: '#B71C1C', 2: '#C62828', 3: '#E53935', 4: '#FF5722', 5: '#FF9800',
  6: '#FFC107', 7: '#CDDC39', 8: '#8BC34A', 9: '#4CAF50', 10: '#2E7D32',
};

export default function CalificacionModal({ visible, servicio, onCerrar }) {
  const [puntuacion, setPuntuacion] = useState(0);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    if (!puntuacion) return Alert.alert('Error', 'Selecciona una calificación');
    setEnviando(true);
    try {
      await api.put(`/services/calificar/${servicio?.id}`, { calificacion: puntuacion, comentario });
      Alert.alert('¡Gracias!', 'Tu calificación fue enviada');
      setPuntuacion(0);
      setComentario('');
      if (onCerrar) onCerrar();
    } catch (err) {
      Alert.alert('Error', err.response?.data?.error || 'No se pudo enviar');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.titulo}>⭐ Califica el servicio</Text>
          {servicio?.conductorNombre && (
            <Text style={styles.conductor}>🚕 {servicio.conductorNombre}</Text>
          )}

          {/* Puntuación seleccionada */}
          {puntuacion > 0 && (
            <View style={styles.seleccionada}>
              <Text style={styles.emoji}>{EMOJIS[puntuacion]}</Text>
              <Text style={[styles.puntuacionGrande, { color: COLORES[puntuacion] }]}>{puntuacion}/10</Text>
            </View>
          )}

          {/* Botones 1-10 */}
          <View style={styles.botonesGrid}>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.botonNum,
                  { borderColor: COLORES[n] },
                  puntuacion === n && { backgroundColor: COLORES[n] },
                ]}
                onPress={() => setPuntuacion(n)}
              >
                <Text style={[
                  styles.botonNumTexto,
                  puntuacion === n && { color: '#fff' },
                ]}>
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.escala}>1 = Muy malo · 10 = Excelente</Text>

          {/* Comentario */}
          <TextInput
            style={styles.input}
            placeholder="Comentario (opcional)"
            value={comentario}
            onChangeText={setComentario}
            multiline
            maxLength={200}
          />

          <TouchableOpacity style={styles.btnEnviar} onPress={enviar} disabled={enviando || !puntuacion}>
            {enviando
              ? <ActivityIndicator color="#000" />
              : <Text style={styles.btnEnviarTexto}>Enviar calificación</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity style={styles.btnCerrar} onPress={onCerrar}>
            <Text style={styles.btnCerrarTexto}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 32 },
  titulo: { fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  conductor: { fontSize: 15, color: '#666', textAlign: 'center', marginBottom: 16 },
  seleccionada: { alignItems: 'center', marginBottom: 12 },
  emoji: { fontSize: 48 },
  puntuacionGrande: { fontSize: 28, fontWeight: 'bold', marginTop: 4 },
  botonesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginBottom: 8 },
  botonNum: {
    width: 52, height: 52, borderRadius: 26, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff',
  },
  botonNumTexto: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  escala: { textAlign: 'center', fontSize: 12, color: '#aaa', marginBottom: 16 },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12,
    padding: 12, fontSize: 15, marginBottom: 16, minHeight: 60, textAlignVertical: 'top',
  },
  btnEnviar: { backgroundColor: '#FFC107', borderRadius: 12, padding: 16, alignItems: 'center' },
  btnEnviarTexto: { fontWeight: 'bold', fontSize: 16, color: '#000' },
  btnCerrar: { padding: 14, alignItems: 'center', marginTop: 4 },
  btnCerrarTexto: { color: '#999', fontWeight: 'bold' },
});
