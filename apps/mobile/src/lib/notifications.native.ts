import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { PUSH_CHANNEL, PUSH_CHANNEL_NAME } from "@appsy/app-config";

// The phone's side of push notifications (app-config push.ts), through expo-notifications.
// The phone's notification address comes from Firebase Cloud Messaging, which only builds
// made with the merchant's google-services.json have (app.config.js sets extra.firebase).
// The bag reminder is a notification the phone schedules for itself, so it needs neither.

export type NotificationPermission = { granted: boolean; canAskAgain: boolean };

const BAG_REMINDER_ID = "appsy-bag-reminder";

export const notificationsAvailable = true;

export function hasFirebase(): boolean {
  return Constants.expoConfig?.extra?.firebase === true;
}

// Notifications that arrive while the app is open still show, without a sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Android 13 and later only ask for permission once the app has a channel.
async function makeChannel() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(PUSH_CHANNEL, {
    name: PUSH_CHANNEL_NAME,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export async function readPermission(): Promise<NotificationPermission> {
  const status = await Notifications.getPermissionsAsync();
  return { granted: status.granted, canAskAgain: status.canAskAgain };
}

// The phone's own question. Android asks only twice; after that, only its settings can
// allow notifications.
export async function askPermission(): Promise<NotificationPermission> {
  await makeChannel();
  const status = await Notifications.requestPermissionsAsync();
  return { granted: status.granted, canAskAgain: status.canAskAgain };
}

// The phone's address from Firebase Cloud Messaging, or null in builds without Firebase.
export async function deviceToken(): Promise<string | null> {
  if (!hasFirebase()) return null;
  const token = await Notifications.getDevicePushTokenAsync();
  return typeof token.data === "string" ? token.data : null;
}

// Firebase sometimes gives the phone a new address.
export function onTokenChange(listener: (token: string) => void): () => void {
  const subscription = Notifications.addPushTokenListener((token) => {
    if (typeof token.data === "string") listener(token.data);
  });
  return () => subscription.remove();
}

// Taps on notifications: the one that opened the app, then each while it runs. `data` is
// what the notification carries for the app (app-config pushData).
export function onTap(listener: (data: unknown) => void): () => void {
  const handled = new Set<string>();
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const id = response.notification.request.identifier;
    if (handled.has(id)) return;
    handled.add(id);
    listener(response.notification.request.content.data);
  };
  void Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      handle(response);
      return Notifications.clearLastNotificationResponseAsync();
    })
    .catch(() => {});
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => subscription.remove();
}

// One reminder at a time: a new one replaces the last.
export async function scheduleBagReminder(reminder: {
  title: string;
  body: string;
  seconds: number;
}): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(BAG_REMINDER_ID);
  await makeChannel();
  await Notifications.scheduleNotificationAsync({
    identifier: BAG_REMINDER_ID,
    content: { title: reminder.title, body: reminder.body, data: { bag: true } },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: reminder.seconds,
      channelId: PUSH_CHANNEL,
    },
  });
}

export async function cancelBagReminder(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(BAG_REMINDER_ID);
}
