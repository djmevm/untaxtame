import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, Keyboard, Modal,
  SafeAreaView
} from 'react-native';
import api from '../config/api';
import useWebSocket from '../hooks/useWebSocket';

export default function MensajesAdmin({ uid }) {
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mostrar, setMostrar] = useState(false);
  const flatRef = useRef(null);
  const intervaloRef = useRef(null);

  // ═══ WEBSOCKET: Recibir mensajes en tiempo real ═══
  const { conectado, onMensaje } = useWebSocket(uid, 'cliente');

  useEffect(() => {
    if (!conectado || !uid) return;
    const cleanup = onMensaje('chat_directo', (data) => {
      // Solo agregar si es un mensaje del admin para este usuario
      if (data.senderRol === 'admin' || data.senderUid !== uid) {
        setMensajes(prev => {
          // Evitar duplicados
          if (prev.some(m => m.creadoEn === new Date(data.timestamp).toISOString() && m.texto === data.texto)) {
            return prev;
          }
          return [...prev, {
            uid: data.senderUid,
            nombre: data.senderNombre,
            rol: data.senderRol === 'admin' ? 'admin' : 'usuario',
            texto: data.texto,
            creadoEn: new Date(data.timestamp).toISOString(),
          }];
        });
      }
    });
    return cleanup;
  }, [conectado, uid, onMensaje]);

  // Carga inicial + polling adaptativo
  useEffect(() => {
    if (!uid || !mostrar) {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
      return;
    }
    cargar();
    // Con WebSocket: polling cada 60s como respaldo
    // Sin WebSocket: polling cada 10s
    const intervaloMs = conectado ? 60000 : 10000;
    intervaloRef.current = setInterval(cargar, intervaloMs);
    return () => { if (intervaloRef.current) clearInterval(intervaloRef.current); };
  }, [uid, mostrar, conectado]);

  const cargar = async () => {
    try {
      const res = await api.get(`/chat/directo/${uid}/mensajes`);
      setMensajes(res.data);
    } catch {}
  };

  const enviar = async () => {
    if (!texto.trim() || enviando) return;
    setEnviando(true);
    try {
      await api.post(`/chat/directo/${uid}/mensaje`, { texto: texto.trim() });
      setTexto('');
      cargar();
    } catch {}
    finally { setEnviando(false); }
  };

  const totalMensajes = mensajes.length;

  useEffect(() => {
    if (totalMensajes > 0 && !mostrar) {
      setMostrar(true);
    }
  }, [totalMensajes]);

  return (
    <View style={styles.seccion}>
      <TouchableOpacity onPress={() => setMostrar(true)}>
        <View style={styles.headerRow}>
          <Text style={styles.titulo}>💬 Mensajes Admin</Text>
          {totalMensajes > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{totalMensajes}</Text>
            </View>
          )}
          <Text style={styles.flecha}>▼</Text>
        </View>
      </TouchableOpacity>

      {/* Modal a pantalla completa para el chat */}
      <Modal
        visible={mostrar}
        animationType="slide"
        onRequestClose={() => setMostrar(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          {/* Header del chat */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>💬 Mensajes Admin</Text>
            <TouchableOpacity onPress={() => { Keyboard.dismiss(); setMostrar(false); }}>
              <Text style={styles.modalCerrar}>✕</Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={styles.chatFlex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 10 : 0}
          >
            {/* Lista de mensajes */}
            {mensajes.length === 0 ? (
              <View style={styles.vacioContainer}>
                <Text style={styles.vacio}>Sin mensajes</Text>
              </View>
            ) : (
              <FlatList
                ref={flatRef}
                data={mensajes}
                keyExtractor={(item, i) => item.id || `m-${i}`}
                style={styles.lista}
                contentContainerStyle={styles.listaContent}
                onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
                renderItem={({ item }) => (
                  <View style={[styles.burbuja, item.rol === 'admin' ? styles.burbujaAdmin : styles.burbujaMia]}>
                    <Text style={styles.remitente}>
                      {item.rol === 'admin' ? '🛡️ Admin' : '👤 Tú'}
                    </Text>
                    <Text style={styles.texto}>{item.texto}</Text>
                    <Text style={styles.hora}>
                      {item.creadoEn ? new Date(item.creadoEn).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                )}
              />
            )}

            {/* Input fijo abajo */}
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                placeholder="Escribe al admin..."
                placeholderTextColor="#999"
                value={texto}
                onChangeText={setTexto}
                maxLength={500}
                blurOnSubmit={false}
                returnKeyType="send"
                onSubmitEditing={enviar}
              />
              <TouchableOpacity
                style={[styles.btnEnviar, !texto.trim() && { backgroundColor: '#ddd' }]}
                onPress={enviar}
                disabled={!texto.trim() || enviando}
              >
                <Text style={styles.btnEnviarTexto}>➤</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16,
    marginBottom: 12, elevation: 2, width: '100%',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titulo: { fontSize: 15, fontWeight: 'bold', color: '#333', flex: 1 },
  badge: { backgroundColor: '#F97316', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  flecha: { fontSize: 14, color: '#999' },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#f5f5f5' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee',
    elevation: 2,
  },
  modalTitulo: { fontSize: 17, fontWeight: 'bold', color: '#333' },
  modalCerrar: { fontSize: 22, color: '#999', paddingHorizontal: 8 },

  // Chat
  chatFlex: { flex: 1 },
  vacioContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  vacio: { textAlign: 'center', color: '#999', fontSize: 15 },
  lista: { flex: 1 },
  listaContent: { padding: 16, paddingBottom: 8 },
  burbuja: { borderRadius: 12, padding: 10, marginBottom: 8, maxWidth: '85%' },
  burbujaAdmin: { backgroundColor: '#FFF3E0', alignSelf: 'flex-start', borderLeftWidth: 3, borderLeftColor: '#F97316' },
  burbujaMia: { backgroundColor: '#E3F2FD', alignSelf: 'flex-end', borderRightWidth: 3, borderRightColor: '#1565C0' },
  remitente: { fontSize: 10, color: '#888', fontWeight: '600', marginBottom: 2 },
  texto: { fontSize: 14, color: '#333' },
  hora: { fontSize: 9, color: '#bbb', marginTop: 3, textAlign: 'right' },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#eee',
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: '#333',
    backgroundColor: '#fafafa',
  },
  btnEnviar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#F97316',
    alignItems: 'center', justifyContent: 'center',
  },
  btnEnviarTexto: { fontSize: 18, color: '#fff' },
});
