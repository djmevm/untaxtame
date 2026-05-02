import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

export default function LoginAdmin({ errorExterno }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [intentos, setIntentos] = useState(0);
  const [bloqueado, setBloqueado] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    // Bloqueo local después de 5 intentos
    if (intentos >= 5) {
      setBloqueado(true);
      setError('Demasiados intentos. Espera 5 minutos.');
      setTimeout(() => { setBloqueado(false); setIntentos(0); }, 5 * 60 * 1000);
      return;
    }

    // Validar email
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Formato de correo inválido');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setCargando(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setIntentos(0);
    } catch (err) {
      setIntentos(prev => prev + 1);
      console.error('Login error:', err);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Correo o contraseña incorrectos (' + (5 - intentos - 1) + ' intentos restantes)');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Cuenta bloqueada temporalmente por demasiados intentos. Intenta más tarde.');
      } else {
        setError('Error de conexión. Intenta de nuevo.');
      }
    } finally {
      setCargando(false);
    }
  };

  return (
    <div style={styles.fondo}>
      <div style={styles.card}>
        <div style={styles.header}>
          <h1 style={styles.titulo}>🚕 UntaXtame</h1>
          <p style={styles.subtitulo}>Panel de Administración</p>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <label style={styles.label}>Correo electrónico</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@untaxtame.com"
            style={styles.input}
            required
          />

          <label style={styles.label}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={styles.input}
            required
          />

          {error && <p style={styles.error}>{error}</p>}

          <button type="submit" style={styles.btn} disabled={cargando || bloqueado}>
            {bloqueado ? '🔒 Bloqueado' : cargando ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <p style={styles.nota}>
          Solo usuarios con rol de administrador pueden acceder.
        </p>
      </div>
    </div>
  );
}

const styles = {
  fondo: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #FFC107 0%, #FF9800 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    background: '#fff',
    borderRadius: 20,
    padding: 40,
    width: '100%',
    maxWidth: 420,
    boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
  },
  header: {
    textAlign: 'center',
    marginBottom: 32,
  },
  titulo: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000',
    margin: 0,
  },
  subtitulo: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    border: '2px solid #eee',
    borderRadius: 10,
    padding: '12px 16px',
    fontSize: 16,
    marginBottom: 20,
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  btn: {
    background: '#FFC107',
    color: '#000',
    border: 'none',
    borderRadius: 10,
    padding: '14px',
    fontSize: 16,
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: 8,
  },
  error: {
    color: '#E53935',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
    fontWeight: '600',
  },
  nota: {
    textAlign: 'center',
    color: '#aaa',
    fontSize: 12,
    marginTop: 20,
  },
};
