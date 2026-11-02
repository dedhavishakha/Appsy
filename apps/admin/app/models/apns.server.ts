import { createHash, createPrivateKey } from "node:crypto";
import {
  connect,
  constants,
  type ClientHttp2Session,
  type ClientHttp2Stream,
} from "node:http2";
import {
  apnsPayload,
  PUSH_TTL_SECONDS,
  type PushMessage,
} from "@appsy/app-config";
import type { Outcome } from "./push.server";
import { jwt } from "./store-apis.server";
import type { ApnsKey } from "./vault.server";

// iPhone notifications, sent straight to Apple's push service (APNs) with the merchant's own
// APNs key (doc 03, section I): HTTP/2 requests with a token Appsy signs with the key
// (https://developer.apple.com/documentation/usernotifications/sending-notification-requests-to-apns).
// Merchants' iPhone builds carry the "production" push environment (apps/mobile
// app.config.js), so Appsy uses Apple's production server. Each send opens its own
// connection: Apple doesn't take tokens from more than one Apple team on one connection.
// Messages are written for the merchant; logs never include keys or phones' addresses.

const APNS_SERVER = "https://api.push.apple.com:443";
// Apple: refresh the token no more than once every 20 minutes, and at least once every 60.
const TOKEN_KEEP_MS = 40 * 60_000;
const ANSWER_WITHIN_MS = 20_000;
// A connection left open by mistake closes itself after this long without requests.
const IDLE_MS = 60_000;
const TRIES = 4;
// An address no phone has, for checking a key (see check below).
const NO_PHONE = "0".repeat(64);

// Where merchants find their keys in their Apple Developer account, in Apple's words
// (https://developer.apple.com/help/account/keys/create-a-private-key/).
const KEYS_PAGE = "Certificates, Identifiers & Profiles › Keys";
// How each problem ends: while sending, or on the Functionality page while uploading.
const AFTER_SEND = "and upload it on the Functionality page.";
const AFTER_UPLOAD = "then upload it here.";

const notProduction = (subject: string) =>
  `${subject} isn't for Apple's production environment, which your app's builds use. Create a key whose environment includes production`;
const wrongTopic = (subject: string, topic: string) =>
  `${subject} can't send notifications for ${topic}. Create a Team Scoped key, or a Topic Specific key for ${topic}`;

// Tokens by key, shared by every send from this server, so each key gets a new one at most
// every 40 minutes.
const tokens = new Map<string, { token: string; madeAt: number }>();

// Apple's token: ES256, with the Key ID and the Team ID, and the time it was made
// (https://developer.apple.com/documentation/usernotifications/establishing-a-token-based-connection-to-apns).
// Throws when the .p8 file isn't an APNs key.
function apnsToken(key: ApnsKey, renew = false): string {
  const id = createHash("sha256")
    .update(`${key.teamId}\n${key.keyId}\n${key.privateKey}`)
    .digest("hex");
  const now = Date.now();
  const kept = tokens.get(id);
  if (kept && !renew && now - kept.madeAt < TOKEN_KEEP_MS) return kept.token;
  const privateKey = createPrivateKey(key.privateKey);
  if (
    privateKey.asymmetricKeyType !== "ec" ||
    privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1"
  ) {
    throw new Error("Not an APNs key");
  }
  const token = jwt(
    { alg: "ES256", kid: key.keyId },
    { iss: key.teamId, iat: Math.floor(now / 1000) },
    privateKey,
    "ieee-p1363",
  );
  for (const [other, entry] of tokens) {
    if (now - entry.madeAt >= TOKEN_KEEP_MS) tokens.delete(other);
  }
  tokens.set(id, { token, madeAt: now });
  return token;
}

