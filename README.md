# 🚕 UntaXtame S.A.S

Aplicación de servicio de taxi con app móvil (React Native/Expo), panel de administración (React) y backend (Node.js/Express/Firebase).

## Estructura del proyecto

```
untaxtame/
├── backend/     → API REST con Express + Firebase Admin
├── app/         → App móvil con React Native + Expo
└── admin/       → Panel de administración con React
```

## Requisitos

- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- Proyecto Firebase configurado (Auth + Firestore + Storage)

## Configuración

### 1. Backend

```bash
cd untaxtame/backend
cp .env.example .env
# Editar .env con tus credenciales de Firebase
npm install
npm run dev
```

Variables de entorno necesarias:
- `PORT` — Puerto del servidor (default: 3000)
- `FIREBASE_PROJECT_ID` — ID del proyecto Firebase
- `FIREBASE_PRIVATE_KEY` — Clave privada del service account
- `FIREBASE_CLIENT_EMAIL` — Email del service account
- `ADMIN_SECRET_KEY` — Clave secreta para crear el primer admin

### 2. Crear usuario administrador

Una vez el backend esté corriendo, crear el primer admin:

```bash
curl -X POST http://localhost:3000/api/admin/crear \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@untaxtame.com",
    "password": "tu-password-seguro",
    "nombre": "Administrador",
    "claveSecreta": "untaxtame-admin-2024"
  }'
```

### 3. App móvil

```bash
cd untaxtame/app
npm install
npx expo start
```

> Asegúrate de actualizar la IP en `src/config/api.js` con la IP de tu computador.

### 4. Panel Admin

```bash
cd untaxtame/admin
npm install
npm start
```

Inicia sesión con las credenciales del administrador creado en el paso 2.

## Funcionalidades

### App Móvil — Cliente
- Registro con foto de perfil
- Solicitar taxi con GPS, origen, destino y método de pago
- Seguimiento en tiempo real del estado del servicio
- Historial de viajes y pagos
- Calificación con estrellas y comentarios
- Editar perfil y foto
- Recuperar contraseña

### App Móvil — Conductor
- Registro con 6 documentos obligatorios (subidos a Firebase Storage)
- Ver servicios disponibles en tiempo real
- Aceptar y completar servicios
- Perfil con estado de verificación
- Historial de servicios

### Panel Admin
- Login protegido (solo rol admin)
- Dashboard de servicios con estadísticas
- Gestión de usuarios con filtros
- Verificación de conductores (aprobar/rechazar con vista de documentos)

### Seguridad
- Todas las rutas del backend protegidas con verificación de token Firebase
- Rutas de admin protegidas con doble verificación (token + rol admin)
- Tokens enviados automáticamente desde la app y el admin

## Métodos de pago soportados
- Daviplata
- Nequi
- PSE
- Efectivo

## API Endpoints

### Auth
- `POST /api/auth/register` — Registrar usuario
- `GET /api/auth/perfil/:uid` — Obtener perfil (protegido)
- `PUT /api/auth/perfil/:uid` — Editar perfil (protegido)
- `POST /api/auth/recuperar-password` — Recuperar contraseña

### Servicios
- `POST /api/services/solicitar` — Solicitar taxi (protegido)
- `PUT /api/services/aceptar/:id` — Aceptar servicio (protegido)
- `PUT /api/services/completar/:id` — Completar servicio (protegido)
- `PUT /api/services/cancelar/:id` — Cancelar servicio (protegido)
- `PUT /api/services/calificar/:id` — Calificar servicio (protegido)
- `GET /api/services/pendientes` — Servicios pendientes (protegido)
- `GET /api/services/historial/:uid/:rol` — Historial (protegido)
- `GET /api/services/todos` — Todos los servicios (admin)

### Usuarios
- `GET /api/users/conductores/disponibles` — Conductores disponibles (protegido)
- `GET /api/users/todos` — Todos los usuarios (admin)
- `PUT /api/users/conductor/:uid/disponibilidad` — Cambiar disponibilidad (protegido)
- `PUT /api/users/conductor/:uid/verificacion` — Verificar conductor (admin)

### Upload
- `POST /api/upload/imagen` — Subir imagen (protegido)
- `POST /api/upload/documentos` — Subir documentos del conductor (protegido)

### Admin
- `POST /api/admin/crear` — Crear administrador (requiere clave secreta)
