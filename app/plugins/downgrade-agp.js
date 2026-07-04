const { withProjectBuildGradle, withSettingsGradle } = require('expo/config-plugins');

module.exports = function downgradeAgpPlugin(config) {
  config = withProjectBuildGradle(config, (config) => {
    if (config.modResults.contents) {
      // Replace any AGP version with 8.6.1
      config.modResults.contents = config.modResults.contents.replace(
        /id\("com\.android\.application"\) version "[\d.]+" apply false/,
        'id("com.android.application") version "8.6.1" apply false'
      );
      config.modResults.contents = config.modResults.contents.replace(
        /id\("com\.android\.library"\) version "[\d.]+" apply false/,
        'id("com.android.library") version "8.6.1" apply false'
      );
    }
    return config;
  });

  config = withSettingsGradle(config, (config) => {
    if (config.modResults.contents) {
      // Also fix in settings.gradle if AGP is referenced there
      config.modResults.contents = config.modResults.contents.replace(
        /id\("com\.android\.application"\) version "[\d.]+"/,
        'id("com.android.application") version "8.6.1"'
      );
      config.modResults.contents = config.modResults.contents.replace(
        /id\("com\.android\.library"\) version "[\d.]+"/,
        'id("com.android.library") version "8.6.1"'
      );
    }
    return config;
  });

  return config;
};
