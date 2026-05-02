// Configuración de PM2 para producción
module.exports = {
  apps: [{
    name: 'untaxtame-api',
    script: 'src/index.js',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    },
  }],
};
