const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Sets use_frameworks with static linkage for Firebase Swift pod compatibility.
 * This avoids both:
 * - "does not define modules" errors (without modular headers)
 * - "gRPC-Core.modulemap not found" errors (with global use_modular_headers!)
 */
module.exports = function withModularHeaders(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const propsPath = path.join(config.modRequest.platformProjectRoot, 'Podfile.properties.json');
      let props = {};
      try {
        props = JSON.parse(fs.readFileSync(propsPath, 'utf8'));
      } catch {}
      props['ios.useFrameworks'] = 'static';
      fs.writeFileSync(propsPath, JSON.stringify(props, null, 2) + '\n');
      return config;
    },
  ]);
};
