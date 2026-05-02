import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import api from '../config/api';
import { reproducirSonidoChat } from '../services/sonido';

// Hook que verifica mensajes nuevos de chat cuando el chat está CERRADO
// y notifica con sonido + vibración
export default function useChatNotificacion(servicioId, miUid, chatAbierto) {
  const cantidadRef = useRef(null);

  useEffect(() => {
    // Solo verificar cuando el chat está cerrado y hay un servicio activo
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
          // Hay mensajes nuevos, verificar si son de otra persona
          const nuevos = mensajes.slice(cantidadRef.current);
          const deOtro = nuevos.filter(function(m) { return m.uid !== miUid; });

          if (deOtro.length > 0) {
            reproducirSonidoChat();
            var ultimo = deOtro[deOtro.length - 1];
            var emoji = ultimo.rol === 'cliente' ? '👤' : '🚕';
            Alert.alert(
              '💬 Nuevo mensaje',
              emoji + ' ' + (ultimo.nombre || 'Usuario') + ':\n"' + ultimo.texto + '"',
              [{ text: 'OK' }]
            );
          }
        }
        cantidadRef.current = cantidad;
      } catch (e) {}
    };

    verificar();
    var intervalo = setInterval(verificar, 8000);
    return function() { clearInterval(intervalo); };
  }, [servicioId, miUid, chatAbierto]);
}
