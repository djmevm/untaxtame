import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import api from '../config/api';
import { reproducirSonidoChat } from '../services/sonido';

// Hook que verifica mensajes nuevos de chat cuando el chat está CERRADO
// Notifica con sonido + vibración + alerta visual
export default function useChatNotificacion(servicioId, miUid, chatAbierto) {
  const cantidadRef = useRef(null);

  useEffect(() => {
    if (!servicioId || !miUid || chatAbierto) {
      cantidadRef.current = null;
      return;
    }

    const verificar = async () => {
      try {
        const res = await api.get('/chat/' + servicioId + '/mensajes');
        const mensajes = res.data;
        const cantidad = mensajes.length;

        if (cantidadRef.current !== null && cantidad > cantidadRef.current) {
          const nuevos = mensajes.slice(cantidadRef.current);
          const deOtro = nuevos.filter(m => m.uid !== miUid);

          if (deOtro.length > 0) {
            reproducirSonidoChat();
            const ultimo = deOtro[deOtro.length - 1];
            const emoji = ultimo.rol === 'cliente' ? '👤' : ultimo.rol === 'admin' ? '🛡️' : '🚕';
            Alert.alert(
              '💬 Mensaje nuevo',
              `${emoji} ${ultimo.nombre || 'Usuario'}:\n"${ultimo.texto}"\n\nAbre el chat para responder.`,
              [{ text: 'Ver chat' }]
            );
          }
        }
        cantidadRef.current = cantidad;
      } catch {}
    };

    verificar();
    const intervalo = setInterval(verificar, 60000); // Cada 60 seg
    return () => clearInterval(intervalo);
  }, [servicioId, miUid, chatAbierto]);
}
