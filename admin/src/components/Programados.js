import React, { useEffect, useState } from 'react';
import api from '../api';

const ESTADO_INFO = {
  programado_buscando: { label: '🔍 Buscando conductor', color: '#F57F17', bg: '#FFF3E0' },
  programado_asignado: { label: '✅ Asignado', color: '#2E7D32', bg: '#E8F5E9' },
  completado_auto: { label: '🏁 Completado', color: '#1565C0', bg: '#E3F2FD' },
  completado: { label: '🏁 Completado', color: '#1565C0', bg: '#E3F2FD' },
  cancelado: { label: '❌ Cancelado', color: '#B71C1C', bg: '#FFEBEE' },
};

function estadoInfo(estado) {
  return ESTADO_INFO[estado] || { label: estado || '—', color: '#555', bg: '#f0f0f0' };
}

function textoHora(v) {
  if (v.horaProgramadaTexto) return v.horaProgramadaTexto;
  if (v.horaProgramada) {
    try {
      return new Date(v.horaProgramada).toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    } catch { return v.horaProgramada; }
  }
  return '—';
}

export default function Programados() {
  const [viajes, setViajes] = useState([]);
  const [conductores, setConductores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [filtro, setFiltro] = useState('todos');
  const [accionId, setAccionId] = useState(null);
  const [modalReasignar, setModalReasignar] = useState(null);

  const cargar = () => {
    api.get('/programados/todos')
      .then((res) => setViajes(res.data || []))
      .catch(() => {})
      .finally(() => setCargando(false));
  };

  const cargarConductores = () => {
    api.get('/users/todos')
      .then((res) => {
        const lista = (res.data || []).filter(
          (u) => u.rol === 'conductor' && u.estadoVerificacion === 'aprobado' && !u.bloqueado
        );
        setConductores(lista);
      })
      .catch(() => {});
  };

  const cancelarAdmin = async (v) => {
    const motivo = window.prompt(
      `Cancelar ${v.codigoReserva || 'viaje'}?\n\nMotivo (opcional):`,
      'Cancelado por la central'
    );
    if (motivo === null) return;
    setAccionId(v.id);
    try {
      await api.put(`/programados/admin-cancelar/${v.id}`, { motivo: motivo || 'Cancelado por la central' });
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo cancelar');
    } finally {
      setAccionId(null);
    }
  };

  const liberar = async (v) => {
    if (!window.confirm(`¿Liberar ${v.codigoReserva || 'viaje'} y volver a buscar conductor?`)) return;
    setAccionId(v.id);
    try {
      await api.put(`/programados/reasignar/${v.id}`, { conductorUid: null, motivo: 'Liberado por central' });
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo liberar');
    } finally {
      setAccionId(null);
    }
  };

  const asignarConductor = async (viajeId, conductorUid) => {
    setAccionId(viajeId);
    try {
      await api.put(`/programados/reasignar/${viajeId}`, {
        conductorUid,
        motivo: 'Asignado manualmente por central',
      });
      setModalReasignar(null);
      cargar();
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo asignar');
    } finally {
      setAccionId(null);
    }
  };

  const eliminar = async (v) => {
    const codigo = v.codigoReserva || 'este viaje';
    if (!window.confirm(`¿Eliminar definitivamente ${codigo}?\n\nEsta acción no se puede deshacer.`)) return;
    setAccionId(v.id);
    try {
      await api.delete(`/programados/${v.id}`);
      setViajes((prev) => prev.filter((x) => x.id !== v.id));
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo eliminar el viaje.');
    } finally {
      setAccionId(null);
    }
  };

  useEffect(() => {
    cargar();
    cargarConductores();
    const intervalo = setInterval(cargar, 15000);
    return () => clearInterval(intervalo);
  }, []);

  const filtrados = filtro === 'todos'
    ? viajes
    : viajes.filter((v) => v.estado === filtro);

  const contar = (estado) => viajes.filter((v) => v.estado === estado).length;
  const activo = (v) => ['programado_buscando', 'programado_asignado'].includes(v.estado);

  if (cargando) return <p className="loading">Cargando viajes programados...</p>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 className="titulo" style={{ marginBottom: 0 }}>⏰ Viajes Programados</h2>
        <button onClick={() => setMostrarForm(true)} style={styles.btnCrear}>➕ Crear viaje programado</button>
      </div>

      <div className="stats">
        <div className="stat-card"><div className="num">{viajes.length}</div><div className="label">Total</div></div>
        <div className="stat-card"><div className="num" style={{ color: '#F57F17' }}>{contar('programado_buscando')}</div><div className="label">Buscando</div></div>
        <div className="stat-card"><div className="num" style={{ color: '#2E7D32' }}>{contar('programado_asignado')}</div><div className="label">Asignados</div></div>
        <div className="stat-card"><div className="num" style={{ color: '#B71C1C' }}>{contar('cancelado')}</div><div className="label">Cancelados</div></div>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { k: 'todos', l: 'Todos' },
          { k: 'programado_buscando', l: '🔍 Buscando' },
          { k: 'programado_asignado', l: '✅ Asignados' },
          { k: 'cancelado', l: '❌ Cancelados' },
        ].map((f) => (
          <button key={f.k} onClick={() => setFiltro(f.k)} style={{
            padding: '8px 16px', borderRadius: 8, border: '2px solid #FFC107',
            background: filtro === f.k ? '#FFC107' : '#fff', fontWeight: 'bold', cursor: 'pointer',
          }}>{f.l}</button>
        ))}
      </div>

      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Fecha y hora</th>
            <th>Origen → Destino</th>
            <th>Pasajero</th>
            <th>Contacto</th>
            <th>Conductor</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.length === 0 && (
            <tr><td colSpan="8" style={{ textAlign: 'center', color: '#999' }}>Sin viajes programados</td></tr>
          )}
          {filtrados.map((v) => {
            const ei = estadoInfo(v.estado);
            const busy = accionId === v.id;
            return (
              <tr key={v.id}>
                <td style={{ fontWeight: 'bold', fontSize: 12 }}>{v.codigoReserva || '—'}</td>
                <td>{textoHora(v)}</td>
                <td style={{ fontSize: 13 }}>📍 {v.origen}<br />🎯 {v.destino}</td>
                <td>{v.pasajeroNombre || v.clienteNombre || '—'}</td>
                <td>{v.contacto || v.clienteCelular || '—'}</td>
                <td>
                  {v.conductorNombre
                    ? <>{v.conductorNombre}<br /><span style={{ color: '#F97316', fontWeight: 'bold' }}>{v.conductorPlaca || ''}</span></>
                    : <span style={{ color: '#F57F17' }}>Sin asignar</span>}
                </td>
                <td>
                  <span style={{ background: ei.bg, color: ei.color, padding: '4px 10px', borderRadius: 10, fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {ei.label}
                  </span>
                </td>
                <td>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {activo(v) && (
                      <>
                        <button
                          onClick={() => { setModalReasignar(v); cargarConductores(); }}
                          disabled={busy}
                          style={styles.btnAsignar}
                        >
                          {v.conductorUid ? '🔄 Reasignar' : '👤 Asignar'}
                        </button>
                        {v.conductorUid && (
                          <button onClick={() => liberar(v)} disabled={busy} style={styles.btnLiberar}>
                            🔓 Liberar
                          </button>
                        )}
                        <button onClick={() => cancelarAdmin(v)} disabled={busy} style={styles.btnCancelarViaje}>
                          ❌ Cancelar
                        </button>
                      </>
                    )}
                    <button onClick={() => eliminar(v)} disabled={busy} style={styles.btnEliminar}>
                      {busy ? '⏳' : '🗑️ Eliminar'}
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {mostrarForm && (
        <FormularioProgramado
          onCerrar={() => setMostrarForm(false)}
          onCreado={() => { setMostrarForm(false); cargar(); }}
        />
      )}

      {modalReasignar && (
        <div style={styles.overlay} onClick={() => setModalReasignar(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>👤 Asignar / reasignar conductor</h3>
            <p style={{ color: '#666', fontSize: 13 }}>
              Viaje <strong>{modalReasignar.codigoReserva || modalReasignar.id}</strong><br />
              {modalReasignar.origen} → {modalReasignar.destino}
            </p>
            {conductores.length === 0 && (
              <p style={{ color: '#999' }}>No hay conductores aprobados disponibles.</p>
            )}
            <div style={{ maxHeight: 320, overflowY: 'auto' }}>
              {conductores.map((c) => (
                <button
                  key={c.uid}
                  onClick={() => asignarConductor(modalReasignar.id, c.uid)}
                  disabled={accionId === modalReasignar.id}
                  style={{
                    ...styles.conductorItem,
                    background: c.uid === modalReasignar.conductorUid ? '#E8F5E9' : '#fff',
                  }}
                >
                  <strong>{c.nombre}</strong>
                  <span style={{ color: '#F97316', marginLeft: 8 }}>{c.placa || 'Sin placa'}</span>
                  {c.telefono && <span style={{ color: '#888', marginLeft: 8 }}>📞 {c.telefono}</span>}
                </button>
              ))}
            </div>
            <button onClick={() => setModalReasignar(null)} style={{ ...styles.btnCancelar, marginTop: 12 }}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function FormularioProgramado({ onCerrar, onCreado }) {
  const [form, setForm] = useState({
    fecha: '',
    hora: '',
    origen: '',
    destino: '',
    pasajeroNombre: '',
    contacto: '',
    cantidadPasajeros: '1',
    equipaje: '',
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const crear = async () => {
    setError('');
    if (!form.fecha || !form.hora) return setError('Indica la fecha y la hora del viaje.');
    if (!form.origen.trim() || !form.destino.trim()) return setError('Indica origen y destino.');
    if (!form.contacto.trim()) return setError('Indica el número de contacto del cliente.');

    const [anio, mes, dia] = form.fecha.split('-').map((n) => parseInt(n, 10));
    const [hh, mm] = form.hora.split(':').map((n) => parseInt(n, 10));
    const comoUTC = Date.UTC(anio, mes - 1, dia, hh, mm, 0, 0);
    const horaProgramada = new Date(comoUTC + 5 * 60 * 60 * 1000);

    const horaProgramadaTexto = horaProgramada.toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Bogota',
    });

    setGuardando(true);
    try {
      await api.post('/programados', {
        horaProgramada: horaProgramada.toISOString(),
        horaProgramadaTexto,
        clienteUid: null,
        clienteNombre: form.pasajeroNombre.trim() || null,
        clienteCelular: form.contacto.replace(/[^0-9]/g, '') || null,
        origen: form.origen.trim(),
        destino: form.destino.trim(),
        pasajeroNombre: form.pasajeroNombre.trim() || null,
        contacto: form.contacto.trim(),
        cantidadPasajeros: parseInt(form.cantidadPasajeros, 10) || 1,
        equipaje: form.equipaje.trim() || 'Ninguno',
      });
      onCreado();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el viaje.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onCerrar}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>➕ Crear viaje programado</h3>
        <p style={{ color: '#666', fontSize: 13, marginTop: 0 }}>
          Para agendar un viaje de un cliente que llama a la central.
        </p>

        <div style={styles.grid}>
          <div>
            <label style={styles.label}>📅 Fecha</label>
            <input type="date" value={form.fecha} onChange={(e) => set('fecha', e.target.value)} style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>⏰ Hora</label>
            <input type="time" value={form.hora} onChange={(e) => set('hora', e.target.value)} style={styles.input} />
          </div>
        </div>

        <label style={styles.label}>📍 Origen (recogida)</label>
        <input type="text" value={form.origen} onChange={(e) => set('origen', e.target.value)} placeholder="Ej: Cra 5 #12-34" style={styles.input} />

        <label style={styles.label}>🎯 Destino</label>
        <input type="text" value={form.destino} onChange={(e) => set('destino', e.target.value)} placeholder="Ej: Hospital" style={styles.input} />

        <div style={styles.grid}>
          <div>
            <label style={styles.label}>👤 Nombre del pasajero</label>
            <input type="text" value={form.pasajeroNombre} onChange={(e) => set('pasajeroNombre', e.target.value)} style={styles.input} />
          </div>
          <div>
            <label style={styles.label}>📞 Contacto (WhatsApp)</label>
            <input type="text" value={form.contacto} onChange={(e) => set('contacto', e.target.value)} style={styles.input} />
          </div>
        </div>

        <div style={styles.grid}>
          <div>
            <label style={styles.label}>🚗 Pasajeros</label>
            <select value={form.cantidadPasajeros} onChange={(e) => set('cantidadPasajeros', e.target.value)} style={styles.input}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={styles.label}>🧳 Equipaje / notas</label>
            <input type="text" value={form.equipaje} onChange={(e) => set('equipaje', e.target.value)} style={styles.input} />
          </div>
        </div>

        {error && <p style={{ color: '#B71C1C', fontWeight: 'bold', fontSize: 13 }}>⚠️ {error}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button onClick={crear} disabled={guardando} style={styles.btnGuardar}>
            {guardando ? 'Creando...' : '✅ Crear y notificar conductores'}
          </button>
          <button onClick={onCerrar} disabled={guardando} style={styles.btnCancelar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  btnCrear: { background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14 },
  btnEliminar: { background: '#B71C1C', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: 12, whiteSpace: 'nowrap' },
  btnCancelarViaje: { background: '#E65100', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 },
  btnAsignar: { background: '#1565C0', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 },
  btnLiberar: { background: '#F57F17', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontWeight: 'bold', fontSize: 12 },
  conductorItem: {
    display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', marginBottom: 6,
    border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 14,
  },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 },
  modal: { background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.3)' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  label: { display: 'block', fontSize: 12, color: '#666', fontWeight: '600', marginTop: 12, marginBottom: 4 },
  input: { width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14 },
  btnGuardar: { flex: 1, background: '#2E7D32', color: '#fff', border: 'none', borderRadius: 8, padding: '12px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14 },
  btnCancelar: { background: '#fff', color: '#666', border: '2px solid #ccc', borderRadius: 8, padding: '12px 20px', cursor: 'pointer', fontWeight: 'bold', fontSize: 14 },
};