type Answer = { status: number; reason: string };

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// One notification on the connection: Apple's status and, for an error, its reason. Null
// when Apple didn't answer.
function post(
  session: ClientHttp2Session,
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<Answer | null> {
  return new Promise((resolve) => {
    let stream: ClientHttp2Stream;
    try {
      stream = session.request({
        ":method": "POST",
        ":path": path,
        ...headers,
      });
    } catch {
      resolve(null);
      return;
    }
    let status = 0;
    let text = "";
    stream.setEncoding("utf8");
    stream.setTimeout(ANSWER_WITHIN_MS, () =>
      stream.close(constants.NGHTTP2_CANCEL),
    );
    stream.on("response", (head) => {
      status = Number(head[":status"]);
    });
    stream.on("data", (chunk: string) => {
      text += chunk;
    });
    stream.on("error", () => resolve(null));
    stream.on("close", () => {
      if (!status) {
        resolve(null);
        return;
      }
      let reason = "";
      try {
        reason = String(
          (JSON.parse(text) as { reason?: unknown }).reason ?? "",
        );
      } catch {
        reason = "";
      }
      resolve({ status, reason });
    });
    stream.end(body);
  });
}

type Step = Outcome | "retry" | "reconnect" | "renew";

// What one of Apple's answers means for the phone and the send
// (https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns):
// an address Apple no longer takes for the app is deleted; a problem with the key or the App
// ID stops sending to iPhones, since each would get the same answer.
function stepOf({ status, reason }: Answer, topic: string): Step {
  switch (status) {
    case 200:
      return "sent";
    case 400:
      if (
        reason === "BadDeviceToken" ||
        reason === "DeviceTokenNotForTopic" ||
        reason === "MissingDeviceToken"
      ) {
        return "gone";
      }
      if (reason === "BadTopic" || reason === "TopicDisallowed") {
        return { stop: `${wrongTopic("Your APNs key", topic)}, ${AFTER_SEND}` };
      }
      if (reason === "IdleTimeout") return "reconnect";
      return {
        stop: `Apple refused the notification (${reason || "error 400"}).`,
      };
    case 403:
      if (reason === "ExpiredProviderToken") return "renew";
      if (reason === "UnrelatedKeyIdInToken") return "reconnect";
      if (reason === "BadEnvironmentKeyIdInToken") {
        return { stop: `${notProduction("Your APNs key")}, ${AFTER_SEND}` };
      }
      return {
        stop: `Apple no longer accepts your APNs key. It may have been revoked: create a new key under ${KEYS_PAGE} in your Apple Developer account, ${AFTER_SEND}`,
      };
    // BadPath: the address isn't one Apple can use. 410: the address is no longer active for
    // the app, or has expired.
    case 404:
    case 410:
      return "gone";
    case 413:
      return {
        stop: "This notification is too long for Apple. Shorten the message.",
      };
    case 429:
      // Too many notifications to the same phone in a row: this one is left out.
      return reason === "TooManyRequests" ? "failed" : "retry";
    case 500:
    case 503:
      return "reconnect";
    default:
      return "failed";
  }
}

// Sends with one APNs key to one app (its App ID, Apple's "topic"), over one connection,
// opened on the first notification and again after Apple drops it. close() ends it.
export function apnsSender(key: ApnsKey, topic: string) {
  let session: ClientHttp2Session | null = null;

  const open = () => {
    if (session && !session.closed && !session.destroyed) return session;
    const current = connect(APNS_SERVER);
    const forget = () => {
      if (session === current) session = null;
    };
    current.on("error", forget);
    current.on("goaway", forget);
    current.on("close", forget);
    current.setTimeout(IDLE_MS, () => current.close());
    session = current;
    return current;
  };

  const drop = (used: ClientHttp2Session) => {
    if (session === used) session = null;
    if (!used.closed) used.close();
  };

  const headers = (token: string, expiration: number) => ({
    authorization: `bearer ${token}`,
    "apns-push-type": "alert",
    "apns-topic": topic,
    // Apple: 10 for notifications that need the person's action at once, otherwise 5, which
    // lets the phone's power settings decide when.
    "apns-priority": "5",
    "apns-expiration": String(expiration),
  });

  return {
    async deliver(device: string, message: PushMessage): Promise<Outcome> {
      // Not an address Apple gave a phone (app-config pushDeviceInput checks new ones).
      if (!/^[0-9a-f]+$/i.test(device)) return "gone";
      const body = JSON.stringify(apnsPayload(message));
      let renew = false;
      let renewed = false;
      for (let attempt = 0; attempt < TRIES; attempt += 1) {
        let token: string;
        try {
          token = apnsToken(key, renew);
        } catch {
          return {
            stop: `Your APNs key (.p8) can't be read. Download the key again under ${KEYS_PAGE}, ${AFTER_SEND}`,
          };
        }
        renew = false;
        const used = open();
        const answer = await post(
          used,
          `/3/device/${device}`,
          headers(token, Math.floor(Date.now() / 1000) + PUSH_TTL_SECONDS),
          body,
        );
        const step = answer ? stepOf(answer, topic) : "reconnect";
        if (step === "retry" || step === "reconnect") {
          if (step === "reconnect") drop(used);
          await pause(1000 * 2 ** attempt + Math.floor(Math.random() * 1000));
          continue;
        }
        if (step === "renew") {
          if (renewed) {
            console.error(
              `APNs for ${topic}: a new token was refused as expired too`,
            );
            return {
              stop: "Apple didn't accept Appsy's token for your APNs key. Please try again in an hour.",
            };
          }
          renewed = true;
          renew = true;
          continue;
        }
        return step;
      }
      return "failed";
    },

    // Apple has no test mode for notifications, so a key is checked with one to an address
    // no phone has, which can't be delivered. Apple refusing the key or the App ID means the
    // key can't send for this app; refusing only the address means it took the key.
    async check(): Promise<string | null> {
      let token: string;
      try {
        token = apnsToken(key);
      } catch {
        return `This isn't an APNs key file (.p8). Upload the key you downloaded under ${KEYS_PAGE} in your Apple Developer account.`;
      }
      const answer = await post(
        open(),
        `/3/device/${NO_PHONE}`,
        // 0: Apple tries once and doesn't keep it.
        headers(token, 0),
        JSON.stringify({
          aps: { alert: { title: "Appsy", body: "Checking the key" } },
        }),
      );
      if (!answer) return "Apple didn't answer. Try again in a minute.";
      if (
        answer.status === 200 ||
        answer.status === 410 ||
        (answer.status === 400 &&
          (answer.reason === "BadDeviceToken" ||
            answer.reason === "DeviceTokenNotForTopic"))
      ) {
        return null;
      }
      console.error(
        `APNs key check for ${topic}: ${answer.status} ${answer.reason}`,
      );
      if (answer.status === 403) {
        return answer.reason === "BadEnvironmentKeyIdInToken"
          ? `${notProduction("This key")}, ${AFTER_UPLOAD}`
          : `Apple didn't accept this key. Check that the Key ID is the one shown below the key's name under ${KEYS_PAGE}, that the key has Apple Push Notification service enabled, and that it's from your Apple team ${key.teamId}.`;
      }
      if (answer.reason === "BadTopic" || answer.reason === "TopicDisallowed") {
        return `${wrongTopic("This key", topic)}, ${AFTER_UPLOAD}`;
      }
      return `Apple didn't take the test (error ${answer.status}${answer.reason ? `, ${answer.reason}` : ""}). Try again in a minute.`;
    },

    close() {
      if (session && !session.closed) session.close();
      session = null;
    },
  };
}
