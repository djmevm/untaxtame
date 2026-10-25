// app.config.js
// Extiende la configuración estática de app.json e inyecta el
// google-services.json desde la variable de entorno de EAS Build
// (GOOGLE_SERVICES_JSON, de tipo "file") cuando está disponible.
// En local cae de vuelta al archivo ./google-services.json.
const appJson = require('./app.json');

module.exports = () => {
  const config = { ...appJson.expo };

  const googleServices =
    process.env.GOOGLE_SERVICES_JSON || './google-services.json';

  config.android = {
    ...(config.android || {}),
    googleServicesFile: googleServices,
  };

  return config;
};
