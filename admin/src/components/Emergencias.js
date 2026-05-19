import React, { useEffect, useState } from 'react';
import api from '../api';

const ESTADO_COLOR = {
  activa: '#E53935',
  resuelta: '#2E7D32',
};

export default function Emergencias() {
  const [emergencias, setEmergencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtro, setFiltro] = useState('todas');
  const [notaResolver, setNotaResolver] = useState('');
  const [resolviendoId, setResolviendoId] = useState(null);

  const cargar = () => {
    api.get('/emergencia/activas')
      .then(res => setEmergencias(res.data))
      .catch(() => {})
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 1000); // Actualizar cada 1 segundo en tiempo real
    return () => clearInterval(intervalo);
  }, []);

  const resolver = async (id) => {
    try {
      await api.put(`/emergencia/${id}/resolver`, { nota: notaResolver });
      setResolviendoId(null);
      setNotaResolver('');
      cargar();
    } catch {
      alert('Error al resolver emergencia');
    }
  };

  const activas = emergencias.filter(e => e.estado === 'activa').length;
  const filtradas = filtro === 'todas' ? emergencias
    : filtro === 'activa' ? emergencias.filter(e => e.estado === 'activa')
    : emergencias.filter(e => e.estado === 'resuelta');

  if (cargando) return <p className="loading">Cargando emergencias...</p>;

  return (
    <div>
      <h2 className="titulo">
        🚨 Emergencias
        {activas > 0 && (
          <span style={estilos.alertaBadge}>
            {activas} activa{activas > 1 ? 's' : ''}
          </span>
        )}
      </h2>

      <div className="stats">
        <div className="stat-card">
          <div className="num">{emergencias.length}</div>
          <div className="label">Total</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#E53935' }}>{activas}</div>
          <div className="label">Activas</div>
        </div>
        <div className="stat-card">
          <div className="num" style={{ color: '#2E7D32' }}>
            {emergencias.filter(e => e.estado === 'resuelta').length}
          </div>
          <div className="label">Resueltas</div>
        </div>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
        {['todas', 'activa', 'resuelta'].map(f => (
          <button key={f} onClick={() => setFiltro(f)} style={{
            padding: '8px 18px', borderRadius: 8, border: '2px solid #E53935',
            background: filtro === f ? '#E53935' : '#fff',
            color: filtro === f ? '#fff' : '#E53935',
            fontWeight: 'bold', cursor: 'pointer',
          }}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {filtradas.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#999', padding: 40 }}>
          No hay emergencias {filtro !== 'todas' ? filtro + 's' : ''}
        </p>
      ) : (
        filtradas.map(e => (
          <div key={e.id} style={{
            ...estilos.emergenciaCard,
            borderLeftColor: ESTADO_COLOR[e.estado] || '#999',
          }}>
            <div style={estilos.emergenciaHeader}>
              <div>
                <span style={{
                  ...estilos.estadoBadge,
                  background: ESTADO_COLOR[e.estado],
                }}>
                  {e.estado === 'activa' ? '🚨 ACTIVA' : '✅ RESUELTA'}
                </span>
                <span style={estilos.fecha}>
                  {new Date(e.creadoEn).toLocaleString('es-CO')}
                </span>
              </div>
            </div>

            <div style={estilos.emergenciaGrid}>
              <div>
                <p style={estilos.label}>Reportado por</p>
                <p style={estilos.valor}>
                  {e.rol === 'cliente' ? '👤' : '🚕'} {e.nombre} ({e.rol})
                </p>
              </div>
              <div>
                <p style={estilos.label}>Teléfono</p>
                <p style={estilos.valor}>{e.telefono || '—'}</p>
              </div>
              {e.ubicacion && (
                <div>
                  <p style={estilos.label}>Ubicación</p>
                  <a
                    href={`https://www.google.com/maps?q=${e.ubicacion.lat},${e.ubicacion.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={estilos.linkMapa}
                  >
                    📌 Ver en mapa ({e.ubicacion.lat.toFixed(4)}, {e.ubicacion.lng.toFixed(4)})
                  </a>
                </div>
              )}
              <div>
                <p style={estilos.label}>Mensaje</p>
                <p style={estilos.valor}>{e.mensaje}</p>
              </div>
            </div>

            {e.servicio && (
              <div style={estilos.servicioInfo}>
                <p style={estilos.label}>Servicio asociado</p>
                <p style={estilos.valor}>
                  {e.servicio.clienteNombre} → {e.servicio.conductorNombre || 'Sin conductor'}
                </p>
                <p style={estilos.valor}>
                  📍 {e.servicio.origen} → 🏁 {e.servicio.destino}
                </p>
                {e.servicio.conductorPlaca && (
                  <p style={{ ...estilos.valor, color: '#FFC107', fontWeight: 'bold' }}>
                    Placa: {e.servicio.conductorPlaca}
                  </p>
                )}
              </div>
            )}

            {e.estado === 'activa' && (
              <div style={estilos.resolverSection}>
                {resolviendoId === e.id ? (
                  <div>
                    <textarea
                      placeholder="Nota de resolución (opcional)"
                      value={notaResolver}
                      onChange={(ev) => setNotaResolver(ev.target.value)}
                      style={estilos.textarea}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => resolver(e.id)} style={estilos.btnResolver}>
                        ✅ Confirmar resolución
                      </button>
                      <button onClick={() => { setResolviendoId(null); setNotaResolver(''); }}
                        style={estilos.btnCancelar}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setResolviendoId(e.id)} style={estilos.btnResolver}>
                    Marcar como resuelta
                  </button>
                )}
              </div>
            )}

            {e.estado === 'resuelta' && e.nota && (
              <div style={estilos.notaResolucion}>
                <p style={estilos.label}>Nota de resolución</p>
                <p style={estilos.valor}>{e.nota}</p>
                <p style={{ fontSize: 12, color: '#aaa' }}>
                  Resuelta el {new Date(e.resueltaEn).toLocaleString('es-CO')}
                </p>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

const estilos = {
  alertaBadge: {
    marginLeft: 12, background: '#E53935', color: '#fff',
    padding: '4px 12px', borderRadius: 12, fontSize: 13, fontWeight: 'bold',
  },
  emergenciaCard: {
    background: '#fff', borderRadius: 16, padding: 20,
    marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
    borderLeft: '5px solid',
  },
  emergenciaHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16,
  },
  estadoBadge: {
    color: '#fff', padding: '4px 12px', borderRadius: 8,
    fontSize: 12, fontWeight: 'bold', marginRight: 12,
  },
  fecha: { fontSize: 13, color: '#999' },
  emergenciaGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12,
  },
  label: { fontSize: 11, color: '#999', textTransform: 'uppercase', marginBottom: 2 },
  valor: { fontSize: 14, color: '#333', fontWeight: '500' },
  linkMapa: { fontSize: 13, color: '#1565C0', textDecoration: 'none', fontWeight: '600' },
  servicioInfo: {
    background: '#f9f9f9', borderRadius: 10, padding: 12, marginBottom: 12,
  },
  resolverSection: { marginTop: 12 },
  textarea: {
    width: '100%', border: '2px solid #ddd', borderRadius: 8,
    padding: 10, fontSize: 14, marginBottom: 10, minHeight: 60,
    resize: 'vertical', fontFamily: 'inherit',
  },
  btnResolver: {
    background: '#2E7D32', color: '#fff', border: 'none',
    borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: 14,
  },
  btnCancelar: {
    background: '#fff', color: '#666', border: '2px solid #ddd',
    borderRadius: 8, padding: '10px 20px', cursor: 'pointer',
    fontWeight: 'bold', fontSize: 14,
  },
  notaResolucion: {
    background: '#E8F5E9', borderRadius: 10, padding: 12, marginTop: 8,
  },
};
