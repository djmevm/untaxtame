import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, FlatList, Platform,
  ActivityIndicator, Modal, Keyboard, Dimensions
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import api from '../config/api';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function ChatServicio({ servicioId, visible, onCerrar }) {
  const { perfil } = useAuth();
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [cargandoInicial, setCargandoInicial] = useState(true);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const flatListRef = useRef(null);
  const cantidadAnterior = useRef(0);
  const intervaloRef = useRef(null);

  // Detectar teclado manualmente
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const cargarMensajes = useCallback(async () => {
    if (!servicioId) return;
    try {
      const res = await api.get(`/chat/${servicioId}/mensajes`);
      cantidadAnterior.current = res.data.length;
      setMensajes(res.data);
    } catch {}
    finally { setCargandoInicial(false); }
  }, [servicioId]);

  useEffect(() => {
    if (visible && servicioId) {
      setCargandoInicial(true);
      cargarMensajes();
      intervaloRef.current = setInterval(cargarMensajes, 4000);
    } else {
      if (intervaloRef.current) {
        clearInterval(intervaloRef.current);
        intervaloRef.current = null;
      }
    }
    return () => {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
    };
  }, [servicioId, visible, cargarMensajes]);

  useEffect(() => {
    if (mensajes.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 150);
    }
  }, [mensajes.length, keyboardHeight]);

  const enviarMensaje = async () => {
    const textoLimpio = texto.trim();
    if (!textoLimpio || enviando) return;
    setTexto('');
    setEnviando(true);
    try {
      await api.post(`/chat/${servicioId}/mensaje`, { texto: textoLimpio });
      await cargarMensajes();
    } catch {
      setTexto(textoLimpio);
    } finally {
      setEnviando(false);
    }
  };

  if (!visible) return null;

  const esMio = (msg) => msg.uid === perfil?.uid;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar}>
      <View style={[styles.container, { paddingBottom: keyboardHeight }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onCerrar} style={styles.btnCerrar}>
            <Text style={styles.btnCerrarTexto}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitulo}>💬 Chat</Text>
          <Text style={styles.headerContador}>{mensajes.length}</Text>
        </View>

        {/* Mensajes */}
        <FlatList
          ref={flatListRef}
          data={mensajes}
          keyExtractor={(item, i) => item.id || `m-${i}`}
          style={styles.lista}
          contentContainerStyle={mensajes.length === 0 ? styles.listaVacia : styles.listaContent}
          keyboardShouldPersistTaps="always"
          ListEmptyComponent={
            <View style={styles.vacio}>
              <Text style={{ fontSize: 40 }}>💬</Text>
              <Text style={styles.vacioTexto}>Sin mensajes aún</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.burbuja, esMio(item) ? styles.burbujaMia : styles.burbujaOtra]}>
              {!esMio(item) && (
                <Text style={styles.remitente}>
                  {item.rol === 'admin' ? '🛡️ Admin' : item.rol === 'cliente' ? '👤' : '🚕'} {item.nombre}
                </Text>
              )}
              <Text style={[styles.burbujaTexto, esMio(item) && { color: '#fff' }]}>
                {item.texto}
              </Text>
              <Text style={[styles.hora, esMio(item) && { color: 'rgba(255,255,255,0.7)' }]}>
                {item.creadoEn ? new Date(item.creadoEn).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : ''}
              </Text>
            </View>
          )}
        />

        {/* Input siempre visible */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Escribe un mensaje..."
            placeholderTextColor="#999"
            value={texto}
            onChangeText={setTexto}
            multiline
            maxLength={500}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.btnEnviar, (!texto.trim() || enviando) && { backgroundColor: '#ddd' }]}
            onPress={enviarMensaje}
            disabled={!texto.trim() || enviando}
          >
            {enviando
              ? <ActivityIndicator size="small" color="#fff" />
              : <Text style={styles.btnEnviarTexto}>➤</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#eee',
  },
  btnCerrar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f1f1',
    alignItems: 'center', justifyContent: 'center',
  },
  btnCerrarTexto: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  headerTitulo: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  headerContador: { fontSize: 12, color: '#999', fontWeight: '600' },
  lista: { flex: 1 },
  listaContent: { padding: 16, paddingBottom: 8 },
  listaVacia: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  vacio: { alignItems: 'center' },
  vacioTexto: { fontSize: 14, color: '#999', marginTop: 8 },
  burbuja: { maxWidth: '80%', borderRadius: 16, padding: 12, marginBottom: 8 },
  burbujaMia: { backgroundColor: '#F97316', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  burbujaOtra: { backgroundColor: '#fff', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#eee' },
  remitente: { fontSize: 11, fontWeight: '600', color: '#888', marginBottom: 3 },
  burbujaTexto: { fontSize: 15, color: '#333', lineHeight: 20 },
  hora: { fontSize: 10, color: '#bbb', marginTop: 4, textAlign: 'right' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee', gap: 10,
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 15,
    maxHeight: 100, backgroundColor: '#fafafa', color: '#333',
  },
  btnEnviar: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#F97316',
    alignItems: 'center', justifyContent: 'center',
  },
  btnEnviarTexto: { fontSize: 18, color: '#fff' },
});
