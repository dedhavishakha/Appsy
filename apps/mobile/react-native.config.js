const { existsSync } = require("node:fs");
const { join } = require("node:path");

// Builds include React Native Firebase only for merchants who connected Google Analytics:
// their google-services.json is then next to this file (scripts/fetch-build-identity.mjs).
// Other builds leave its native code out, which Expo's autolinking does for a dependency
// whose platform is null here. app.config.js adds Firebase's Expo plugin the same way.
// firebase.json keeps collection and the advertising ID off until the shopper says yes.
const firebase = existsSync(join(__dirname, ".google-services.json"));
const leftOut = { platforms: { android: null, ios: null } };

module.exports = {
  dependencies: firebase
    ? {}
    : {
        "@react-native-firebase/app": leftOut,
        "@react-native-firebase/analytics": leftOut,
      },
};
