import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Modal, StyleSheet, View } from "react-native";
import type { AnalyticsEventName, AnalyticsProps } from "@appsy/app-config";
import { AnalyticsContext, type Consent } from "@/lib/analytics";
import { space, useSettings } from "@/lib/app-settings";
import { isPreview } from "@/lib/settings";
import { Button } from "./button";
import { Text } from "./text";

const CONSENT_KEY = "appsy.consent.analytics";
const DEVICE_KEY = "appsy.device";
const QUEUE_KEY = "appsy.events";
// Install ids whose usage data Appsy hasn't confirmed deleting yet.
const FORGET_KEY = "appsy.forget";
const MAX_FORGOTTEN = 20;

// A new session after 30 minutes away from the app.
const SESSION_GAP_MS = 30 * 60 * 1000;
const SEND_EVERY_MS = 20 * 1000;
const SEND_AT = 20;
const BATCH_SIZE = 100;
// Kept while offline; the oldest go first beyond this.
const MAX_QUEUED = 500;

type QueuedEvent = {
  name: string;
  props: Record<string, unknown>;
  occurredAt: string;
  sessionId: string;
};

// A random id (UUID version 4 format), made only once the shopper allows usage data. It
// isn't tied to the phone or the shopper, and declining forgets it.
function randomId(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return [8, 12, 16, 20].reduceRight(
    (id, at) => `${id.slice(0, at)}-${id.slice(at)}`,
    hex,
  );
}

// Whether a sent batch is finished with: accepted, or refused for good (malformed). Busy
// servers (429, 5xx) and network failures keep it for the next try.
function done(status: number) {
  return status < 300 || (status >= 400 && status < 500 && status !== 429);
}

