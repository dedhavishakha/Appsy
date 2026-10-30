import Constants from "expo-constants";
import type { Ga4Event } from "@appsy/app-config";

// Google Analytics through React Native Firebase (doc 03, section J2). Only builds made with
// the merchant's google-services.json have Firebase (app.config.js sets extra.firebase), so
// the library loads only then: Expo Go and other merchants' builds never reach for it.
// Collection starts off (firebase.json) and follows the shopper's usage data answer, with
// advertising consent always denied, so no advertising ID is used.

type FirebaseAnalytics = {
  getAnalytics: () => unknown;
  logEvent: (analytics: unknown, name: string, params?: Record<string, unknown>) => Promise<void>;
  setConsent: (analytics: unknown, consent: Record<string, boolean>) => Promise<void>;
  setAnalyticsCollectionEnabled: (analytics: unknown, enabled: boolean) => Promise<void>;
  resetAnalyticsData: (analytics: unknown) => Promise<void>;
};

const hasFirebase = Constants.expoConfig?.extra?.firebase === true;
let library: FirebaseAnalytics | null | undefined;

function firebase(): FirebaseAnalytics | null {
  if (!hasFirebase) return null;
  if (library === undefined) {
    try {
      library = require("@react-native-firebase/analytics") as FirebaseAnalytics;
    } catch {
      library = null;
    }
  }
  return library;
}

// On while the shopper allows usage data and the store has Google Analytics switched on.
// Turning it off also forgets this phone's Google Analytics ID.
export async function setGa4Collection(on: boolean): Promise<void> {
  const analytics = firebase();
  if (!analytics) return;
  const instance = analytics.getAnalytics();
  await analytics.setConsent(instance, {
    analytics_storage: on,
    ad_storage: false,
    ad_user_data: false,
    ad_personalization: false,
  });
  await analytics.setAnalyticsCollectionEnabled(instance, on);
  if (!on) await analytics.resetAnalyticsData(instance);
}

export async function sendGa4(event: Ga4Event): Promise<void> {
  const analytics = firebase();
  if (!analytics) return;
  await analytics.logEvent(analytics.getAnalytics(), event.name, event.params);
}
