const { withGradleProperties } = require('expo/config-plugins');

module.exports = function fixAgpCompat(config) {
  return withGradleProperties(config, (config) => {
    // Force all libraries to use the same AGP variant
    config.modResults.push(
      { type: 'property', key: 'android.disableResourceValidation', value: 'true' },
      { type: 'property', key: 'android.suppressUnsupportedCompileSdk', value: '36' }
    );
    return config;
  });
};