// Usage analytics (docs/03, section J), only with the shopper's consent: the app asks the
// first time it opens, and Privacy choices in the side menu changes the answer. Events wait
// on the phone and go to Appsy in batches. Turning it off asks Appsy to delete what this
// install sent, again at each start until Appsy confirms. The editor's preview never asks
// or sends.
export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const endpoint = isPreview ? undefined : settings.links.events;
  const [consent, setConsentState] = useState<Consent>("unknown");
  const [loaded, setLoaded] = useState(false);
  const device = useRef<string | null>(null);
  const session = useRef<{ id: string; lastSeen: number } | null>(null);
  const queue = useRef<QueuedEvent[]>([]);
  const sending = useRef(false);
  // The latest batch on its way, settled either way: deleting waits for it to land first.
  const lastSend = useRef<Promise<unknown>>(Promise.resolve());
  const forgotten = useRef<string[]>([]);
  const forgetting = useRef(false);
  const granted = consent === "granted";

  useEffect(() => {
    void Promise.all([
      AsyncStorage.getItem(CONSENT_KEY),
      AsyncStorage.getItem(DEVICE_KEY),
      AsyncStorage.getItem(QUEUE_KEY),
      AsyncStorage.getItem(FORGET_KEY),
    ])
      .then(([answer, id, saved, ids]) => {
        device.current = id;
        const list: unknown = saved ? JSON.parse(saved) : [];
        queue.current = Array.isArray(list) ? (list as QueuedEvent[]) : [];
        const pending: unknown = ids ? JSON.parse(ids) : [];
        forgotten.current = Array.isArray(pending)
          ? pending.filter((item): item is string => typeof item === "string")
          : [];
        setConsentState(answer === "granted" || answer === "denied" ? answer : "unknown");
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const send = useCallback(async () => {
    const deviceId = device.current;
    if (!endpoint || !deviceId || sending.current || queue.current.length === 0) return;
    sending.current = true;
    const batch = queue.current.slice(0, BATCH_SIZE);
    try {
      const request = fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId, events: batch }),
      });
      lastSend.current = request.catch(() => {});
      const response = await request;
      if (done(response.status)) {
        queue.current = queue.current.slice(batch.length);
        AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.current)).catch(() => {});
      }
    } catch {
      // Offline: they stay on the phone.
    } finally {
      sending.current = false;
    }
  }, [endpoint]);

  // Asks Appsy to delete everything each forgotten install sent (the admin server's
  // routes/api.events.$appId_.forget.tsx). An id stays on the phone until Appsy confirms.
  const forget = useCallback(async () => {
    if (!endpoint || forgetting.current) return;
    forgetting.current = true;
    // Each id once per run, including ids forgotten while it runs.
    const tried = new Set<string>();
    try {
      for (;;) {
        const deviceId = forgotten.current.find((id) => !tried.has(id));
        if (!deviceId) break;
        tried.add(deviceId);
        await lastSend.current;
        const status = await fetch(`${endpoint}/forget`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deviceId }),
        }).then(
          (response) => response.status,
          () => null,
        );
        if (status === null || !done(status)) continue;
        forgotten.current = forgotten.current.filter((id) => id !== deviceId);
        AsyncStorage.setItem(FORGET_KEY, JSON.stringify(forgotten.current)).catch(() => {});
      }
    } finally {
      forgetting.current = false;
    }
  }, [endpoint]);

  // Deletions that didn't get through before, when the app starts.
  useEffect(() => {
    if (loaded) void forget();
  }, [loaded, forget]);

  // Adds an event, first opening a session (with app_open) when there's none or the last
  // one ended.
  const record = useCallback(
    (name: AnalyticsEventName, props: Record<string, unknown>) => {
      const now = Date.now();
      const event = (eventName: string, eventProps: Record<string, unknown>, id: string) => ({
        name: eventName,
        props: eventProps,
        occurredAt: new Date(now).toISOString(),
        sessionId: id,
      });
      const added: QueuedEvent[] = [];
      if (!session.current || now - session.current.lastSeen > SESSION_GAP_MS) {
        session.current = { id: randomId(), lastSeen: now };
        added.push(event("app_open", {}, session.current.id));
      }
      session.current.lastSeen = now;
      if (name !== "app_open") added.push(event(name, props, session.current.id));
      if (added.length === 0) return;
      queue.current = [...queue.current, ...added].slice(-MAX_QUEUED);
      AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.current)).catch(() => {});
      if (queue.current.length >= SEND_AT) void send();
    },
    [send],
  );

  const track = useCallback(
    <Name extends AnalyticsEventName>(name: Name, props: AnalyticsProps<Name>) => {
      if (granted && endpoint && device.current) record(name, props);
    },
    [granted, endpoint, record],
  );

  const setConsent = useCallback(
    (allowed: boolean) => {
      setConsentState(allowed ? "granted" : "denied");
      AsyncStorage.setItem(CONSENT_KEY, allowed ? "granted" : "denied").catch(() => {});
      if (!allowed) {
        // Declining forgets the install id and anything not yet sent, and asks Appsy to
        // delete what was sent. The id is saved for that before it's removed.
        const id = device.current;
        device.current = null;
        session.current = null;
        queue.current = [];
        if (id && endpoint) {
          forgotten.current = [...forgotten.current, id].slice(-MAX_FORGOTTEN);
        }
        AsyncStorage.setItem(FORGET_KEY, JSON.stringify(forgotten.current))
          .catch(() => {})
          .finally(() => AsyncStorage.multiRemove([DEVICE_KEY, QUEUE_KEY]).catch(() => {}));
        void forget();
        return;
      }
      if (!device.current) {
        device.current = randomId();
        AsyncStorage.setItem(DEVICE_KEY, device.current).catch(() => {});
        if (endpoint) record("first_open", {});
      }
    },
    [endpoint, record, forget],
  );

  // A session when the app starts and when it returns after a long break; events go
  // every 20 seconds and when the app leaves the screen.
  useEffect(() => {
    if (!loaded || !granted || !endpoint || !device.current) return;
    record("app_open", {});
    const timer = setInterval(() => void send(), SEND_EVERY_MS);
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") {
        record("app_open", {});
      } else {
        if (session.current) session.current.lastSeen = Date.now();
        void send();
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [loaded, granted, endpoint, record, send]);

  const value = useMemo(() => ({ consent, setConsent, track }), [consent, setConsent, track]);
  return (
    <AnalyticsContext.Provider value={value}>
      {children}
      {loaded && endpoint && consent === "unknown" && (
        <ConsentPrompt name={settings.app?.name ?? "this store"} onAnswer={setConsent} />
      )}
    </AnalyticsContext.Provider>
  );
}

// The question the first time the app opens. Both answers are one tap, and either can be
// changed later in Privacy choices.
function ConsentPrompt({
  name,
  onAnswer,
}: {
  name: string;
  onAnswer: (allowed: boolean) => void;
}) {
  const { colors } = useSettings().theme;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onAnswer(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Help {name} improve this app
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>
            Share anonymous usage data, like which products you view and add to your bag. It's
            never linked to your name or email. You can change this any time in Privacy
            choices, in the menu.
          </Text>
          <Button title="Allow" onPress={() => onAnswer(true)} />
          <Button title="Not now" variant="secondary" onPress={() => onAnswer(false)} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    padding: space.lg,
  },
  card: { padding: space.xl, gap: space.md, borderRadius: 12 },
  title: { fontSize: 18 },
  body: { fontSize: 14, lineHeight: 20, opacity: 0.85 },
});
