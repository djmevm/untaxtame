import React, { useEffect, useState, useRef } from 'react';
import api from '../api';
import { reproducirWhatsApp } from '../utils/sonido';

export default function WhatsApp() {
  const [plantillas, setPlantillas] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null);

  // Envío individual
  const [telefono, setTelefono] = useState('');
  const [mensaje, setMensaje] = useState('');

  // Envío masivo
  const [plantillaSeleccionada, setPlantillaSeleccionada] = useState('');
  const [tab, setTab] = useState('inbox'); // inbox | masivo | individual | historial

  // Bandeja de entrada
  const [conversaciones, setConversaciones] = useState([]);
  const [conversacionActiva, setConversacionActiva] = useState(null);
  const [mensajesChat, setMensajesChat] = useState([]);
  const [respuesta, setRespuesta] = useState('');
  const [enviandoRespuesta, setEnviandoRespuesta] = useState(false);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [plantillasRes, historialRes, conversacionesRes] = await Promise.all([
        api.get('/whatsapp/plantillas').catch(() => ({ data: [] })),
        api.get('/whatsapp/historial-masivos').catch(() => ({ data: [] })),
        api.get('/whatsapp/conversaciones').catch(() => ({ data: [] })),
      ]);
      const plantillasData = Array.isArray(plantillasRes.data) ? plantillasRes.data : [];
      const historialData = Array.isArray(historialRes.data) ? historialRes.data : [];
      const conversacionesData = Array.isArray(conversacionesRes.data) ? conversacionesRes.data : [];
      setPlantillas(plantillasData);
      setHistorial(historialData);
      setConversaciones(conversacionesData);
    } catch {
      setPlantillas([]);
      setHistorial([]);
      setConversaciones([]);
    } finally {
      setCargando(false);
    }
  };

  const abrirConversacion = async (conv) => {
    setConversacionActiva(conv);
    try {
      const res = await api.get(`/whatsapp/conversaciones/${conv.telefono}/mensajes`);
      setMensajesChat(Array.isArray(res.data) ? res.data : []);
      // Actualizar no leidos en la lista
      setConversaciones(prev => prev.map(c => c.telefono === conv.telefono ? { ...c, noLeidos: 0 } : c));
    } catch {
      setMensajesChat([]);
    }
  };

  // Auto-refresh del chat cada 5 segundos
  const prevMensajesCount = useRef(0);
  const prevNoLeidos = useRef(0);

  useEffect(() => {
    if (!conversacionActiva) return;
    const intervalo = setInterval(async () => {
      try {
        const res = await api.get(`/whatsapp/conversaciones/${conversacionActiva.telefono}/mensajes`);
        const nuevos = Array.isArray(res.data) ? res.data : [];
        // Sonar si hay mensajes nuevos recibidos
        if (nuevos.length > prevMensajesCount.current && prevMensajesCount.current > 0) {
          const ultimoNuevo = nuevos[nuevos.length - 1];
          if (ultimoNuevo?.tipo === 'recibido') {
            reproducirWhatsApp();
          }
        }
        prevMensajesCount.current = nuevos.length;
        setMensajesChat(nuevos);
      } catch {}
      // También refrescar lista de conversaciones
      try {
        const convRes = await api.get('/whatsapp/conversaciones');
        if (Array.isArray(convRes.data)) {
          // Detectar nuevos mensajes no leídos en cualquier conversación
          const totalNoLeidos = convRes.data.reduce((sum, c) => sum + (c.noLeidos || 0), 0);
          if (totalNoLeidos > prevNoLeidos.current && prevNoLeidos.current >= 0) {
            reproducirWhatsApp();
          }
          prevNoLeidos.current = totalNoLeidos;
          setConversaciones(convRes.data);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(intervalo);
  }, [conversacionActiva]);

  // Auto-refresh de conversaciones cuando NO hay chat abierto (para sonido global)
  useEffect(() => {
    if (conversacionActiva) return;
    const intervalo = setInterval(async () => {
      try {
        const convRes = await api.get('/whatsapp/conversaciones');
        if (Array.isArray(convRes.data)) {
          const totalNoLeidos = convRes.data.reduce((sum, c) => sum + (c.noLeidos || 0), 0);
          if (totalNoLeidos > prevNoLeidos.current && prevNoLeidos.current >= 0) {
            reproducirWhatsApp();
          }
          prevNoLeidos.current = totalNoLeidos;
          setConversaciones(convRes.data);
        }
      } catch {}
    }, 5000);
    return () => clearInterval(intervalo);
  }, [conversacionActiva]);

  const enviarRespuesta = async () => {
    if (!respuesta.trim() || !conversacionActiva) return;
    setEnviandoRespuesta(true);
    try {
      await api.post(`/whatsapp/conversaciones/${conversacionActiva.telefono}/responder`, { mensaje: respuesta.trim() });
      setRespuesta('');
      abrirConversacion(conversacionActiva);
    } catch (err) {
      alert('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setEnviandoRespuesta(false);
    }
  };

  const enviarArchivo = async (e) => {
    const file = e.target.files[0];
    if (!file || !conversacionActiva) return;
    setEnviandoRespuesta(true);
    try {
      const formData = new FormData();
      formData.append('archivo', file);
      formData.append('telefono', conversacionActiva.telefono);
      await api.post('/whatsapp/enviar-archivo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      abrirConversacion(conversacionActiva);
    } catch (err) {
      alert('Error enviando archivo: ' + (err.response?.data?.error || err.message));
    } finally {
      setEnviandoRespuesta(false);
      e.target.value = '';
    }
  };

  const enviarMasivo = async () => {
    if (!plantillaSeleccionada) {
      alert('Selecciona una plantilla');
      return;
    }
    if (!window.confirm(`📢 ¿Enviar la plantilla "${plantillaSeleccionada}" a TODOS los clientes registrados?\n\nEsto enviará un mensaje de WhatsApp a cada cliente con número de teléfono.`)) {
      return;
    }

    setEnviando(true);
    setResultado(null);
    try {
      // Obtener el idioma correcto de la plantilla seleccionada
      const plantillaInfo = plantillas.find(p => p.name === plantillaSeleccionada);
      const idioma = plantillaInfo?.language || 'es_CO';

      // Plantillas que requieren header con imagen
      const plantillasConImagen = {
        'bienvenida_cliente': 'https://untaxtame.vercel.app/icon_adaptive.jpg',
        'descarga_app': 'https://untaxtame.vercel.app/icon_adaptive.jpg',
      };
      const headerImageUrl = plantillasConImagen[plantillaSeleccionada] || null;

      const res = await api.post('/whatsapp/enviar-masivo', {
        plantilla: plantillaSeleccionada,
        idioma,
        headerImageUrl,
      });
      setResultado(res.data);
      cargarDatos();
    } catch (err) {
      setResultado({ error: err.response?.data?.error || err.message });
    } finally {
      setEnviando(false);
    }
  };

  const enviarIndividual = async () => {
    if (!telefono || !mensaje) {
      alert('Completa el teléfono y el mensaje');
      return;
    }
    setEnviando(true);
    setResultado(null);
    try {
      const numero = '57' + telefono.replace(/[^0-9]/g, '');
      const res = await api.post('/whatsapp/enviar', { telefono: numero, mensaje });
      setResultado(res.data);
      setMensaje('');
    } catch (err) {
      setResultado({ error: err.response?.data?.error || err.message });
    } finally {
      setEnviando(false);
    }
  };

  if (cargando) return <p className="loading">Cargando WhatsApp...</p>;

  return (
    <div>
      <h2 className="titulo">📱 WhatsApp Business</h2>
      <p style={{ color: '#666', marginBottom: 20 }}>
        Envía mensajes a tus clientes desde aquí. Número: <strong>+57 322 3221058</strong>
      </p>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'inbox', label: '📥 Bandeja de Entrada' },
          { key: 'masivo', label: '📢 Envío Masivo' },
          { key: 'individual', label: '💬 Mensaje Individual' },
          { key: 'historial', label: '📋 Historial' },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setResultado(null); }} style={{
            padding: '10px 20px', borderRadius: 10, border: '2px solid #25D366',
            background: tab === t.key ? '#25D366' : '#fff',
            color: tab === t.key ? '#fff' : '#333',
            fontWeight: 'bold', cursor: 'pointer', fontSize: 14,
            position: 'relative',
          }}>
            {t.label}
            {t.key === 'inbox' && conversaciones.filter(c => c.noLeidos > 0).length > 0 && (
              <span style={{ position: 'absolute', top: -5, right: -5, background: '#E53935', color: '#fff', borderRadius: '50%', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 'bold' }}>
                {conversaciones.filter(c => c.noLeidos > 0).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══ BANDEJA DE ENTRADA ═══ */}
      {tab === 'inbox' && (
        <div style={{ display: 'flex', gap: 16, minHeight: 500 }}>
          {/* Lista de conversaciones */}
          <div style={{ width: 320, background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid #eee' }}>
              <h3 style={{ margin: 0, fontSize: 15 }}>💬 Conversaciones</h3>
              <button onClick={cargarDatos} style={{ marginTop: 8, background: '#25D366', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                🔄 Actualizar
              </button>
            </div>
            <div style={{ maxHeight: 450, overflowY: 'auto' }}>
              {conversaciones.length === 0 ? (
                <p style={{ color: '#999', textAlign: 'center', padding: 20 }}>Sin conversaciones</p>
              ) : (
                conversaciones.map(conv => (
                  <div key={conv.telefono} onClick={() => abrirConversacion(conv)} style={{
                    padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
                    background: conversacionActiva?.telefono === conv.telefono ? '#E8F5E9' : '#fff',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 14 }}>{conv.nombre || conv.telefono}</strong>
                      {conv.noLeidos > 0 && (
                        <span style={{ background: '#25D366', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 'bold' }}>
                          {conv.noLeidos}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conv.ultimoTipo === 'enviado' ? '✓ ' : ''}{conv.ultimoMensaje || '...'}
                    </p>
                    <span style={{ fontSize: 10, color: '#bbb' }}>
                      +{conv.telefono} • {conv.actualizadoEn ? new Date(conv.actualizadoEn).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Chat activo */}
          <div style={{ flex: 1, background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column' }}>
            {!conversacionActiva ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                <p>Selecciona una conversación</p>
              </div>
            ) : (
              <>
                {/* Header del chat */}
                <div style={{ padding: '14px 20px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 20, background: '#25D366', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                    {(conversacionActiva.nombre || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <strong>{conversacionActiva.nombre || conversacionActiva.telefono}</strong>
                    <p style={{ margin: 0, fontSize: 12, color: '#888' }}>+{conversacionActiva.telefono}</p>
                  </div>
                </div>

                {/* Input responder */}
                <div style={{ padding: 12, borderBottom: '1px solid #eee', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <label style={{ cursor: 'pointer', fontSize: 22 }} title="Enviar archivo/imagen">
                    📎
                    <input type="file" accept="image/*,video/*,application/pdf,.doc,.docx" onChange={enviarArchivo} style={{ display: 'none' }} />
                  </label>
                  <input
                    type="text"
                    value={respuesta}
                    onChange={e => setRespuesta(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') enviarRespuesta(); }}
                    placeholder="Escribir respuesta..."
                    style={{ flex: 1, padding: '12px 14px', borderRadius: 20, border: '1px solid #ddd', fontSize: 14 }}
                    disabled={enviandoRespuesta}
                  />
                  <button onClick={enviarRespuesta} disabled={!respuesta.trim() || enviandoRespuesta} style={{
                    background: respuesta.trim() ? '#25D366' : '#ddd', color: '#fff', border: 'none',
                    borderRadius: 20, padding: '12px 20px', cursor: respuesta.trim() ? 'pointer' : 'default',
                    fontWeight: 'bold', fontSize: 14,
                  }}>
                    {enviandoRespuesta ? '...' : '➤'}
                  </button>
                </div>

                {/* Mensajes - más reciente arriba */}
                <div style={{ flex: 1, overflowY: 'auto', padding: 16, background: '#f0f2f5', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {mensajesChat.length === 0 ? (
                    <p style={{ color: '#999', textAlign: 'center' }}>Sin mensajes</p>
                  ) : (
                    [...mensajesChat].reverse().map((msg, i) => {
                      // Fix URLs de media: reescribir a la ruta correcta sin helmet
                      let mediaUrl = msg.mediaUrl;
                      if (mediaUrl) {
                        mediaUrl = mediaUrl.replace('/api/whatsapp/media/', '/whatsapp/media/');
                        mediaUrl = mediaUrl.replace('/uploads/whatsapp/', '/whatsapp/media/');
                      }
                      return (
                      <div key={msg.id || i} style={{
                        maxWidth: '75%',
                        alignSelf: msg.tipo === 'enviado' ? 'flex-end' : 'flex-start',
                        background: msg.tipo === 'enviado' ? '#DCF8C6' : '#fff',
                        borderRadius: 10,
                        padding: '8px 12px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      }}>
                        {msg.tipo === 'enviado' && (
                          <span style={{ fontSize: 10, color: msg.enviadoPor === 'bot' ? '#F97316' : '#1565C0', fontWeight: 'bold' }}>
                            {msg.enviadoPor === 'bot' ? '🤖 Bot' : '🛡️ Admin'}
                          </span>
                        )}
                        {mediaUrl && ['image', 'sticker'].includes(msg.tipoMensaje) && (
                          <img src={mediaUrl} alt="media" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 4, cursor: 'pointer' }} onClick={() => window.open(mediaUrl, '_blank')} />
                        )}
                        {mediaUrl && msg.tipoMensaje === 'video' && (
                          <video controls style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 4 }}>
                            <source src={mediaUrl} />
                          </video>
                        )}
                        {mediaUrl && msg.tipoMensaje === 'audio' && (
                          <audio controls style={{ width: '100%', marginBottom: 4 }}>
                            <source src={mediaUrl} type="audio/ogg" />
                            <source src={mediaUrl} type="audio/mpeg" />
                            <source src={mediaUrl} />
                          </audio>
                        )}
                        {!mediaUrl && msg.tipoMensaje === 'audio' && (
                          <div style={{ background: '#f0f0f0', borderRadius: 8, padding: '8px 12px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 18 }}>🎵</span>
                            <span style={{ fontSize: 12, color: '#666' }}>Audio (no disponible para reproducir)</span>
                          </div>
                        )}
                        {mediaUrl && msg.tipoMensaje === 'document' && (
                          <a href={mediaUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#1565C0', fontWeight: 'bold', fontSize: 13 }}>📄 Descargar documento</a>
                        )}
                        <p style={{ margin: '2px 0', fontSize: 14, whiteSpace: 'pre-wrap' }}>{msg.texto}</p>
                        <span style={{ fontSize: 10, color: '#999' }}>
                          {msg.creadoEn ? new Date(msg.creadoEn).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                        </span>
                      </div>
                    );})
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══ ENVÍO MASIVO ═══ */}
      {tab === 'masivo' && (
        <div style={estilos.card}>
          <h3 style={{ marginTop: 0 }}>📢 Enviar mensaje a todos los clientes</h3>
          <p style={{ color: '#666', fontSize: 14 }}>
            Selecciona una plantilla aprobada por Meta y se enviará a todos los clientes registrados con número de teléfono.
          </p>

          <label style={estilos.label}>Plantilla de mensaje</label>
          <select
            value={plantillaSeleccionada}
            onChange={e => setPlantillaSeleccionada(e.target.value)}
            style={estilos.select}
          >
            <option value="">— Selecciona una plantilla —</option>
            {plantillas.filter(p => p.status === 'APPROVED' || p.status?.includes?.('APPROVED')).map(p => (
              <option key={p.id} value={p.name}>
                {p.name} ({p.category}) — {p.language}
              </option>
            ))}
          </select>

          {plantillas.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                Plantillas disponibles: {plantillas.filter(p => p.status === 'APPROVED' || p.status?.includes?.('APPROVED')).length} aprobadas,{' '}
                {plantillas.filter(p => p.status === 'PENDING').length} pendientes,{' '}
                {plantillas.filter(p => p.status === 'REJECTED').length} rechazadas
              </p>
            </div>
          )}

          <button
            onClick={enviarMasivo}
            disabled={enviando || !plantillaSeleccionada}
            style={{
              ...estilos.btnEnviar,
              opacity: enviando || !plantillaSeleccionada ? 0.5 : 1,
              cursor: enviando || !plantillaSeleccionada ? 'not-allowed' : 'pointer',
            }}
          >
            {enviando ? '⏳ Enviando...' : '📢 Enviar a todos los clientes'}
          </button>
        </div>
      )}

      {/* ═══ ENVÍO INDIVIDUAL ═══ */}
      {tab === 'individual' && (
        <div style={estilos.card}>
          <h3 style={{ marginTop: 0 }}>💬 Enviar mensaje individual</h3>
          <p style={{ color: '#666', fontSize: 14 }}>
            Envía un mensaje de texto directo a un número de WhatsApp. Solo funciona dentro de la ventana de 24 horas (el cliente debe haber escrito primero).
          </p>

          <label style={estilos.label}>Número de teléfono (sin código de país)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 'bold', color: '#666' }}>+57</span>
            <input
              type="text"
              value={telefono}
              onChange={e => setTelefono(e.target.value)}
              placeholder="3102712085"
              style={estilos.input}
            />
          </div>

          <label style={{ ...estilos.label, marginTop: 12 }}>Mensaje</label>
          <textarea
            value={mensaje}
            onChange={e => setMensaje(e.target.value)}
            placeholder="Escribe tu mensaje aquí..."
            style={estilos.textarea}
          />

          <button
            onClick={enviarIndividual}
            disabled={enviando || !telefono || !mensaje}
            style={{
              ...estilos.btnEnviar,
              opacity: enviando || !telefono || !mensaje ? 0.5 : 1,
              cursor: enviando || !telefono || !mensaje ? 'not-allowed' : 'pointer',
            }}
          >
            {enviando ? '⏳ Enviando...' : '💬 Enviar mensaje'}
          </button>
        </div>
      )}

      {/* ═══ HISTORIAL ═══ */}
      {tab === 'historial' && (
        <div style={estilos.card}>
          <h3 style={{ marginTop: 0 }}>📋 Historial de envíos masivos</h3>
          {historial.length === 0 ? (
            <p style={{ color: '#999' }}>No hay envíos masivos registrados</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Plantilla</th>
                  <th>Clientes</th>
                  <th>Enviados</th>
                  <th>Errores</th>
                  <th>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {historial.map(h => (
                  <tr key={h.id}>
                    <td><strong>{h.plantilla}</strong></td>
                    <td>{h.totalClientes}</td>
                    <td style={{ color: '#2E7D32', fontWeight: 'bold' }}>✅ {h.enviados}</td>
                    <td style={{ color: h.errores > 0 ? '#E53935' : '#999', fontWeight: 'bold' }}>
                      {h.errores > 0 ? `❌ ${h.errores}` : '—'}
                    </td>
                    <td>{new Date(h.creadoEn).toLocaleString('es-CO')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ═══ RESULTADO ═══ */}
      {resultado && (
        <div style={{
          ...estilos.card,
          marginTop: 20,
          borderLeft: `5px solid ${resultado.error ? '#E53935' : '#2E7D32'}`,
          background: resultado.error ? '#FFEBEE' : '#E8F5E9',
        }}>
          {resultado.error ? (
            <p style={{ color: '#E53935', fontWeight: 'bold', margin: 0 }}>
              ❌ Error: {typeof resultado.error === 'string' ? resultado.error : JSON.stringify(resultado.error)}
            </p>
          ) : (
            <div>
              <p style={{ color: '#2E7D32', fontWeight: 'bold', margin: '0 0 8px' }}>
                ✅ {resultado.message}
              </p>
              {resultado.enviados !== undefined && (
                <p style={{ margin: 0, color: '#333' }}>
                  📊 Total: {resultado.totalClientes} clientes | Enviados: {resultado.enviados} | Errores: {resultado.errores}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ INFO DE PLANTILLAS ═══ */}
      <div style={{ ...estilos.card, marginTop: 20, background: '#F5F5F5' }}>
        <h3 style={{ marginTop: 0, fontSize: 15 }}>📝 Tus plantillas</h3>
        {plantillas.length === 0 ? (
          <p style={{ color: '#999' }}>No se pudieron cargar las plantillas</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {plantillas.map(p => (
              <div key={p.id} style={{
                background: '#fff', borderRadius: 10, padding: 12,
                borderLeft: `4px solid ${p.status === 'APPROVED' ? '#2E7D32' : p.status === 'PENDING' ? '#FFC107' : '#E53935'}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{p.name}</strong>
                  <span style={{
                    fontSize: 11, padding: '3px 8px', borderRadius: 6, fontWeight: 'bold',
                    background: p.status === 'APPROVED' ? '#E8F5E9' : p.status === 'PENDING' ? '#FFF8E1' : '#FFEBEE',
                    color: p.status === 'APPROVED' ? '#2E7D32' : p.status === 'PENDING' ? '#F57F17' : '#E53935',
                  }}>
                    {p.status === 'APPROVED' ? '✅ Aprobada' : p.status === 'PENDING' ? '⏳ Pendiente' : '❌ Rechazada'}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#888', margin: '4px 0 0' }}>
                  Categoría: {p.category} | Idioma: {p.language}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const estilos = {
  card: {
    background: '#fff',
    borderRadius: 16,
    padding: 24,
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
  },
  label: {
    display: 'block',
    fontSize: 12,
    color: '#888',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  select: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '2px solid #ddd',
    fontSize: 14,
    cursor: 'pointer',
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: 10,
    border: '2px solid #ddd',
    fontSize: 14,
  },
  textarea: {
    width: '100%',
    padding: '12px 14px',
    borderRadius: 10,
    border: '2px solid #ddd',
    fontSize: 14,
    minHeight: 100,
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  btnEnviar: {
    marginTop: 16,
    background: '#25D366',
    color: '#fff',
    border: 'none',
    borderRadius: 10,
    padding: '14px 28px',
    fontSize: 15,
    fontWeight: 'bold',
  },
};
