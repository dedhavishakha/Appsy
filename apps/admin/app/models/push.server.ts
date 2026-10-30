import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import { z } from "zod";
import {
  fcmRequest,
  linkValue,
  PUSH_DEVICE_KEEP_DAYS,
  pushMessageFits,
  readPushTestCode,
  type ImageValue,
  type LinkValue,
  type PushCampaignInput,
  type PushDeviceInput,
  type PushMessage,
} from "@appsy/app-config";
import db from "../db.server";
import { loadFirebase } from "./google-analytics.server";
import { googleToken } from "./store-apis.server";
import {
  getStoreKeys,
  keepStoreKeys,
  putStoreKeys,
  type GoogleServiceAccount,
} from "./vault.server";

// Push notifications on Appsy's side (app-config push.ts; doc 03, section I): the phones that
// allowed them (routes/api.push.*), the merchant's Firebase key, and campaigns, which a check
// every 30 seconds sends straight to Google's Firebase Cloud Messaging (FCM HTTP v1) with that
// key. Bag reminders never come here: each phone schedules its own. Messages are written for
// the merchant; logs never include keys or phones' addresses.

const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const fcmSendUrl = (projectId: string) =>
  `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

// A service account key file is a few kilobytes.
const MAX_KEY_BYTES = 20_000;
const CHECK_EVERY_MS = 30_000;
const CLEAN_EVERY_MS = 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;
// A campaign still "sending" this long after its last progress was cut off by a restart.
const STALE_SENDING_MS = 10 * 60_000;
// Phones per page, and messages on their way at once.
const PAGE = 500;
const AT_ONCE = 20;
const TRIES = 4;
const MAX_SCHEDULE_DAYS = 90;
const SHOWN_CAMPAIGNS = 50;

// The picture phones download: a JPEG at most 1024 pixels wide or high, well under FCM's
// 1 MB limit for Android.
const PICTURE_QUERY = `#graphql
  query AppsyPushPicture($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        image {
          url(transform: { maxWidth: 1024, maxHeight: 1024, preferredContentType: JPG })
        }
      }
    }
  }`;

// What the Functionality page shows about the key; the key itself is in the vault.
const keyStatusSchema = z.object({
  projectId: z.string(),
  clientEmail: z.string(),
  checkedAt: z.iso.datetime(),
});
export type PushKeyStatus = z.output<typeof keyStatusSchema>;

// The fields Appsy keeps from the key file Firebase gives (Project settings › Service
// accounts › Generate new private key).
const keyFileSchema = z.object({
  type: z.literal("service_account"),
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
  private_key_id: z.string().optional(),
});

export async function loadPushKey(
  appProjectId: string,
): Promise<PushKeyStatus | null> {
  const project = await db.appProject.findUnique({
    where: { id: appProjectId },
    select: { push: true },
  });
  const status = keyStatusSchema.safeParse(project?.push);
  return status.success ? status.data : null;
}

// Keeps the merchant's Firebase key once it's for the same Firebase project as the app's
// google-services.json and Google accepts a test message from it; otherwise says what's
// wrong in the merchant's words.
export async function connectPushKey(
  appProjectId: string,
  text: string,
): Promise<string[]> {
  if (text.length > MAX_KEY_BYTES) {
    return ["This file is too large to be a Firebase key."];
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  const file = keyFileSchema.safeParse(parsed);
  if (!file.success) {
    return [
      "This isn't a Firebase key. In Firebase, open Project settings › Service accounts, choose Generate new private key, then upload the file it downloads.",
    ];
  }
  const firebase = await loadFirebase(appProjectId);
  if (!firebase) {
    return [
      "Upload your app's google-services.json first: the key must be from the same Firebase project.",
    ];
  }
  if (file.data.project_id !== firebase.projectId) {
    return [
      `This key is for the Firebase project ${file.data.project_id}, but your app's google-services.json is for ${firebase.projectId}. Download the key from ${firebase.projectId}.`,
    ];
  }
  const serviceAccount: GoogleServiceAccount = file.data;
  const problem = await fcmSender(serviceAccount).check();
  if (problem) return [problem];

  const stored = await getStoreKeys(appProjectId);
  const credentialsRef = await putStoreKeys(appProjectId, {
    ...stored,
    firebase: { serviceAccount },
  });
  const status: PushKeyStatus = {
    projectId: file.data.project_id,
    clientEmail: file.data.client_email,
    checkedAt: new Date().toISOString(),
  };
  await db.appProject.update({
    where: { id: appProjectId },
    data: { credentialsRef, push: status },
  });
  return [];
}

