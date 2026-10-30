import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useRootNavigationState } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Linking, Modal, Platform, StyleSheet, View } from "react-native";
import {
  bagReminderOf,
  pushData,
  pushOn,
  pushTestCode,
  type BagReminderSettings,
} from "@appsy/app-config";
import { space, useSettings } from "@/lib/app-settings";
import { useCart } from "@/lib/cart";
import { useCountry } from "@/lib/country";
import { openLink } from "@/lib/links";
import {
  askPermission,
  cancelBagReminder,
  deviceToken,
  notificationsAvailable,
  onTap,
  onTokenChange,
  readPermission,
  scheduleBagReminder,
} from "@/lib/notifications";
import { PushContext } from "@/lib/push";
import { randomId } from "@/lib/random-id";
import { isPreview } from "@/lib/settings";
import { Button } from "./button";
import { Text } from "./text";

const ANSWER_KEY = "appsy.push";
const INSTALL_KEY = "appsy.push.install";
// What Appsy last confirmed for this phone: its address, its country and when.
const SENT_KEY = "appsy.push.sent";
// The bag, and the reminder's settings, that the scheduled reminder is for.
const BAG_KEY = "appsy.push.bag";
// Install ids whose address Appsy hasn't confirmed deleting yet.
const FORGET_KEY = "appsy.push.forget";
const MAX_FORGOTTEN = 20;
// The phone tells Appsy again once a day, so Appsy knows it's still in use.
const REGISTER_EVERY_MS = 24 * 60 * 60 * 1000;

type Answer = "granted" | "denied" | "unknown";
type Sent = { token: string; country: string; at: number };

