import React, { useEffect, useState } from 'react';
import api from '../api';

const VERIFICACION_COLOR = {
  pendiente: '#FFC107',
  aprobado: '#2E7D32',
  rechazado: '#E53935',
};

const BACKEND_URL = 'https://untaxtame-production.up.railway.app';

// Resolver URL de imagen: si es relativa (/uploads/...), agregar el host del backend
// Si es URL completa de Firebase Storage, usarla directamente
function resolverUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/uploads')) return `${BACKEND_URL}${url}`;
  return url;
}

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todos');
  const [seleccionado, setSeleccionado] = useState(null);

  const cargar = () => {
    api.get('/users/todos')
      .then(res => setUsuarios(res.data))
      .catch(() => {})
      .finally(() => setCargando(false));
  };

  useEffect(() => { cargar(); }, []);

  // Escuchar evento para abrir chat directo desde notificación
  useEffect(() => {
    const handler = (e) => {
      const uid = e.detail;
      if (uid) {
        const usuario = usuarios.find(u => u.uid === uid);
        if (usuario) setSeleccionado(usuario);
      }
    };
    window.addEventListener('abrirChat', handler);
    return () => window.removeEventListener('abrirChat', handler);
  }, [usuarios]);

  const verificar = async (uid, estado) => {
    try {
      await api.put(`/users/conductor/${uid}/verificacion`, { estado });
      cargar();
      setSeleccionado(null);
    } catch {
      alert('Error al actualizar verificación');
    }
  };

  const bloquearUsuario = async (uid, nombre, estaBloqueado) => {
    if (estaBloqueado) {
      if (window.confirm(`¿Desbloquear a ${nombre}?`)) {
        try {
          await api.put(`/users/${uid}/bloquear`, { bloqueado: false });
          cargar();
          setSeleccionado(null);
        } catch { alert('Error al desbloquear'); }
      }
    } else {
      const motivo = window.prompt(`Motivo para bloquear a ${nombre}:`, 'Falta grave');
      if (motivo !== null) {
        try {
          await api.put(`/users/${uid}/bloquear`, { bloqueado: true, motivo });
          cargar();
          setSeleccionado(null);
        } catch { alert('Error al bloquear'); }
      }
    }
  };

  const eliminarUsuario = async (uid, nombre, rol) => {
    if (!window.confirm(`⚠️ ¿Estás seguro de ELIMINAR a ${nombre} (${rol})?\n\nEsta acción es IRREVERSIBLE. Se eliminará de Firebase Auth y Firestore.`)) {
      return;
    }
    if (!window.confirm(`🔴 ÚLTIMA CONFIRMACIÓN\n\nSe eliminará permanentemente a:\n${nombre}\n\n¿Continuar?`)) {
      return;
    }
    try {
      await api.delete(`/users/${uid}`);
      alert(`✅ ${nombre} ha sido eliminado correctamente.`);
      cargar();
      setSeleccionado(null);
    } catch (err) {
      alert('Error al eliminar: ' + (err.response?.data?.error || err.message));
    }
  };

  const filtrados = filtro === 'todos' ? usuarios : usuarios.filter(u => u.rol === filtro);
  const pendientesVerificacion = usuarios.filter(u => u.rol === 'conductor' && u.estadoVerificacion === 'pendiente').length;

  if (cargando) return <p className="loading">Cargando usuarios...</p>;

  // ── DETALLE DE PERFIL (cliente o conductor) ──
  if (seleccionado) {
    const u = seleccionado;
    const esConductor = u.rol === 'conductor';

    return (
      <div>
        <button onClick={() => setSeleccionado(null)} style={styles.btnVolver}>← Volver a la lista</button>
        <h2 className="titulo">
          {esConductor ? '🚕 Perfil del Conductor' : '👤 Perfil del Cliente'}
        </h2>

        <div style={styles.perfilCard}>
          {/* Foto de perfil */}
          <div style={styles.fotoSection}>
            {u.fotoPerfil ? (
              <img src={resolverUrl(u.fotoPerfil)} alt="Foto de perfil" style={styles.fotoPerfil} />
            ) : (
              <div style={styles.fotoPlaceholder}>
                <span style={styles.fotoLetra}>{u.nombre?.charAt(0)?.toUpperCase() || '?'}</span>
              </div>
            )}
            <div>
              <h3 style={{ margin: 0, fontSize: 22 }}>{u.nombre}</h3>
              <span className={`badge ${u.rol}`} style={{ marginTop: 4, display: 'inline-block' }}>{u.rol?.toUpperCase()}</span>
            </div>
          </div>

          {/* Datos personales */}
          <h3 style={styles.subtitulo}>📋 Datos personales</h3>
          <div style={styles.perfilGrid}>
            <div style={styles.perfilItem}>
              <span style={styles.perfilLabel}>Nombre completo</span>
              <span style={styles.perfilValor}>{u.nombre || '—'}</span>
            </div>
            <div style={styles.perfilItem}>
              <span style={styles.perfilLabel}>Número de cédula</span>
              <span style={styles.perfilValor}>{u.cedula || '—'}</span>
            </div>
            <div style={styles.perfilItem}>
              <span style={styles.perfilLabel}>Número de celular</span>
              <span style={styles.perfilValor}>{u.telefono || '—'}</span>
            </div>
            <div style={styles.perfilItem}>
              <span style={styles.perfilLabel}>Fecha de registro</span>
              <span style={styles.perfilValor}>{u.creadoEn ? new Date(u.creadoEn).toLocaleDateString('es-CO') : '—'}</span>
            </div>

            {/* Campos de cliente */}
            {!esConductor && (
              <div style={styles.perfilItem}>
                <span style={styles.perfilLabel}>Dirección</span>
                <span style={styles.perfilValor}>{u.direccion || '—'}</span>
              </div>
            )}

            {/* Campos de conductor */}
            {esConductor && (
              <>
                <div style={styles.perfilItem}>
                  <span style={styles.perfilLabel}>Placa del taxi</span>
                  <span style={{ ...styles.perfilValor, color: '#FFC107', fontWeight: 'bold', letterSpacing: 2, fontSize: 18 }}>{u.placa || '—'}</span>
                </div>
                <div style={styles.perfilItem}>
                  <span style={styles.perfilLabel}>Estado verificación</span>
                  <span style={{
                    background: VERIFICACION_COLOR[u.estadoVerificacion] || '#999',
                    color: u.estadoVerificacion === 'pendiente' ? '#000' : '#fff',
                    padding: '4px 14px', borderRadius: 12, fontWeight: 'bold', fontSize: 13,
                    display: 'inline-block',
                  }}>
                    {u.estadoVerificacion?.toUpperCase() || 'PENDIENTE'}
                  </span>
                </div>
                <div style={styles.perfilItem}>
                  <span style={styles.perfilLabel}>Disponible</span>
                  <span style={styles.perfilValor}>{u.disponible ? '✅ Sí' : '🔴 No'}</span>
                </div>
              </>
            )}
          </div>

          {/* Reputación del conductor */}
          {esConductor && u.reputacion && (
            <div style={{ marginTop: 20 }}>
              <h3 style={styles.subtitulo}>⭐ Reputación</h3>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center', background: '#f9f9f9', borderRadius: 12, padding: 16 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 36, fontWeight: 'bold', color: u.reputacion.porcentaje >= 70 ? '#2E7D32' : u.reputacion.porcentaje >= 50 ? '#FFC107' : '#E53935' }}>
                    {u.reputacion.porcentaje}%
                  </div>
                  <div style={{ fontSize: 13, color: '#888' }}>Reputación</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ height: 12, background: '#eee', borderRadius: 6, overflow: 'hidden', marginBottom: 8 }}>
                    <div style={{ height: 12, borderRadius: 6, width: `${u.reputacion.porcentaje}%`, background: u.reputacion.porcentaje >= 70 ? '#2E7D32' : u.reputacion.porcentaje >= 50 ? '#FFC107' : '#E53935' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#888' }}>
                    <span>Promedio: {u.reputacion.promedio}/10</span>
                    <span>{u.reputacion.totalCalificaciones} calificaciones</span>
                    <span>{u.reputacion.totalServicios} servicios</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Documentos del conductor */}
          {/* Vencimiento de documentos */}
          {esConductor && u.vencimientoDocumentos && (
            <div style={{ marginTop: 20 }}>
              <h3 style={styles.subtitulo}>📅 Vencimiento de documentos</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { key: 'licencia', label: 'Licencia de conducción', icon: '📄' },
                  { key: 'soat', label: 'SOAT', icon: '🛡️' },
                  { key: 'tecnicomecanica', label: 'Revisión técnico-mecánica', icon: '🔧' },
                  { key: 'tarjetaOperacion', label: 'Tarjeta de operación', icon: '🚕' },
                ].map(({ key, label, icon }) => {
                  const fecha = u.vencimientoDocumentos?.[key];
                  const dias = fecha ? Math.ceil((new Date(fecha) - new Date()) / (1000 * 60 * 60 * 24)) : null;
                  const color = dias === null ? '#999' : dias < 0 ? '#B71C1C' : dias <= 30 ? '#E53935' : dias <= 60 ? '#FFC107' : '#2E7D32';
                  const texto = dias === null ? 'Sin fecha' : dias < 0 ? `VENCIDO (${Math.abs(dias)}d)` : `${dias} días`;

                  return (
                    <div key={key} style={{ background: '#f9f9f9', borderRadius: 10, padding: 12, borderLeft: `4px solid ${color}` }}>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: '600' }}>{icon} {label}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 14, fontWeight: 'bold', color }}>{texto}</p>
                      {fecha && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#aaa' }}>Vence: {new Date(fecha).toLocaleDateString('es-CO')}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Chat directo con el usuario */}
          <ChatDirectoAdmin uid={u.uid} nombre={u.nombre} />

          {esConductor && (
            <>
              <h3 style={styles.subtitulo}>📄 Documentos adjuntos</h3>
              <div style={styles.docsGrid}>
                {[
                  { key: 'cedulaFrente', label: 'Cédula (frente)' },
                  { key: 'cedulaReverso', label: 'Cédula (reverso)' },
                  { key: 'licencia', label: 'Licencia de conducción' },
                  { key: 'tarjetaPropiedad', label: 'Tarjeta de propiedad' },
                  { key: 'tarjetaOperacion', label: 'Tarjeta de operación' },
                ].map(({ key, label }) => (
                  <div key={key} style={styles.docItem}>
                    <p style={styles.docLabel}>{label}</p>
                    {u.documentos?.[key] ? (
                      <img src={resolverUrl(u.documentos[key])} alt={label} style={styles.docImg}
                        onClick={() => window.open(resolverUrl(u.documentos[key]), '_blank')} />
                    ) : (
                      <div style={styles.docVacio}>⚠️ Sin imagen</div>
                    )}
                  </div>
                ))}
              </div>

              {/* Acciones de verificación */}
              {u.estadoVerificacion === 'pendiente' && (
                <div style={styles.accionesVerif}>
                  <button style={styles.btnAprobar} onClick={() => verificar(u.uid, 'aprobado')}>
                    ✅ Aprobar conductor
                  </button>
                  <button style={styles.btnRechazar} onClick={() => verificar(u.uid, 'rechazado')}>
                    ❌ Rechazar
                  </button>
                </div>
              )}
              {u.estadoVerificacion === 'rechazado' && (
                <div style={styles.accionesVerif}>
                  <button style={styles.btnAprobar} onClick={() => verificar(u.uid, 'aprobado')}>
                    ✅ Cambiar a Aprobado
                  </button>
                </div>
              )}
              {u.estadoVerificacion === 'aprobado' && (
                <div style={styles.accionesVerif}>
                  <button style={styles.btnRechazar} onClick={() => verificar(u.uid, 'rechazado')}>
                    ❌ Revocar aprobación
                  </button>
                </div>
              )}
            </>
          )}

          {/* Estado de bloqueo */}
          {u.bloqueado && (
            <div style={{ background: '#FFEBEE', borderRadius: 12, padding: 16, marginTop: 20, borderLeft: '5px solid #B71C1C' }}>
              <p style={{ fontWeight: 'bold', color: '#B71C1C', margin: 0 }}>🚫 USUARIO BLOQUEADO</p>
              <p style={{ color: '#666', margin: '4px 0 0', fontSize: 14 }}>Motivo: {u.motivoBloqueo || '—'}</p>
              {u.bloqueadoEn && <p style={{ color: '#999', margin: '2px 0 0', fontSize: 12 }}>Desde: {new Date(u.bloqueadoEn).toLocaleString('es-CO')}</p>}
            </div>
          )}

          {/* Botón bloquear/desbloquear */}
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: '2px solid #f0f0f0', display: 'flex', gap: 12 }}>
            <button
              onClick={() => bloquearUsuario(u.uid, u.nombre, u.bloqueado)}
              style={{
                background: u.bloqueado ? '#2E7D32' : '#B71C1C',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '12px 24px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14,
              }}
            >
              {u.bloqueado ? '✅ Desbloquear usuario' : '🚫 Bloquear usuario'}
            </button>
            <button
              onClick={() => eliminarUsuario(u.uid, u.nombre, u.rol)}
              style={{
                background: '#fff', color: '#B71C1C', border: '2px solid #B71C1C',
                borderRadius: 8, padding: '12px 24px', cursor: 'pointer',
                fontWeight: 'bold', fontSize: 14,
              }}
            >
              🗑️ Eliminar usuario
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── EXPORTAR CSV ──
  const exportarUsuariosCSV = () => {
    const headers = ['Nombre', 'Cédula', 'Celular', 'Rol', 'Placa', 'Dirección', 'Verificación', 'Disponible', 'Registro'];
    const filas = filtrados.map(u => [
      u.nombre || '', u.cedula || '', u.telefono || '', u.rol || '',
      u.placa || '', u.direccion || '', u.estadoVerificacion || '',
      u.rol === 'conductor' ? (u.disponible ? 'Sí' : 'No') : '',
      new Date(u.creadoEn).toLocaleDateString('es-CO'),
    ]);
    const csv = [headers.join(','), ...filas.map(f => f.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `usuarios_untaxtame_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // ── LISTA DE USUARIOS ──
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 className="titulo" style={{ marginBottom: 0 }}>
          Usuarios Registrados
          {pendientesVerificacion > 0 && (
            <span style={styles.alertaBadge}>{pendientesVerificacion} pendientes</span>
          )}
        </h2>
        <button onClick={exportarUsuariosCSV} style={styles.btnExportar}>📥 Exportar CSV</button>
      </div>

      <div className="stats">
        <div className="stat-card"><div className="num">{usuarios.length}</div><div className="label">Total</div></div>
        <div className="stat-card"><div className="num">{usuarios.filter(u => u.rol === 'cliente').length}</div><div className="label">Clientes</div></div>
        <div className="stat-card"><div className="num">{usuarios.filter(u => u.rol === 'conductor').length}</div><div className="label">Conductores</div></div>
        <div className="stat-card"><div className="num">{pendientesVerificacion}</div><div className="label">Por verificar</div></div>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        {['todos', 'cliente', 'conductor'].map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            padding: '8px 18px', borderRadius: 8, border: '2px solid #FFC107',
            background: filtro === f ? '#FFC107' : '#fff', fontWeight: 'bold', cursor: 'pointer'
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1) + 's'}
          </button>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Foto</th>
            <th>Nombre</th>
            <th>Cédula</th>
            <th>Celular</th>
            <th>Rol</th>
            <th>Placa</th>
            <th>Verificación</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.length === 0 && (
            <tr><td colSpan="8" style={{ textAlign: 'center', color: '#999' }}>Sin usuarios</td></tr>
          )}
          {filtrados.map(u => (
            <tr key={u.uid}>
              <td>
                {u.fotoPerfil ? (
                  <img src={resolverUrl(u.fotoPerfil)} alt="" style={{ width: 36, height: 36, borderRadius: 18, objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: 36, height: 36, borderRadius: 18,
                    background: u.rol === 'conductor' ? '#FFC107' : '#1565C0',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 'bold', fontSize: 14,
                  }}>
                    {u.nombre?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                )}
              </td>
              <td>{u.nombre}</td>
              <td>{u.cedula || '—'}</td>
              <td>{u.telefono}</td>
              <td><span className={`badge ${u.rol}`}>{u.rol}</span></td>
              <td>{u.placa || '—'}</td>
              <td>
                {u.rol === 'conductor'
                  ? <span style={{
                      background: VERIFICACION_COLOR[u.estadoVerificacion] || '#999',
                      color: u.estadoVerificacion === 'pendiente' ? '#000' : '#fff',
                      padding: '3px 10px', borderRadius: 10, fontSize: 12, fontWeight: 'bold'
                    }}>{u.estadoVerificacion?.toUpperCase() || 'PENDIENTE'}</span>
                  : '—'
                }
              </td>
              <td>
                <button onClick={() => setSeleccionado(u)} style={styles.btnVer}>
                  Ver perfil
                </button>
                {u.bloqueado && <span style={{ marginLeft: 6, color: '#B71C1C', fontWeight: 'bold', fontSize: 11 }}>🚫</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Componente de chat directo admin → usuario (con WebSocket)
function ChatDirectoAdmin({ uid, nombre }) {
  const [mensajes, setMensajes] = React.useState([]);
  const [texto, setTexto] = React.useState('');
  const [enviando, setEnviando] = React.useState(false);
  const [mostrar, setMostrar] = React.useState(false);
  const [wsConectado, setWsConectado] = React.useState(false);
  const wsRef = React.useRef(null);
  const intervaloRef = React.useRef(null);
  const chatEndRef = React.useRef(null);

  const cargar = async () => {
    try {
      const res = await api.get(`/chat/directo/${uid}/mensajes`);
      setMensajes(res.data);
    } catch {}
  };

  // WebSocket para recibir mensajes en tiempo real
  React.useEffect(() => {
    if (!mostrar) return;

    // Conectar WebSocket
    const adminUid = 'admin_panel'; // Identificador del admin
    try {
      const ws = new WebSocket(`wss://untaxtame-production.up.railway.app/ws?uid=${adminUid}&rol=admin`);
      ws.onopen = () => setWsConectado(true);
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.tipo === 'chat_directo' && (data.senderUid === uid || data.chatUid === uid)) {
            // Mensaje nuevo recibido del usuario
            setMensajes(prev => [...prev, {
              uid: data.senderUid,
              nombre: data.senderNombre,
              rol: data.senderRol === 'admin' ? 'admin' : 'usuario',
              texto: data.texto,
              creadoEn: new Date(data.timestamp).toISOString(),
            }]);
          }
        } catch {}
      };
      ws.onclose = () => setWsConectado(false);
      wsRef.current = ws;
    } catch {}

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConectado(false);
    };
  }, [mostrar, uid]);

  // Carga inicial + polling como fallback (30s con WS, 5s sin WS)
  React.useEffect(() => {
    if (!mostrar) {
      if (intervaloRef.current) clearInterval(intervaloRef.current);
      return;
    }
    cargar();
    const intervaloMs = wsConectado ? 30000 : 5000;
    intervaloRef.current = setInterval(cargar, intervaloMs);
    return () => { if (intervaloRef.current) clearInterval(intervaloRef.current); };
  }, [mostrar, uid, wsConectado]);

  // Auto-scroll al último mensaje
  React.useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [mensajes]);

  const enviar = async () => {
    if (!texto.trim() || enviando) return;
    const textoEnviar = texto.trim();
    setEnviando(true);
    setTexto('');

    // Agregar mensaje optimista inmediatamente
    const mensajeOptimista = {
      uid: 'admin',
      nombre: 'Administrador',
      rol: 'admin',
      texto: textoEnviar,
      creadoEn: new Date().toISOString(),
    };
    setMensajes(prev => [...prev, mensajeOptimista]);

    try {
      await api.post(`/chat/directo/${uid}/mensaje`, { texto: textoEnviar });
    } catch (err) {
      // Revertir mensaje optimista si falla
      setMensajes(prev => prev.filter(m => m !== mensajeOptimista));
      setTexto(textoEnviar);
      alert('Error: ' + (err.response?.data?.error || err.message));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div style={{ marginTop: 20, marginBottom: 20 }}>
      <button onClick={() => setMostrar(!mostrar)} style={{
        background: '#1565C0', color: '#fff', border: 'none', borderRadius: 10,
        padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14,
      }}>
        💬 {mostrar ? 'Ocultar chat' : `Mensaje directo a ${nombre}`}
        {wsConectado && mostrar && <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.8 }}>● En vivo</span>}
      </button>

      {mostrar && (
        <div style={{ marginTop: 12, background: '#f9f9f9', borderRadius: 14, padding: 16, border: '1px solid #eee' }}>
          {/* Indicador de conexión */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, fontSize: 11, color: wsConectado ? '#2E7D32' : '#999' }}>
            <span style={{ width: 8, height: 8, borderRadius: 4, background: wsConectado ? '#2E7D32' : '#ccc', display: 'inline-block' }}></span>
            {wsConectado ? 'Tiempo real activo' : 'Polling cada 5s'}
          </div>

          <div style={{ maxHeight: 350, overflowY: 'auto', marginBottom: 12 }}>
            {mensajes.length === 0 ? (
              <p style={{ color: '#999', textAlign: 'center' }}>Sin mensajes</p>
            ) : (
              mensajes.map((msg, i) => (
                <div key={msg.id || `m-${i}`} style={{
                  padding: '8px 12px', borderRadius: 10, marginBottom: 6, maxWidth: '80%',
                  background: msg.rol === 'admin' ? '#FFF3E0' : '#E3F2FD',
                  marginLeft: msg.rol === 'admin' ? 'auto' : 0,
                  borderLeft: `3px solid ${msg.rol === 'admin' ? '#F97316' : '#1565C0'}`,
                }}>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: '600' }}>
                    {msg.rol === 'admin' ? '🛡️ Admin' : `👤 ${msg.nombre || nombre}`}
                  </span>
                  <p style={{ margin: '4px 0 2px', fontSize: 14, color: '#333' }}>{msg.texto}</p>
                  <span style={{ fontSize: 10, color: '#bbb' }}>
                    {msg.creadoEn ? new Date(msg.creadoEn).toLocaleString('es-CO', { hour: '2-digit', minute: '2-digit', hour12: true }) : ''}
                  </span>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') enviar(); }}
              placeholder="Escribir mensaje..."
              style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14 }}
              disabled={enviando}
            />
            <button onClick={enviar} disabled={!texto.trim() || enviando} style={{
              background: texto.trim() ? '#F97316' : '#ddd', color: '#fff', border: 'none',
              borderRadius: 10, padding: '10px 18px', cursor: texto.trim() ? 'pointer' : 'default',
              fontWeight: 'bold',
            }}>
              Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  alertaBadge: {
    marginLeft: 12, background: '#FFC107', color: '#000',
    padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 'bold'
  },
  btnExportar: {
    background: '#2E7D32', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14,
  },
  btnVolver: {
    background: 'none', border: 'none', color: '#E53935',
    cursor: 'pointer', fontSize: 15, marginBottom: 16, fontWeight: 'bold'
  },
  btnVer: {
    background: '#1565C0', color: '#fff', border: 'none',
    borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 'bold'
  },
  perfilCard: {
    background: '#fff', borderRadius: 16, padding: 28,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)'
  },
  fotoSection: {
    display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24,
    paddingBottom: 20, borderBottom: '2px solid #f0f0f0',
  },
  fotoPerfil: {
    width: 80, height: 80, borderRadius: 40, objectFit: 'cover',
    border: '3px solid #FFC107',
  },
  fotoPlaceholder: {
    width: 80, height: 80, borderRadius: 40, background: '#FFC107',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  fotoLetra: { fontSize: 32, fontWeight: 'bold', color: '#000' },
  subtitulo: { marginTop: 24, marginBottom: 16, fontSize: 16, color: '#333' },
  perfilGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 },
  perfilItem: { display: 'flex', flexDirection: 'column', gap: 4 },
  perfilLabel: { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: 0.5 },
  perfilValor: { fontSize: 15, fontWeight: '600', color: '#222' },
  docsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 },
  docItem: { background: '#f9f9f9', borderRadius: 10, padding: 12 },
  docLabel: { fontSize: 13, fontWeight: '600', marginBottom: 8, color: '#444' },
  docImg: {
    width: '100%', height: 160, objectFit: 'contain', borderRadius: 8,
    background: '#fff', cursor: 'pointer', border: '1px solid #eee',
  },
  docVacio: {
    height: 120, background: '#eee', borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#999', fontSize: 13
  },
  accionesVerif: { display: 'flex', gap: 12, marginTop: 24 },
  btnAprobar: {
    background: '#2E7D32', color: '#fff', border: 'none',
    borderRadius: 8, padding: '12px 28px', cursor: 'pointer', fontWeight: 'bold', fontSize: 15
  },
  btnRechazar: {
    background: '#E53935', color: '#fff', border: 'none',
    borderRadius: 8, padding: '12px 28px', cursor: 'pointer', fontWeight: 'bold', fontSize: 15
  },
};