// Removes the key. Scheduled campaigns can't be sent without it, so they're canceled.
export async function removePushKey(appProjectId: string) {
  const keys = { ...(await getStoreKeys(appProjectId)) };
  delete keys.firebase;
  const credentialsRef = await keepStoreKeys(appProjectId, keys);
  await db.appProject.update({
    where: { id: appProjectId },
    data: { credentialsRef, push: Prisma.DbNull },
  });
  await cancelScheduled(
    appProjectId,
    "Not sent: the Firebase key was removed.",
  );
}

// When push notifications are switched off, or the key goes: nothing scheduled goes out.
export async function cancelScheduled(appProjectId: string, reason: string) {
  await db.pushCampaign.updateMany({
    where: { appProjectId, status: "scheduled" },
    data: { status: "canceled", error: reason, finishedAt: new Date() },
  });
}

// --- Phones (routes/api.push.*) ------------------------------------------------------

// A phone that allowed notifications, again each day the app opens, so its address, country
// and last visit stay current.
export async function registerPhone(
  appProjectId: string,
  phone: PushDeviceInput,
) {
  const testCode = phone.installId.replace(/-/g, "").slice(0, 8);
  const fields = {
    token: phone.token,
    platform: phone.platform,
    country: phone.country ?? null,
    lastSeenAt: new Date(),
  };
  try {
    await db.$transaction([
      // An address belongs to one install; a reinstalled app makes a new install id.
      db.pushDevice.deleteMany({
        where: {
          appProjectId,
          token: phone.token,
          installId: { not: phone.installId },
        },
      }),
      db.pushDevice.upsert({
        where: {
          appProjectId_installId: { appProjectId, installId: phone.installId },
        },
        create: {
          appProjectId,
          installId: phone.installId,
          testCode,
          ...fields,
        },
        update: fields,
      }),
    ]);
  } catch (error) {
    // Two registrations from one phone at once: the other one is kept.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }
    throw error;
  }
}

// The shopper turned notifications off: their phone's address goes at once.
export async function forgetPhone(appProjectId: string, installId: string) {
  await db.pushDevice.deleteMany({ where: { appProjectId, installId } });
}

// A tap on a campaign, counted without saying whose. A campaign can't count more opens than
// phones it reached, so a stranger calling this can't inflate it beyond that.
export async function countOpen(appProjectId: string, campaignId: string) {
  await db.$executeRaw`
    UPDATE "PushCampaign" SET "opened" = "opened" + 1
    WHERE "id" = ${campaignId}::uuid
      AND "appProjectId" = ${appProjectId}::uuid
      AND "status" IN ('sending', 'sent')
      AND "opened" < "sent"`;
}

// --- Campaigns (routes/app.push.*) ---------------------------------------------------

export type CampaignStatus =
  "scheduled" | "sending" | "sent" | "failed" | "canceled";

export type CampaignRow = {
  id: string;
  title: string;
  body: string;
  status: CampaignStatus;
  countries: string[];
  sendAt: string;
  finishedAt: string | null;
  targeted: number;
  sent: number;
  failed: number;
  opened: number;
  error: string | null;
};

export async function loadCampaigns(appProjectId: string) {
  const [campaigns, phones] = await Promise.all([
    db.pushCampaign.findMany({
      where: { appProjectId },
      orderBy: { createdAt: "desc" },
      take: SHOWN_CAMPAIGNS,
    }),
    db.pushDevice.count({ where: { appProjectId } }),
  ]);
  const rows: CampaignRow[] = campaigns.map((campaign) => ({
    id: campaign.id,
    title: campaign.title,
    body: campaign.body,
    status: campaign.status as CampaignStatus,
    countries: campaign.countries,
    sendAt: campaign.sendAt.toISOString(),
    finishedAt: campaign.finishedAt?.toISOString() ?? null,
    targeted: campaign.targeted,
    sent: campaign.sent,
    failed: campaign.failed,
    opened: campaign.opened,
    error: campaign.error,
  }));
  return { campaigns: rows, phones };
}

