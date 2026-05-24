import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, TextInput, Modal } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ICONOS_FAVORITOS = [
  { id: 'casa', icon: '🏠', label: 'Casa' },
  { id: 'trabajo', icon: '💼', label: 'Trabajo' },
  { id: 'gym', icon: '🏋️', label: 'Gym' },
  { id: 'otro', icon: '⭐', label: 'Otro' },
];

export default function DireccionesFavoritas({ onSeleccionar }) {
  const [favoritos, setFavoritos] = useState({});
  const [modalVisible, setModalVisible] = useState(false);
  const [editando, setEditando] = useState(null);
  const [direccionTemp, setDireccionTemp] = useState('');

  useEffect(() => {
    cargar();
  }, []);

  const cargar = async () => {
    try {
      const data = await AsyncStorage.getItem('direcciones_favoritas');
      if (data) setFavoritos(JSON.parse(data));
    } catch {}
  };

  const guardar = async (id, direccion) => {
    const nuevos = { ...favoritos, [id]: direccion };
    setFavoritos(nuevos);
    await AsyncStorage.setItem('direcciones_favoritas', JSON.stringify(nuevos));
    setModalVisible(false);
    setDireccionTemp('');
  };

  const abrirEditor = (id) => {
    setEditando(id);
    setDireccionTemp(favoritos[id] || '');
    setModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <View style={styles.grid}>
        {ICONOS_FAVORITOS.map(fav => (
          <TouchableOpacity
            key={fav.id}
            style={[styles.favBtn, favoritos[fav.id] && styles.favBtnActivo]}
            onPress={() => {
              if (favoritos[fav.id]) {
                onSeleccionar(favoritos[fav.id]);
              } else {
                abrirEditor(fav.id);
              }
            }}
            onLongPress={() => abrirEditor(fav.id)}
          >
            <Text style={styles.favIcon}>{fav.icon}</Text>
            <Text style={styles.favLabel}>{fav.label}</Text>
            {favoritos[fav.id] ? (
              <Text style={styles.favDir} numberOfLines={1}>{favoritos[fav.id]}</Text>
            ) : (
              <Text style={styles.favAgregar}>+ Agregar</Text>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Modal para editar dirección */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitulo}>
              {ICONOS_FAVORITOS.find(f => f.id === editando)?.icon} Guardar dirección
            </Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ej: Calle 15 #10-25, Barrio Centro"
              placeholderTextColor="#999"
              value={direccionTemp}
              onChangeText={setDireccionTemp}
              autoFocus
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalBtnCancelar} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalBtnCancelarTexto}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtnGuardar, !direccionTemp.trim() && { opacity: 0.5 }]}
                onPress={() => direccionTemp.trim() && guardar(editando, direccionTemp.trim())}
                disabled={!direccionTemp.trim()}
              >
                <Text style={styles.modalBtnGuardarTexto}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  favBtn: {
    width: '48%', backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center',
  },
  favBtnActivo: { borderColor: '#F97316', backgroundColor: '#FFF7ED' },
  favIcon: { fontSize: 22, marginBottom: 4 },
  favLabel: { fontSize: 12, fontWeight: 'bold', color: '#333' },
  favDir: { fontSize: 10, color: '#666', marginTop: 2 },
  favAgregar: { fontSize: 10, color: '#94A3B8', marginTop: 2 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitulo: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  modalInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 12, padding: 14,
    fontSize: 15, marginBottom: 16, color: '#333',
  },
  modalBtns: { flexDirection: 'row', gap: 10 },
  modalBtnCancelar: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 10, backgroundColor: '#f1f1f1' },
  modalBtnCancelarTexto: { color: '#666', fontWeight: 'bold' },
  modalBtnGuardar: { flex: 1, padding: 14, alignItems: 'center', borderRadius: 10, backgroundColor: '#F97316' },
  modalBtnGuardarTexto: { color: '#fff', fontWeight: 'bold' },
});
