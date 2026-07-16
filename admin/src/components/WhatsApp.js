import React, { useEffect, useState } from 'react';
import api from '../api';

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
  const [tab, setTab] = useState('masivo'); // masivo | individual | historial

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    try {
      const [plantillasRes, historialRes] = await Promise.all([
        api.get('/whatsapp/plantillas').catch(() => ({ data: [] })),
        api.get('/whatsapp/historial-masivos').catch(() => ({ data: [] })),
      ]);
      const plantillasData = Array.isArray(plantillasRes.data) ? plantillasRes.data : [];
      const historialData = Array.isArray(historialRes.data) ? historialRes.data : [];
      setPlantillas(plantillasData);
      setHistorial(historialData);
    } catch {
      setPlantillas([]);
      setHistorial([]);
    } finally {
      setCargando(false);
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
      const res = await api.post('/whatsapp/enviar-masivo', {
        plantilla: plantillaSeleccionada,
        idioma: 'es',
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          { key: 'masivo', label: '📢 Envío Masivo' },
          { key: 'individual', label: '💬 Mensaje Individual' },
          { key: 'historial', label: '📋 Historial' },
        ].map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); setResultado(null); }} style={{
            padding: '10px 20px', borderRadius: 10, border: '2px solid #25D366',
            background: tab === t.key ? '#25D366' : '#fff',
            color: tab === t.key ? '#fff' : '#333',
            fontWeight: 'bold', cursor: 'pointer', fontSize: 14,
          }}>
            {t.label}
          </button>
        ))}
      </div>

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
            {plantillas.filter(p => p.status === 'APPROVED').map(p => (
              <option key={p.id} value={p.name}>
                {p.name} ({p.category}) — {p.language}
              </option>
            ))}
          </select>

          {plantillas.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, color: '#888', margin: 0 }}>
                Plantillas disponibles: {plantillas.filter(p => p.status === 'APPROVED').length} aprobadas,{' '}
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