// The address of the smaller copy of the chosen picture that phones download.
export async function pushPictureUrl(
  admin: AdminApiContext,
  image: ImageValue | null,
): Promise<string | null> {
  if (!image) return null;
  const response = await admin.graphql(PICTURE_QUERY, {
    variables: { id: image.id },
  });
  const { data } = (await response.json()) as {
    data?: { node: { image?: { url: string } | null } | null };
  };
  return data?.node?.image?.url ?? null;
}

// What a campaign looks like on phones. Taps on a test aren't counted.
function messageOf(
  campaign: { title: string; body: string; link: LinkValue | null },
  imageUrl: string | null,
  campaignId?: string,
): PushMessage {
  return {
    title: campaign.title,
    body: campaign.body,
    imageUrl,
    data: {
      ...(campaignId ? { campaign: campaignId } : {}),
      ...(campaign.link ? { link: campaign.link } : {}),
    },
  };
}

// Saves a campaign to send now or later; the check below sends it.
export async function createCampaign(
  appProjectId: string,
  input: PushCampaignInput,
  imageUrl: string | null,
  createdBy: string | null,
): Promise<string[]> {
  if (!(await loadPushKey(appProjectId))) {
    return [
      "Connect your Firebase key under Push notifications on the Functionality page first.",
    ];
  }
  const now = Date.now();
  const sendAt = input.sendAt ? new Date(input.sendAt) : new Date(now);
  if (sendAt.getTime() < now - 60_000) {
    return ["Choose a time that hasn't passed yet."];
  }
  if (sendAt.getTime() > now + MAX_SCHEDULE_DAYS * DAY_MS) {
    return [`Choose a time within the next ${MAX_SCHEDULE_DAYS} days.`];
  }
  // A placeholder id, the same length as the real one.
  const sample = messageOf(input, imageUrl, randomUUID());
  if (!pushMessageFits(sample)) {
    return [
      "This notification is too long for Google. Shorten the message, or choose a link with a shorter name.",
    ];
  }
  await db.pushCampaign.create({
    data: {
      appProjectId,
      title: input.title,
      body: input.body,
      ...(input.image ? { image: input.image } : {}),
      imageUrl,
      ...(input.link ? { link: input.link } : {}),
      countries: input.countries,
      status: "scheduled",
      sendAt,
      createdBy,
    },
  });
  if (sendAt.getTime() <= now) void globalThis.appsyPushCheck?.();
  return [];
}

export async function cancelCampaign(appProjectId: string, id: string) {
  const { count } = await db.pushCampaign.updateMany({
    where: { id, appProjectId, status: "scheduled" },
    data: { status: "canceled", finishedAt: new Date() },
  });
  return count === 1;
}

// A test of the notification to one phone, found by the code its app shows under Privacy
// choices. Nothing is saved.
export async function sendTest(
  appProjectId: string,
  code: string,
  campaign: { title: string; body: string; link: LinkValue | null },
  imageUrl: string | null,
): Promise<string[]> {
  const testCode = readPushTestCode(code);
  if (!testCode) {
    return [
      "Enter the 8-character code your app shows under Privacy choices, like 3F9A-0C12.",
    ];
  }
  const phones = await db.pushDevice.findMany({
    where: { appProjectId, testCode },
    select: { token: true },
    take: 2,
  });
  if (phones.length === 0) {
    return [
      "No phone has this code. In your app, allow notifications, then check the code under Privacy choices in the menu.",
    ];
  }
  if (phones.length > 1) {
    return [
      "More than one phone has this code. Turn notifications off and on again in the app for a new one.",
    ];
  }
  const keys = await getStoreKeys(appProjectId);
  const serviceAccount = keys?.firebase?.serviceAccount;
  if (!serviceAccount) {
    return ["Connect your Firebase key on the Functionality page first."];
  }
  const outcome = await fcmSender(serviceAccount).deliver(
    phones[0]!.token,
    messageOf(campaign, imageUrl),
  );
  if (outcome === "sent") return [];
  if (outcome === "gone") {
    await db.pushDevice.deleteMany({
      where: { appProjectId, token: phones[0]!.token },
    });
    return [
      "Google says this phone can no longer get notifications from your app, for example because the app was removed. Open the app again to register it.",
    ];
  }
  if (outcome === "failed") {
    return ["Google didn't take the test. Please try again."];
  }
  return [outcome.stop];
}