function readJson<T>(text: string | null): T | null {
  try {
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

const readIds = async () => readJson<string[]>(await AsyncStorage.getItem(FORGET_KEY)) ?? [];

// Whether Appsy is finished with a request: accepted, or refused for good (malformed). Busy
// servers (429, 5xx) and network failures leave it for the next try.
function done(status: number) {
  return status < 300 || (status >= 400 && status < 500 && status !== 429);
}

const post = (url: string, body: unknown) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

// Push notifications (docs/03, section I), once the store switches them on: the app asks the
// first time the shopper adds to their bag, and Privacy choices changes the answer. With a
// yes and the phone's permission, the phone gives Appsy its notification address (again
// once a day) and schedules a reminder whenever its bag changes. Turning them off asks
// Appsy to forget the phone, again at each start until Appsy confirms. The editor's preview
// never asks.
export function PushProvider({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const { country } = useCountry();
  const endpoint = isPreview ? undefined : settings.links.push;
  const offered = notificationsAvailable && !isPreview && pushOn(settings);
  const [answer, setAnswer] = useState<Answer>("unknown");
  const [allowed, setAllowed] = useState(false);
  const [installId, setInstallId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [asking, setAsking] = useState(false);
  const forgetting = useRef(false);
  const on = offered && answer === "granted" && allowed;

  useEffect(() => {
    if (!notificationsAvailable || isPreview) return;
    void Promise.all([
      AsyncStorage.getItem(ANSWER_KEY),
      AsyncStorage.getItem(INSTALL_KEY),
      readPermission(),
    ])
      .then(([stored, id, permission]) => {
        setAnswer(stored === "granted" || stored === "denied" ? stored : "unknown");
        setInstallId(id);
        setAllowed(permission.granted);
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // The shopper may change the permission in the phone's settings while the app is away.
  useEffect(() => {
    if (!notificationsAvailable || isPreview) return;
    const subscription = AppState.addEventListener("change", (status) => {
      if (status !== "active") return;
      readPermission()
        .then((permission) => setAllowed(permission.granted))
        .catch(() => {});
    });
    return () => subscription.remove();
  }, []);

  // Asks Appsy to delete each forgotten phone's address (the admin server's
  // routes/api.push.$appId_.forget.tsx). An id stays on the phone until Appsy confirms.
  const forget = useCallback(async () => {
    if (!endpoint || forgetting.current) return;
    forgetting.current = true;
    // Each id once per run, including ids forgotten while it runs.
    const tried = new Set<string>();
    try {
      for (;;) {
        const id = (await readIds()).find((entry) => !tried.has(entry));
        if (!id) break;
        tried.add(id);
        const status = await post(`${endpoint}/forget`, { installId: id }).then(
          (response) => response.status,
          () => null,
        );
        if (status === null || !done(status)) continue;
        const left = (await readIds()).filter((entry) => entry !== id);
        await AsyncStorage.setItem(FORGET_KEY, JSON.stringify(left));
      }
    } catch {
      // Storage failed: the next start tries again.
    } finally {
      forgetting.current = false;
    }
  }, [endpoint]);

  useEffect(() => {
    if (loaded) void forget();
  }, [loaded, forget]);

  const queueForget = useCallback(
    async (id: string) => {
      const ids = (await readIds()).filter((entry) => entry !== id);
      await AsyncStorage.setItem(FORGET_KEY, JSON.stringify([...ids, id].slice(-MAX_FORGOTTEN)));
      await AsyncStorage.removeItem(SENT_KEY);
      void forget();
    },
    [forget],
  );

  // Gives Appsy the phone's address (the admin server's routes/api.push.$appId.tsx): when
  // notifications go on, when the address or the shopper's country changes, and once a day.
  const register = useCallback(
    async (fresh?: string) => {
      if (!endpoint || !installId) return;
      const token = fresh ?? (await deviceToken().catch(() => null));
      if (!token) return;
      const sent = readJson<Sent>(await AsyncStorage.getItem(SENT_KEY));
      if (
        sent?.token === token &&
        sent.country === country &&
        Date.now() - sent.at < REGISTER_EVERY_MS
      ) {
        return;
      }
      // A deletion still waiting for this install would undo it.
      const pending = await readIds();
      if (pending.includes(installId)) {
        await AsyncStorage.setItem(
          FORGET_KEY,
          JSON.stringify(pending.filter((entry) => entry !== installId)),
        );
      }
      const response = await post(endpoint, {
        installId,
        token,
        platform: Platform.OS === "ios" ? "ios" : "android",
        country,
      }).catch(() => null);
      if (response?.ok) {
        await AsyncStorage.setItem(SENT_KEY, JSON.stringify({ token, country, at: Date.now() }));
      }
    },
    [endpoint, installId, country],
  );

  useEffect(() => {
    if (!loaded || !on) return;
    register().catch(() => {});
    return onTokenChange((token) => void register(token).catch(() => {}));
  }, [loaded, on, register]);

  // Notifications blocked in the phone's settings: Appsy forgets the phone's address until
  // they're allowed again.
  useEffect(() => {
    if (!loaded || allowed || answer !== "granted" || !installId) return;
    AsyncStorage.getItem(SENT_KEY)
      .then((sent) => (sent ? queueForget(installId) : undefined))
      .catch(() => {});
  }, [loaded, allowed, answer, installId, queueForget]);

  const setOn = useCallback(
    async (want: boolean) => {
      if (!want) {
        setAnswer("denied");
        await AsyncStorage.setItem(ANSWER_KEY, "denied").catch(() => {});
        await cancelBagReminder().catch(() => {});
        await AsyncStorage.removeItem(BAG_KEY).catch(() => {});
        if (installId) {
          setInstallId(null);
          await AsyncStorage.removeItem(INSTALL_KEY).catch(() => {});
          await queueForget(installId).catch(() => {});
        }
        return;
      }
      setAnswer("granted");
      await AsyncStorage.setItem(ANSWER_KEY, "granted").catch(() => {});
      if (!installId) {
        const id = randomId();
        setInstallId(id);
        await AsyncStorage.setItem(INSTALL_KEY, id).catch(() => {});
      }
      const permission = await askPermission().catch(() => ({
        granted: false,
        canAskAgain: false,
      }));
      setAllowed(permission.granted);
      // The phone won't ask again: only its settings can allow notifications now.
      if (!permission.granted && !permission.canAskAgain) {
        await Linking.openSettings().catch(() => {});
      }
    },
    [installId, queueForget],
  );

  const afterAddToBag = useCallback(() => {
    if (offered && loaded && answer === "unknown") setAsking(true);
  }, [offered, loaded, answer]);

  const orderPlaced = useCallback(() => {
    cancelBagReminder().catch(() => {});
    AsyncStorage.removeItem(BAG_KEY).catch(() => {});
  }, []);

  useBagReminder(loaded, on, bagReminderOf(settings));

  const testCode = on && installId ? pushTestCode(installId) : null;
  const value = useMemo(
    () => ({
      offered,
      on,
      setOn: (want: boolean) => void setOn(want),
      testCode,
      afterAddToBag,
      orderPlaced,
    }),
    [offered, on, setOn, testCode, afterAddToBag, orderPlaced],
  );

  return (
    <PushContext.Provider value={value}>
      {children}
      {notificationsAvailable && !isPreview && <PushTaps endpoint={endpoint} />}
      {asking && (
        <PushPrompt
          name={settings.app?.name ?? "This store"}
          onAnswer={(yes) => {
            setAsking(false);
            void setOn(yes);
          }}
        />
      )}
    </PushContext.Provider>
  );
}

// Keeps one reminder scheduled for the bag as it is now: a changed bag moves it, an empty
// bag cancels it. Nothing changes until the app knows the bag and the shopper's answer, so
// opening the app doesn't move the reminder.
function useBagReminder(ready: boolean, on: boolean, reminder: BagReminderSettings | null) {
  const { data: bag } = useCart();
  const known = bag !== undefined;
  const signature =
    bag && bag.totalQuantity > 0
      ? bag.lines.nodes
          .map((line) => `${line.merchandise.id}:${line.quantity}`)
          .sort()
          .join(",")
      : "";
  const hours = reminder?.hours ?? 0;
  const title = reminder?.title ?? "";
  const body = reminder?.body ?? "";

  useEffect(() => {
    if (!ready || !known) return;
    void (async () => {
      if (!on || hours === 0 || signature === "") {
        await cancelBagReminder();
        await AsyncStorage.removeItem(BAG_KEY);
        return;
      }
      const key = [signature, hours, title, body].join("|");
      if ((await AsyncStorage.getItem(BAG_KEY)) === key) return;
      await scheduleBagReminder({ title, body, seconds: hours * 60 * 60 });
      await AsyncStorage.setItem(BAG_KEY, key);
    })().catch(() => {});
  }, [ready, known, on, signature, hours, title, body]);
}

// Opens what a tapped notification points at, once the app can navigate, and counts taps on
// campaigns without saying whose (the admin server's routes/api.push.$appId_.opened.tsx).
function PushTaps({ endpoint }: { endpoint?: string }) {
  const navigation = useRootNavigationState();
  const ready = Boolean(navigation?.key);
  useEffect(() => {
    if (!ready) return;
    return onTap((data) => {
      const parsed = pushData.safeParse(data);
      if (!parsed.success) return;
      const { campaign, link, bag } = parsed.data;
      if (campaign && endpoint) post(`${endpoint}/opened`, { campaign }).catch(() => {});
      if (bag) router.push("/cart");
      else if (link) openLink(link);
      else router.navigate("/");
    });
  }, [ready, endpoint]);
  return null;
}

// The question after the first add to bag (Apple 4.5.4: offers only with the shopper's
// clear yes). Both answers are one tap, and either can be changed in Privacy choices.
function PushPrompt({ name, onAnswer }: { name: string; onAnswer: (yes: boolean) => void }) {
  const { colors } = useSettings().theme;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => onAnswer(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: colors.background }]}>
          <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>
            Get offers and bag reminders?
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>
            {name} can send you notifications about offers and news, and remind you about items
            left in your bag. You can turn them off any time in Privacy choices, in the menu.
          </Text>
          <Button title="Allow notifications" onPress={() => onAnswer(true)} />
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
