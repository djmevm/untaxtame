# 🚀 Guía de Despliegue — UntaXtame S.A.S

## Requisitos previos
- Cuenta de Google Play Console ($25 USD, pago único)
- Cuenta de Firebase (ya la tienes: untaxtame-app)
- Cuenta en Railway.app, Render.com o un VPS propio
- Node.js 18+ instalado
- Expo CLI: `npm install -g eas-cli`

---

## PASO 1: Desplegar el Backend API

### Opción A: Railway.app (recomendada)

1. Sube tu código a GitHub (si no lo has hecho)
2. Ve a [railway.app](https://railway.app) y crea una cuenta
3. Crea un nuevo proyecto → "Deploy from GitHub"
4. Selecciona la carpeta `untaxtame/backend`
5. Configura las variables de entorno:

```
PORT=3000
FIREBASE_PROJECT_ID=untaxtame-app
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@untaxtame-app.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
ADMIN_SECRET_KEY=untaxtame-admin-2024
NODE_ENV=production
```

6. Railway te dará una URL como: `https://untaxtame-api.up.railway.app`
7. Anota esa URL, la necesitas para el paso 3

### Opción B: VPS propio con fibra óptica

1. Instala Node.js 18+ en tu servidor
2. Instala PM2: `npm install -g pm2`
3. Clona el proyecto y entra a `untaxtame/backend`
4. Ejecuta: `npm install --production`
5. Configura el `.env` con tus credenciales
6. Inicia con PM2: `pm2 start ecosystem.config.js`
7. Configura PM2 para que inicie con el sistema: `pm2 startup && pm2 save`
8. Configura un dominio o usa la IP pública con puerto 3000
9. (Recomendado) Usa Nginx como reverse proxy con SSL:

```nginx
server {
    listen 443 ssl;
    server_name api.untaxtame.com;

    ssl_certificate /etc/letsencrypt/live/api.untaxtame.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.untaxtame.com/privkey.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## PASO 2: Desplegar el Panel Admin

### Vercel (gratis, recomendado)

1. Ve a [vercel.com](https://vercel.com) y crea una cuenta
2. Importa tu repositorio de GitHub
3. Configura:
   - **Root Directory**: `untaxtame/admin`
   - **Build Command**: `npm run build`
   - **Output Directory**: `build`
4. Agrega la variable de entorno:
   - `REACT_APP_API_URL` = `https://tu-backend-url.com/api`
5. Deploy. Vercel te dará una URL como: `https://admin-untaxtame.vercel.app`

### Alternativa: Netlify
- Mismo proceso, arrastra la carpeta `build` después de ejecutar `npm run build`

---

## PASO 3: Actualizar URLs en la App Móvil

Antes de compilar la app, actualiza la URL del backend:

**Archivo: `untaxtame/app/src/config/api.js`**
```javascript
const API_URL = 'https://tu-backend-url.com/api';
```

**Archivo: `untaxtame/app/src/screens/conductor/PerfilConductorScreen.js`**
Busca y reemplaza todas las ocurrencias de `http://192.168.0.101:3000` por tu URL de producción.

---

## PASO 4: Compilar la App para Google Play Store

### 4.1 Instalar EAS CLI
```bash
npm install -g eas-cli
```

### 4.2 Iniciar sesión en Expo
```bash
eas login
```

### 4.3 Configurar el proyecto
```bash
cd untaxtame/app
eas build:configure
```

### 4.4 Configurar Google Maps API Key
1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Habilita "Maps SDK for Android"
3. Crea una API Key
4. Edita `app.json` y reemplaza `TU_GOOGLE_MAPS_API_KEY_AQUI`

### 4.5 Generar APK de prueba
```bash
eas build --platform android --profile preview
```
Esto genera un APK que puedes instalar directamente para probar.

### 4.6 Generar AAB para Play Store
```bash
eas build --platform android --profile production
```
Esto genera un `.aab` (Android App Bundle) que es lo que sube a Play Store.

### 4.7 Subir a Google Play Store
```bash
eas submit --platform android
```
O manualmente:
1. Ve a [Google Play Console](https://play.google.com/console)
2. Crea una nueva aplicación
3. Completa la información:
   - Nombre: UntaXtame S.A.S
   - Descripción: Servicio de taxi en Tame, Arauca
   - Categoría: Viajes y transporte local
   - Capturas de pantalla (mínimo 2)
   - Ícono de la app (512x512)
   - Política de privacidad (obligatoria)
4. Sube el archivo `.aab`
5. Envía a revisión

---

## PASO 5: Configuración de Firebase para producción

### Reglas de Firestore (seguridad)
Ve a Firebase Console → Firestore → Reglas y configura:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Usuarios: solo lectura autenticada, escritura por el propio usuario o admin
    match /usuarios/{uid} {
      allow read: if request.auth != null;
      allow write: if request.auth.uid == uid || isAdmin();
    }
    
    // Servicios: lectura autenticada, escritura por participantes
    match /servicios/{servicioId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
      
      match /ofertas/{ofertaId} {
        allow read, write: if request.auth != null;
      }
    }
    
    // Chat: solo participantes del servicio
    match /chats/{servicioId}/mensajes/{msgId} {
      allow read, write: if request.auth != null;
    }
    
    // Billeteras: lectura por el conductor, escritura por admin
    match /billeteras/{uid} {
      allow read: if request.auth.uid == uid || isAdmin();
      allow write: if isAdmin();
      
      match /movimientos/{movId} {
        allow read: if request.auth.uid == uid || isAdmin();
        allow write: if isAdmin();
      }
    }
    
    // Configuración: solo admin
    match /configuracion/{doc} {
      allow read: if request.auth != null;
      allow write: if isAdmin();
    }
    
    // Penalizaciones: lectura por involucrados, escritura por sistema
    match /penalizaciones/{penId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Notificaciones
    match /notificaciones/{notifId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Emergencias
    match /emergencias/{emergId} {
      allow read, write: if request.auth != null;
    }
    
    function isAdmin() {
      return get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.rol == 'admin';
    }
  }
}
```

---

## PASO 6: Checklist antes de publicar

- [ ] Backend desplegado y accesible desde internet
- [ ] Panel admin desplegado y funcionando
- [ ] URL de API actualizada en la app móvil
- [ ] Google Maps API Key configurada
- [ ] APK de prueba probado en dispositivo real
- [ ] Crear usuario admin en producción
- [ ] Reglas de Firestore configuradas
- [ ] Política de privacidad publicada (obligatoria para Play Store)
- [ ] Capturas de pantalla de la app (mínimo 2)
- [ ] Ícono de la app en 512x512 px
- [ ] Descripción de la app en español
- [ ] AAB generado y subido a Play Console
- [ ] Probar flujo completo: registro → solicitar taxi → ofertar → completar → calificar

---

## Comandos útiles

```bash
# Desarrollo
cd untaxtame/backend && npm run dev     # Backend local
cd untaxtame/admin && npm start          # Panel admin local
cd untaxtame/app && npx expo start       # App en Expo Go

# Producción
cd untaxtame/backend && pm2 start ecosystem.config.js  # Backend con PM2
cd untaxtame/admin && npm run build                      # Build del panel admin
cd untaxtame/app && eas build --platform android         # Build de la app
```

---

## Soporte
- Email: untaxtameapp@gmail.com
- Firebase Console: https://console.firebase.google.com/project/untaxtame-app