// --- Sending to Google ---------------------------------------------------------------

type Outcome = "sent" | "gone" | "failed" | { stop: string };

type FcmError = {
  status: number;
  code: string;
  message: string;
  // Google named the phone's address as the problem.
  badAddress: boolean;
};

class KeyProblem extends Error {}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readFcmError(response: Response): Promise<FcmError> {
  const body = (await response.json().catch(() => null)) as {
    error?: {
      message?: string;
      status?: string;
      details?: {
        errorCode?: string;
        fieldViolations?: { field?: string }[];
      }[];
    };
  } | null;
  const details = body?.error?.details ?? [];
  return {
    status: response.status,
    code:
      details.find((detail) => detail.errorCode)?.errorCode ??
      body?.error?.status ??
      "",
    message: body?.error?.message ?? "",
    badAddress: details.some((detail) =>
      detail.fieldViolations?.some((violation) =>
        /token|fid/i.test(violation.field ?? ""),
      ),
    ),
  };
}

// Google's advice: honour Retry-After, otherwise back off exponentially, starting at a
// minute when the sending rate was too high
// (https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode).
function retryDelay(response: Response, attempt: number) {
  const seconds = Number(response.headers.get("retry-after"));
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(seconds, 300) * 1000;
  }
  const base = response.status === 429 ? 60_000 : 1000;
  return base * 2 ** attempt + Math.floor(Math.random() * 1000);
}

function permissionProblem(error: FcmError, projectId: string) {
  return /SERVICE_DISABLED|has not been used|is disabled|accessNotConfigured/i.test(
    `${error.code} ${error.message}`,
  )
    ? `Turn on the Firebase Cloud Messaging API in the Firebase project ${projectId} (Project settings › Cloud Messaging), then try again.`
    : `This key can't send notifications for the Firebase project ${projectId}. Use a key from Firebase's Project settings › Service accounts.`;
}

// What one of Google's answers means for the phone and the campaign
// (https://firebase.google.com/docs/reference/fcm/rest/v1/ErrorCode): an address Google no
// longer knows, or one from another Firebase project, is deleted; a problem with the key or
// the message stops the campaign, since every phone would get the same answer.
function outcomeOf(
  error: FcmError,
  projectId: string,
): Outcome | "retry" | "renew" {
  switch (error.status) {
    case 400:
      return error.badAddress ||
        /registration token|installation id/i.test(error.message)
        ? "gone"
        : { stop: `Google refused the notification: ${error.message}` };
    case 401:
      return "renew";
    case 403:
      return error.code === "SENDER_ID_MISMATCH"
        ? "gone"
        : { stop: permissionProblem(error, projectId) };
    case 404:
      return error.code === "UNREGISTERED"
        ? "gone"
        : {
            stop: `Google can't find the Firebase project ${projectId}. Check your Firebase key.`,
          };
    case 429:
    case 500:
    case 503:
      return "retry";
    default:
      return "failed";
  }
}

