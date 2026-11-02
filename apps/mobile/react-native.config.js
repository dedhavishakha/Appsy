const { existsSync } = require("node:fs");
const { join } = require("node:path");

// Builds include React Native Firebase only for merchants who connected Google Analytics:
// their Firebase file for the platform being built is then next to this file
// (scripts/fetch-build-identity.mjs): google-services.json for Android,
// GoogleService-Info.plist for iPhone. Other builds leave its native code out, which Expo's
// autolinking does for a platform that is null here. app.config.js adds Firebase's Expo
// plugin the same way. firebase.json keeps collection off until the shopper says yes, and in
// every build the advertising IDs, Apple's vendor ID (IDFV) and ad network registration
// (SKAdNetwork) off, as Appsy's apps show no ads
// (https://firebase.google.com/docs/analytics/configure-data-collection,
// https://firebase.google.com/docs/analytics/ios/get-started). iPhone builds never include
// Apple's AdSupport framework, which Google says keeps the advertising ID off there.
const android = existsSync(join(__dirname, ".google-services.json"));
const ios = existsSync(join(__dirname, ".GoogleService-Info.plist"));
const platforms = {
  ...(android ? {} : { android: null }),
  ...(ios ? {} : { ios: null }),
};

module.exports = {
  dependencies:
    android && ios
      ? {}
      : {
          "@react-native-firebase/app": { platforms },
          "@react-native-firebase/analytics": { platforms },
        },
};
