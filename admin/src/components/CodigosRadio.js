import React, { useState, useEffect, useRef } from 'react';
import api from '../api';

const PRIORIDAD_COLORES = {
  critica: { bg: '#1a1a1a', text: '#fff', border: '#E53935', badge: '#E53935' },
  alta: { bg: '#FFF3E0', text: '#E65100', border: '#FF9800', badge: '#FF9800' },
  media: { bg: '#FFF8E1', text: '#F57F17', border: '#FFC107', badge: '#FFC107' },
  info: { bg: '#E3F2FD', text: '#1565C0', border: '#1565C0', badge: '#1565C0' },
};

const CODIGOS_INFO = {
  '20-1': { emoji: '🚕', desc: 'Tomó el servicio' },
  '20-2': { emoji: '📍', desc: 'Recogió pasajero' },
  '20-3': { emoji: '✅', desc: 'Terminó servicio' },
  '20-4': { emoji: '❌', desc: 'Canceló servicio' },
  '20-13': { emoji: '🔧', desc: 'Varado' },
  '20-15': { emoji: '⚠️', desc: 'Carrera sospechosa' },
  '20-20': { emoji: '💀', desc: 'Muerto en la vía' },
};

export default function CodigosRadio() {
  const [codigos, setCodigos] = useState([]);
  const [stats, setStats] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todos'); // todos, pendientes, emergencia, operativo
  const [nota, setNota] = useState('');
  const [atendiendo, setAtendiendo] = useState(null);
  const audioRef = useRef(null);

  const cargar = async () => {
    try {
      const [codigosRes, statsRes] = await Promise.all([
        api.get('/radio/activos'),
        api.get('/radio/estadisticas'),
      ]);
      
      // Detectar nuevos códigos de alta prioridad
      const nuevos = codigosRes.data.filter(c => 
        !c.atendido && ['alta', 'critica'].includes(c.prioridad)
      );
      if (nuevos.length > codigos.filter(c => !c.atendido && ['alta', 'critica'].includes(c.prioridad)).length) {
        reproducirAlerta();
      }

      setCodigos(codigosRes.data);
      setStats(statsRes.data);
    } catch (err) {
      console.error('Error cargando códigos:', err);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 1000); // Actualizar cada 1 segundo
    return () => clearInterval(intervalo);
  }, []);

  const reproducirAlerta = () => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg');
      }
      audioRef.current.currentTime = 0;
      audioRef.current.volume = 1.0;
      audioRef.current.play().catch(() => {});
    } catch {}
  };

  const atenderCodigo = async (id) => {
    try {
      await api.put(`/radio/atender/${id}`, { nota });
      setAtendiendo(null);
      setNota('');
      cargar();
    } catch (err) {
      alert('Error al atender: ' + (err.response?.data?.error || err.message));
    }
  };

  const codigosFiltrados = codigos.filter(c => {
    if (filtro === 'pendientes') return !c.atendido;
    if (filtro === 'emergencia') return ['seguridad', 'emergencia'].includes(c.categoria);
    if (filtro === 'operativo') return c.categoria === 'operativo';
    return true;
  });

  const pendientes = codigos.filter(c => !c.atendido);
  const criticos = pendientes.filter(c => ['alta', 'critica'].includes(c.prioridad));

  if (cargando) return <div style={styles.loading}>Cargando códigos de radio...</div>;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.titulo}>📻 Códigos de Radio</h2>
        <div style={styles.badges}>
          {criticos.length > 0 && (
            <span style={styles.badgeCritico}>
              🚨 {criticos.length} URGENTE{criticos.length > 1 ? 'S' : ''}
            </span>
          )}
          <span style={styles.badgePendiente}>
            ⏳ {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Estadísticas del día */}
      {stats && (
        <div style={styles.statsRow}>
          <div style={styles.statCard}>
            <span style={styles.statNumero}>{stats.total}</span>
            <span style={styles.statLabel}>Hoy</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statNumero}>{stats.pendientes}</span>
            <span style={styles.statLabel}>Pendientes</span>
          </div>
          {Object.entries(stats.porCodigo || {}).map(([cod, cant]) => (
            <div key={cod} style={styles.statCard}>
              <span style={styles.statNumero}>{cant}</span>
              <span style={styles.statLabel}>{cod}</span>
            </div>
          ))}
        </div>
      )}

      {/* Filtros */}
      <div style={styles.filtros}>
        {['todos', 'pendientes', 'emergencia', 'operativo'].map(f => (
          <button
            key={f}
            style={{
              ...styles.filtroBtn,
              ...(filtro === f ? styles.filtroBtnActivo : {}),
            }}
            onClick={() => setFiltro(f)}
          >
            {f === 'todos' ? '📋 Todos' : f === 'pendientes' ? '⏳ Pendientes' : f === 'emergencia' ? '🚨 Emergencias' : '🚕 Operativos'}
          </button>
        ))}
      </div>

      {/* Lista de códigos */}
      <div style={styles.lista}>
        {codigosFiltrados.length === 0 ? (
          <div style={styles.vacio}>
            <p>📡 No hay códigos de radio {filtro !== 'todos' ? `(${filtro})` : ''}</p>
          </div>
        ) : (
          codigosFiltrados.map(codigo => {
            const colores = PRIORIDAD_COLORES[codigo.prioridad] || PRIORIDAD_COLORES.info;
            const info = CODIGOS_INFO[codigo.codigo] || { emoji: '📻', desc: codigo.codigo };
            
            return (
              <div
                key={codigo.id}
                style={{
                  ...styles.codigoCard,
                  backgroundColor: colores.bg,
                  borderLeftColor: colores.border,
                  opacity: codigo.atendido ? 0.6 : 1,
                }}
              >
                <div style={styles.codigoHeader}>
                  <div style={styles.codigoInfo}>
                    <span style={styles.codigoEmoji}>{info.emoji}</span>
                    <div>
                      <span style={{ ...styles.codigoCodigo, color: colores.text }}>
                        {codigo.codigo}
                      </span>
                      <span style={styles.codigoLabel}>{codigo.codigoLabel}</span>
                    </div>
                  </div>
                  <div style={styles.codigoMeta}>
                    <span style={{ ...styles.prioridadBadge, backgroundColor: colores.badge }}>
                      {codigo.prioridad.toUpperCase()}
                    </span>
                    {codigo.atendido && <span style={styles.atendidoBadge}>✓ Atendido</span>}
                  </div>
                </div>

                <div style={styles.codigoBody}>
                  <p style={styles.conductor}>
                    👤 <strong>{codigo.nombre}</strong>
                    {codigo.placa && <span> — 🚗 {codigo.placa}</span>}
                    {codigo.telefono && <span> — 📞 {codigo.telefono}</span>}
                  </p>
                  {codigo.servicio && (
                    <p style={styles.ruta}>
                      🗺️ {codigo.servicio.origen} → {codigo.servicio.destino}
                      {codigo.servicio.clienteNombre && <span> (👤 {codigo.servicio.clienteNombre})</span>}
                    </p>
                  )}
                  {codigo.ubicacion && (
                    <a
                      href={`https://www.google.com/maps?q=${codigo.ubicacion.lat},${codigo.ubicacion.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={styles.mapaLink}
                    >
                      📌 Ver ubicación en mapa
                    </a>
                  )}
                  <p style={styles.tiempo}>
                    🕐 {new Date(codigo.creadoEn).toLocaleString('es-CO', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                    })}
                  </p>
                </div>

                {/* Acciones */}
                {!codigo.atendido && (
                  <div style={styles.acciones}>
                    {atendiendo === codigo.id ? (
                      <div style={styles.atenderForm}>
                        <input
                          type="text"
                          placeholder="Nota (opcional)"
                          value={nota}
                          onChange={e => setNota(e.target.value)}
                          style={styles.notaInput}
                        />
                        <button style={styles.btnAtender} onClick={() => atenderCodigo(codigo.id)}>
                          ✓ Confirmar
                        </button>
                        <button style={styles.btnCancelar} onClick={() => setAtendiendo(null)}>
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        style={styles.btnMarcar}
                        onClick={() => setAtendiendo(codigo.id)}
                      >
                        ✓ Marcar como atendido
                      </button>
                    )}
                  </div>
                )}

                {codigo.atendido && codigo.nota && (
                  <p style={styles.notaAtendido}>📝 {codigo.nota}</p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const styles = {
  container: { padding: 20 },
  loading: { textAlign: 'center', padding: 40, color: '#666' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  titulo: { margin: 0, fontSize: 24 },
  badges: { display: 'flex', gap: 10 },
  badgeCritico: {
    backgroundColor: '#E53935', color: '#fff', padding: '6px 14px',
    borderRadius: 20, fontWeight: 'bold', fontSize: 13, animation: 'pulse 1s infinite',
  },
  badgePendiente: {
    backgroundColor: '#FFC107', color: '#000', padding: '6px 14px',
    borderRadius: 20, fontWeight: 'bold', fontSize: 13,
  },
  statsRow: {
    display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap',
  },
  statCard: {
    backgroundColor: '#f5f5f5', borderRadius: 10, padding: '12px 20px',
    textAlign: 'center', minWidth: 80,
  },
  statNumero: { display: 'block', fontSize: 22, fontWeight: 'bold', color: '#333' },
  statLabel: { fontSize: 11, color: '#888', textTransform: 'uppercase' },
  filtros: { display: 'flex', gap: 8, marginBottom: 20 },
  filtroBtn: {
    padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd',
    backgroundColor: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: '600',
  },
  filtroBtnActivo: {
    backgroundColor: '#1565C0', color: '#fff', borderColor: '#1565C0',
  },
  lista: { display: 'flex', flexDirection: 'column', gap: 12 },
  vacio: { textAlign: 'center', padding: 40, color: '#999' },
  codigoCard: {
    borderRadius: 12, padding: 16, borderLeft: '5px solid',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  codigoHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10,
  },
  codigoInfo: { display: 'flex', alignItems: 'center', gap: 12 },
  codigoEmoji: { fontSize: 28 },
  codigoCodigo: { display: 'block', fontSize: 18, fontWeight: 'bold' },
  codigoLabel: { display: 'block', fontSize: 13, color: '#666' },
  codigoMeta: { display: 'flex', gap: 8, alignItems: 'center' },
  prioridadBadge: {
    color: '#fff', padding: '3px 10px', borderRadius: 12, fontSize: 10, fontWeight: 'bold',
  },
  atendidoBadge: {
    backgroundColor: '#2E7D32', color: '#fff', padding: '3px 10px',
    borderRadius: 12, fontSize: 10, fontWeight: 'bold',
  },
  codigoBody: { marginBottom: 10 },
  conductor: { margin: '4px 0', fontSize: 14, color: '#333' },
  ruta: { margin: '4px 0', fontSize: 13, color: '#555' },
  mapaLink: { fontSize: 13, color: '#1565C0', textDecoration: 'none', fontWeight: '600' },
  tiempo: { margin: '4px 0', fontSize: 12, color: '#999' },
  acciones: { borderTop: '1px solid rgba(0,0,0,0.1)', paddingTop: 10 },
  atenderForm: { display: 'flex', gap: 8, alignItems: 'center' },
  notaInput: {
    flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 13,
  },
  btnAtender: {
    backgroundColor: '#2E7D32', color: '#fff', border: 'none',
    padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 'bold',
  },
  btnCancelar: {
    backgroundColor: '#eee', border: 'none', padding: '8px 12px',
    borderRadius: 8, cursor: 'pointer',
  },
  btnMarcar: {
    backgroundColor: 'transparent', border: '1px solid #2E7D32', color: '#2E7D32',
    padding: '6px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: '600',
  },
  notaAtendido: { fontSize: 12, color: '#666', fontStyle: 'italic', margin: '4px 0 0' },
};
