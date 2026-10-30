// The editor's phone preview runs on the web, where the app has no notifications; phones use
// notifications.native.ts.

export type NotificationPermission = { granted: boolean; canAskAgain: boolean };

export const notificationsAvailable = false;

export function hasFirebase(): boolean {
  return false;
}

export async function readPermission(): Promise<NotificationPermission> {
  return { granted: false, canAskAgain: false };
}

export async function askPermission(): Promise<NotificationPermission> {
  return { granted: false, canAskAgain: false };
}

export async function deviceToken(): Promise<string | null> {
  return null;
}

export function onTokenChange(_listener: (token: string) => void): () => void {
  return () => {};
}

export function onTap(_listener: (data: unknown) => void): () => void {
  return () => {};
}

export async function scheduleBagReminder(_reminder: {
  title: string;
  body: string;
  seconds: number;
}): Promise<void> {}

export async function cancelBagReminder(): Promise<void> {}