// Sends with one Firebase key, keeping Google's access token (an hour long) between
// messages.
function fcmSender(serviceAccount: GoogleServiceAccount) {
  const projectId = serviceAccount.project_id ?? "";
  let access: { token: string; until: number } | null = null;

  const accessToken = async () => {
    if (!access || Date.now() > access.until) {
      let result: { token?: string; error?: string };
      try {
        result = await googleToken(serviceAccount, FCM_SCOPE);
      } catch {
        throw new KeyProblem(
          "Your Firebase key's private key can't be read. Download a new key from Firebase and upload it on the Functionality page.",
        );
      }
      if (!result.token) {
        throw new KeyProblem(
          result.error ?? "Google didn't accept your Firebase key.",
        );
      }
      access = { token: result.token, until: Date.now() + 45 * 60_000 };
    }
    return access.token;
  };

  const post = async (body: object) =>
    fetch(fcmSendUrl(projectId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await accessToken()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null);

  return {
    async deliver(token: string, message: PushMessage): Promise<Outcome> {
      let renewed = false;
      for (let attempt = 0; attempt < TRIES; attempt += 1) {
        let response: Response | null;
        try {
          response = await post(fcmRequest(token, message));
        } catch (error) {
          if (error instanceof KeyProblem) return { stop: error.message };
          throw error;
        }
        if (!response) {
          await pause(1000 * 2 ** attempt);
          continue;
        }
        if (response.ok) return "sent";
        const error = await readFcmError(response);
        const outcome = outcomeOf(error, projectId);
        if (outcome === "retry") {
          await pause(retryDelay(response, attempt));
          continue;
        }
        if (outcome === "renew") {
          if (renewed) {
            return {
              stop: "Google no longer accepts your Firebase key. Upload a new key on the Functionality page.",
            };
          }
          renewed = true;
          access = null;
          continue;
        }
        return outcome;
      }
      return "failed";
    },

    // Google checks a message to a topic without delivering it (`validate_only`), which
    // shows the key, its permission and the project's Cloud Messaging API all work.
    async check(): Promise<string | null> {
      let response: Response | null;
      try {
        response = await post({
          validate_only: true,
          message: {
            topic: "appsy-key-check",
            notification: { title: "Appsy", body: "Checking the key" },
          },
        });
      } catch (error) {
        if (error instanceof KeyProblem) return error.message;
        throw error;
      }
      if (!response) return "Google didn't answer. Try again.";
      if (response.ok) return null;
      const error = await readFcmError(response);
      console.error(
        `Firebase key check for ${projectId}: ${response.status} ${error.code}`,
      );
      if (response.status === 401) {
        return "Google didn't accept this key. It may have been deleted in Firebase: download a new one and try again.";
      }
      if (response.status === 403) return permissionProblem(error, projectId);
      if (response.status === 404) {
        return `Google can't find the Firebase project ${projectId}.`;
      }
      return `Google didn't take the test message (error ${response.status}). Try again.`;
    },
  };
}

// Runs `work` on every item, at most `limit` at a time.
async function eachAtOnce<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (next < items.length) {
        const index = next;
        next += 1;
        results[index] = await work(items[index]!);
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function finish(
  id: string,
  status: Exclude<CampaignStatus, "scheduled" | "sending">,
  error: string | null,
) {
  await db.pushCampaign.update({
    where: { id },
    data: { status, error, finishedAt: new Date() },
  });
}

// Sends a claimed campaign page by page, saving its progress after each page so a restart
// carries on from the last phone it reached.
async function sendCampaign(id: string) {
  const campaign = await db.pushCampaign.findUnique({
    where: { id },
    include: {
      appProject: { select: { shop: { select: { uninstalledAt: true } } } },
    },
  });
  if (!campaign || campaign.status !== "sending") return;
  if (campaign.appProject.shop.uninstalledAt) {
    await finish(
      id,
      "canceled",
      "Not sent: Appsy was uninstalled from the store.",
    );
    return;
  }
  const keys = await getStoreKeys(campaign.appProjectId);
  const serviceAccount = keys?.firebase?.serviceAccount;
  if (!serviceAccount?.project_id) {
    await finish(
      id,
      "failed",
      "Not sent: connect your Firebase key on the Functionality page, then create it again.",
    );
    return;
  }
  const link = linkValue.safeParse(campaign.link);
  const message = messageOf(
    {
      title: campaign.title,
      body: campaign.body,
      link: link.success ? link.data : null,
    },
    campaign.imageUrl,
    campaign.id,
  );
  const audience: Prisma.PushDeviceWhereInput = {
    appProjectId: campaign.appProjectId,
    ...(campaign.countries.length > 0
      ? { country: { in: campaign.countries } }
      : {}),
  };
  if (!campaign.cursor) {
    await db.pushCampaign.update({
      where: { id },
      data: { targeted: await db.pushDevice.count({ where: audience }) },
    });
  }

  const sender = fcmSender(serviceAccount);
  let cursor = campaign.cursor;
  for (;;) {
    const phones = await db.pushDevice.findMany({
      where: { ...audience, ...(cursor ? { id: { gt: cursor } } : {}) },
      orderBy: { id: "asc" },
      take: PAGE,
      select: { id: true, token: true },
    });
    if (phones.length === 0) break;
    let stop: string | null = null;
    const outcomes = await eachAtOnce(phones, AT_ONCE, async (phone) => {
      if (stop) return null;
      const outcome = await sender.deliver(phone.token, message);
      if (typeof outcome === "object") stop = outcome.stop;
      return outcome;
    });
    const gone = phones
      .filter((_, index) => outcomes[index] === "gone")
      .map((phone) => phone.id);
    if (gone.length > 0) {
      await db.pushDevice.deleteMany({ where: { id: { in: gone } } });
    }
    const count = (outcome: Outcome) =>
      outcomes.filter((result) => result === outcome).length;
    cursor = phones[phones.length - 1]!.id;
    await db.pushCampaign.update({
      where: { id },
      data: {
        cursor,
        sent: { increment: count("sent") },
        // Phones Google no longer knows count as not reached.
        failed: { increment: count("failed") + gone.length },
      },
    });
    if (stop) {
      await finish(id, "failed", stop);
      return;
    }
  }
  await finish(id, "sent", null);
}

// Sends what's due: scheduled campaigns whose time has come, and any a restart cut off.
// Each is claimed first, so it's sent once even with more than one server.
let sending = false;
async function sendDue() {
  if (sending) return;
  sending = true;
  try {
    for (;;) {
      const now = Date.now();
      const due = await db.pushCampaign.findFirst({
        where: {
          OR: [
            { status: "scheduled", sendAt: { lte: new Date(now) } },
            {
              status: "sending",
              updatedAt: { lt: new Date(now - STALE_SENDING_MS) },
            },
          ],
        },
        orderBy: { sendAt: "asc" },
        select: { id: true, status: true, updatedAt: true, startedAt: true },
      });
      if (!due) return;
      const claimed = await db.pushCampaign.updateMany({
        where: { id: due.id, status: due.status, updatedAt: due.updatedAt },
        data: { status: "sending", startedAt: due.startedAt ?? new Date(now) },
      });
      if (claimed.count !== 1) continue;
      await sendCampaign(due.id).catch(async (error) => {
        console.error(`Sending push campaign ${due.id}:`, error);
        await finish(
          due.id,
          "failed",
          "Appsy couldn't finish sending this notification. Please create it again.",
        );
      });
    }
  } finally {
    sending = false;
  }
}

// Phones whose app hasn't been opened for PUSH_DEVICE_KEEP_DAYS: Google has stopped
// delivering to them, and the privacy text promises they go.
async function forgetOldPhones() {
  const cutoff = new Date(Date.now() - PUSH_DEVICE_KEEP_DAYS * DAY_MS);
  const { count } = await db.pushDevice.deleteMany({
    where: { lastSeenAt: { lt: cutoff } },
  });
  if (count > 0) {
    console.log(
      `Deleted ${count} push notification addresses not seen for ${PUSH_DEVICE_KEEP_DAYS} days.`,
    );
  }
}

// Runs while the server does (this module loads with the server build), like the build check
// in builds.server.ts.
declare global {
  // eslint-disable-next-line no-var
  var appsyPushCheck: (() => Promise<void>) | undefined;
  // eslint-disable-next-line no-var
  var appsyPushTimer: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var appsyPushCleanTimer: NodeJS.Timeout | undefined;
}

globalThis.appsyPushCheck = () =>
  sendDue().catch((error) => console.error("Sending push campaigns:", error));

if (!globalThis.appsyPushTimer) {
  globalThis.appsyPushTimer = setInterval(
    () => void globalThis.appsyPushCheck?.(),
    CHECK_EVERY_MS,
  );
  globalThis.appsyPushTimer.unref();
}

if (!globalThis.appsyPushCleanTimer) {
  const clean = () =>
    void forgetOldPhones().catch((error) =>
      console.error("Deleting old push notification addresses:", error),
    );
  globalThis.appsyPushCleanTimer = setInterval(clean, CLEAN_EVERY_MS);
  globalThis.appsyPushCleanTimer.unref();
  setTimeout(clean, 60_000).unref();
}
