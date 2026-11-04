import { Prisma, type PushAutomation } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  AUTOMATION_KINDS,
  AUTOMATION_TEMPLATES,
  automationWhen,
  BAG_REMINDER_DEFAULTS,
  BAG_REMINDER_MAX_HOURS,
  fillAutomationText,
  imageValue,
  pushMessageFits,
  pushOn,
  quietUntil,
  readPushTestCode,
  savedPushSettings,
  setPushSettings,
  type AutomationKind,
  type BagReminderSettings,
  type ImageValue,
  type PushAutomationInput,
  type PushData,
  type PushMessage,
  type PushStateInput,
} from "@appsy/app-config";
import db from "../db.server";
import { applySetting, loadDesign } from "./design.server";
import { allows, planAccessOf } from "./plan-access.server";
import type { ShopSetup } from "./shop.server";
import {
  notSent,
  sendersFor,
  type Outcome,
  type Platform,
  type Sender,
} from "./push.server";
import { storefrontQuery } from "./storefront.server";
import { getStoreKeys } from "./vault.server";

// Automatic notifications (app-config push-automations.ts; doc 03, section I2): Appsy's
// templates and the merchant's own, and a check every 5 minutes that sends what's due with
// the store's keys, straight to Google and Apple like campaigns (push.server.ts). The phone
// tells Appsy its bag and wishlist only while the shopper allows notifications
// (routes/api.push.$appId_.state.tsx); Appsy reads the bag from the store only to write a
// reminder. Each event (a bag's last change, a wishlist product) is claimed before it's sent,
// so it sends at most once even with more than one server; phones get at most 2 a day, and
// none at night where they are. Only bags and products that change after a template is
// switched on count.

const CHECK_EVERY_MS = 5 * 60_000;
const CLEAN_EVERY_MS = 24 * 60 * 60_000;
const HOUR_MS = 60 * 60_000;
const DAY_MS = 24 * HOUR_MS;
// How long after it's due an event can still send: long enough to wait out a night.
const LATE_LIMIT_MS = DAY_MS;
// Events each automatic notification looks at per check, and how many a phone gets a day.
const BATCH = 200;
const DAILY_LIMIT = 2;
// Claims are kept this long, past every wait and late limit.
const KEEP_SENDS_DAYS = 60;

// The picture phones download: a JPEG at most 1024 pixels wide or high, well under FCM's
// 1 MB limit for Android (Storefront API ImageTransformInput).
const PICTURE = `url(transform: { maxWidth: 1024, maxHeight: 1024, preferredContentType: JPG })`;

const BAG_QUERY = `#graphql
  query AppsyReminderBag($id: ID!) {
    cart(id: $id) {
      totalQuantity
      lines(first: 1) {
        nodes {
          merchandise {
            ... on ProductVariant {
              product { title featuredImage { ${PICTURE} } }
            }
          }
        }
      }
    }
  }`;

const PRODUCTS_QUERY = `#graphql
  query AppsyReminderProducts($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        title
        handle
        availableForSale
        featuredImage { ${PICTURE} }
      }
    }
  }`;

const FIRST_PRODUCT_QUERY = `#graphql
  query AppsyReminderSample {
    products(first: 1) {
      nodes { id title handle featuredImage { ${PICTURE} } }
    }
  }`;

type Picture = { url: string } | null;
type BagData = {
  cart: {
    totalQuantity: number;
    lines: {
      nodes: {
        merchandise: { product?: { title: string; featuredImage: Picture } };
      }[];
    };
  } | null;
};
type ProductData = {
  id: string;
  title: string;
  handle: string;
  availableForSale?: boolean;
  featuredImage: Picture;
};

// --- Templates and the merchant's own ----------------------------------------------------

export type AutomationRow = {
  id: string;
  template: string | null;
  kind: AutomationKind;
  name: string;
  enabled: boolean;
  delay: number;
  when: string;
  title: string;
  body: string;
  imageMode: "product" | "file" | "none";
  image: ImageValue | null;
  sent: number;
  opened: number;
  problem: string | null;
};

const isKind = (kind: string): kind is AutomationKind =>
  (AUTOMATION_KINDS as readonly string[]).includes(kind);

function toRow(automation: PushAutomation): AutomationRow | null {
  if (!isKind(automation.kind)) return null;
  const image = imageValue.safeParse(automation.image);
  const mode = automation.imageMode;
  return {
    id: automation.id,
    template: automation.template,
    kind: automation.kind,
    name: automation.name,
    enabled: automation.enabled,
    delay: automation.delay,
    when: automationWhen(automation.kind, automation.delay),
    title: automation.title,
    body: automation.body,
    imageMode: mode === "file" || mode === "none" ? mode : "product",
    image: image.success ? image.data : null,
    sent: automation.sent,
    opened: automation.opened,
    problem: automation.problem,
  };
}

// Appsy's templates for a store, each made once (a store has one of each `template`, even
// when two requests make them at once). The first bag reminder starts from the store's bag
// reminder settings, which the phone's own reminder used before 2026-11-02.
export async function ensureTemplates(appProjectId: string) {
  const have = await db.pushAutomation.findMany({
    where: { appProjectId, template: { not: null } },
    select: { template: true },
  });
  const missing = AUTOMATION_TEMPLATES.filter(
    (template) => !have.some((row) => row.template === template.template),
  );
  if (missing.length === 0) return;
  const reminder = await loadDesign(appProjectId)
    .then((design) => savedPushSettings(design).bagReminder)
    .catch(() => BAG_REMINDER_DEFAULTS);
  const ownWords =
    reminder.title !== BAG_REMINDER_DEFAULTS.title ||
    reminder.body !== BAG_REMINDER_DEFAULTS.body;
  const now = new Date();
  await db.pushAutomation.createMany({
    data: missing.map((template) => {
      const fromReminder = template.template === "abandoned_bag";
      const enabled = fromReminder ? reminder.enabled : template.enabled;
      return {
        appProjectId,
        template: template.template,
        kind: template.kind,
        name: template.name,
        enabled,
        enabledAt: enabled ? now : null,
        delay: fromReminder ? reminder.hours : template.delay,
        title: fromReminder && ownWords ? reminder.title : template.title,
        body: fromReminder && ownWords ? reminder.body : template.body,
        imageMode: template.imageMode,
        position: AUTOMATION_TEMPLATES.findIndex(
          (entry) => entry.template === template.template,
        ),
      };
    }),
    skipDuplicates: true,
  });
}

export async function loadAutomations(
  appProjectId: string,
): Promise<AutomationRow[]> {
  await ensureTemplates(appProjectId);
  const automations = await db.pushAutomation.findMany({
    where: { appProjectId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  return automations
    .map(toRow)
    .filter((row): row is AutomationRow => row !== null);
}

export async function loadAutomation(appProjectId: string, id: string) {
  const automation = await db.pushAutomation.findFirst({
    where: { id, appProjectId },
  });
  return automation ? toRow(automation) : null;
}

// What app builds from before 2026-11-02 use for their own bag reminder (app-config
// bagReminderSettings): the same switch and wait as the store's first "Abandoned bag", and
// its words when they have no placeholders, which those builds can't fill in.
export function legacyBagReminder(automation: {
  enabled: boolean;
  delay: number;
  title: string;
  body: string;
}): BagReminderSettings {
  const plain = !/\{(product|store)\}/.test(
    `${automation.title} ${automation.body}`,
  );
  return {
    enabled: automation.enabled,
    hours: Math.min(Math.max(automation.delay, 1), BAG_REMINDER_MAX_HOURS),
    title: plain ? automation.title : BAG_REMINDER_DEFAULTS.title,
    body: plain ? automation.body : BAG_REMINDER_DEFAULTS.body,
  };
}

// After the store's first "Abandoned bag" changes, app builds from before 2026-11-02 follow
// it (their reminder lives in the live design), so switching it off stops every reminder.
export async function syncLegacyBagReminder(
  admin: AdminApiContext,
  shop: ShopSetup,
  row: AutomationRow,
  createdBy: string | null,
) {
  if (row.template !== "abandoned_bag") return;
  const result = await applySetting(
    admin,
    shop,
    process.env.SHOPIFY_APP_URL ?? "",
    (design) =>
      setPushSettings(design, {
        ...savedPushSettings(design),
        bagReminder: legacyBagReminder(row),
      }),
    createdBy,
  );
  if (result.issues.length > 0) {
    console.error(
      `Bag reminder for older builds of ${shop.shopDomain} not updated:`,
      result.issues.map((issue) => issue.message).join("; "),
    );
  }
}

// Saves one (a new one when `id` is null). A template keeps its kind. Switching one on
// starts its count of new bags and wishlist products from now. Returns null when there's
// no such automatic notification.
export async function saveAutomation(
  appProjectId: string,
  id: string | null,
  input: PushAutomationInput,
  imageUrl: string | null,
): Promise<AutomationRow | null> {
  const now = new Date();
  const fields = {
    name: input.name,
    enabled: input.enabled,
    delay: input.delay,
    title: input.title,
    body: input.body,
    imageMode: input.imageMode,
    image:
      input.imageMode === "file" && input.image ? input.image : Prisma.DbNull,
    imageUrl: input.imageMode === "file" ? imageUrl : null,
    problem: null,
  };
  if (!id) {
    const last = await db.pushAutomation.aggregate({
      where: { appProjectId },
      _max: { position: true },
    });
    const created = await db.pushAutomation.create({
      data: {
        appProjectId,
        kind: input.kind,
        ...fields,
        enabledAt: input.enabled ? now : null,
        position: (last._max.position ?? 0) + 1,
      },
    });
    return toRow(created);
  }
  const current = await db.pushAutomation.findFirst({
    where: { id, appProjectId },
  });
  if (!current) return null;
  const updated = await db.pushAutomation.update({
    where: { id },
    data: {
      ...fields,
      kind: current.template ? current.kind : input.kind,
      enabledAt: !input.enabled
        ? null
        : current.enabled
          ? current.enabledAt
          : now,
    },
  });
  return toRow(updated);
}

// The switch on the Push notifications page.
export async function setAutomationEnabled(
  appProjectId: string,
  id: string,
  enabled: boolean,
): Promise<AutomationRow | null> {
  const current = await db.pushAutomation.findFirst({
    where: { id, appProjectId },
  });
  if (!current) return null;
  if (current.enabled === enabled) return toRow(current);
  const updated = await db.pushAutomation.update({
    where: { id },
    data: { enabled, enabledAt: enabled ? new Date() : null, problem: null },
  });
  return toRow(updated);
}

// Only the merchant's own can be deleted; templates are switched off instead.
export async function deleteAutomation(appProjectId: string, id: string) {
  const { count } = await db.pushAutomation.deleteMany({
    where: { id, appProjectId, template: null },
  });
  return count === 1;
}

// A tap on an automatic notification, counted without saying whose; never more than it sent.
export async function countAutomationOpen(
  appProjectId: string,
  automationId: string,
) {
  await db.$executeRaw`
    UPDATE "PushAutomation" SET "opened" = "opened" + 1
    WHERE "id" = ${automationId}::uuid
      AND "appProjectId" = ${appProjectId}::uuid
      AND "opened" < "sent"`;
}

// --- What phones share (routes/api.push.$appId_.state.tsx) -------------------------------

// Keeps a phone's bag, wishlist and clock offset as it last told Appsy. Times from the phone
// are never later than now. False when the phone isn't registered (it tries again later).
export async function updatePhoneState(
  appProjectId: string,
  state: PushStateInput,
): Promise<boolean> {
  const device = await db.pushDevice.findUnique({
    where: {
      appProjectId_installId: { appProjectId, installId: state.installId },
    },
    select: {
      id: true,
      wishlist: { select: { productId: true, savedAt: true } },
    },
  });
  if (!device) return false;
  const now = Date.now();
  const atMost = (iso: string) =>
    new Date(Math.min(new Date(iso).getTime(), now));
  const wanted = new Map(
    state.wishlist.map((item) => [
      item.productId,
      item.savedAt ? atMost(item.savedAt) : null,
    ]),
  );
  const have = new Map(
    device.wishlist.map((item) => [item.productId, item.savedAt]),
  );
  const removed = [...have.keys()].filter(
    (productId) => !wanted.has(productId),
  );
  const added = [...wanted].filter(([productId]) => !have.has(productId));
  // A time for a product Appsy had without one.
  const dated = [...wanted].filter(
    ([productId, savedAt]) =>
      savedAt && have.has(productId) && !have.get(productId),
  );
  await db.$transaction([
    db.pushDevice.update({
      where: { id: device.id },
      data: {
        cartId: state.bag?.cartId ?? null,
        bagChangedAt: state.bag ? atMost(state.bag.changedAt) : null,
        utcOffset: state.utcOffset,
      },
    }),
    db.pushWishlistItem.deleteMany({
      where: { deviceId: device.id, productId: { in: removed } },
    }),
    db.pushWishlistItem.createMany({
      data: added.map(([productId, savedAt]) => ({
        deviceId: device.id,
        productId,
        savedAt,
      })),
      skipDuplicates: true,
    }),
    ...dated.map(([productId, savedAt]) =>
      db.pushWishlistItem.update({
        where: { deviceId_productId: { deviceId: device.id, productId } },
        data: { savedAt },
      }),
    ),
  ]);
  // Stores whose merchant never opened the Push notifications page get the templates too.
  await ensureTemplates(appProjectId).catch((error) =>
    console.error(
      `Automatic notification templates for ${appProjectId}:`,
      error,
    ),
  );
  return true;
}

// --- Sending ------------------------------------------------------------------------------

type Store = { domain: string; token: string; name: string };
type Phone = {
  id: string;
  token: string;
  platform: string;
  utcOffset: number | null;
};

const pictureOf = (
  automation: Pick<PushAutomation, "imageMode" | "imageUrl">,
  product: Picture,
) =>
  automation.imageMode === "file"
    ? automation.imageUrl
    : automation.imageMode === "product"
      ? (product?.url ?? null)
      : null;

function message(
  automation: Pick<PushAutomation, "title" | "body" | "imageMode" | "imageUrl">,
  store: Store,
  product: { title: string; featuredImage: Picture },
  data: PushData,
): PushMessage | null {
  const names = { product: product.title, store: store.name };
  const built: PushMessage = {
    title: fillAutomationText(automation.title, names),
    body: fillAutomationText(automation.body, names),
    imageUrl: pictureOf(automation, product.featuredImage),
    data,
  };
  return pushMessageFits(built) ? built : null;
}

async function readBag(store: Store, cartId: string) {
  const { cart } = await storefrontQuery<BagData>(
    store.domain,
    store.token,
    BAG_QUERY,
    {
      id: cartId,
    },
  );
  if (!cart || cart.totalQuantity <= 0) return null;
  return cart.lines.nodes[0]?.merchandise.product ?? null;
}

async function readProducts(store: Store, ids: string[]) {
  if (ids.length === 0) return new Map<string, ProductData>();
  const { nodes } = await storefrontQuery<{ nodes: (ProductData | null)[] }>(
    store.domain,
    store.token,
    PRODUCTS_QUERY,
    { ids },
  );
  return new Map(
    nodes
      .filter((node): node is ProductData => Boolean(node?.id))
      .map((node) => [node.id, node]),
  );
}

// One event for one phone: claimed first, then sent, then its outcome kept.
type Attempt = {
  automation: PushAutomation;
  phone: Phone;
  event: string;
  // The notification, or null when there's nothing to remind about any more.
  build: () => Promise<PushMessage | null>;
};

type Run = {
  now: Date;
  senders: Partial<Record<Platform, Sender>>;
  stopped: Partial<Record<Platform, string>>;
  // Automatic notifications each phone got in the last day.
  sentToday: Map<string, number>;
};

// Whether the event was settled (sent, failed or skipped); false leaves it for a later check.
async function attempt(run: Run, { automation, phone, event, build }: Attempt) {
  const platform = phone.platform as Platform;
  const sender = run.senders[platform];
  if (!sender || run.stopped[platform]) return false;
  if (phone.utcOffset !== null && quietUntil(run.now, phone.utcOffset))
    return false;
  if ((run.sentToday.get(phone.id) ?? 0) >= DAILY_LIMIT) return false;
  try {
    await db.pushAutomationSend.create({
      data: {
        automationId: automation.id,
        deviceId: phone.id,
        event,
        outcome: "sending",
      },
    });
  } catch (error) {
    // Claimed already, by this server or another.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return true;
    }
    throw error;
  }
  const settle = (outcome: "sent" | "failed" | "skipped") =>
    db.pushAutomationSend.update({
      where: {
        automationId_deviceId_event: {
          automationId: automation.id,
          deviceId: phone.id,
          event,
        },
      },
      data: { outcome },
    });
  let built: PushMessage | null;
  try {
    built = await build();
  } catch (error) {
    console.error(
      `Automatic notification ${automation.id}: reading the store failed`,
      error,
    );
    await settle("failed");
    return true;
  }
  if (!built) {
    await settle("skipped");
    return true;
  }
  const outcome: Outcome = await sender.deliver(phone.token, built);
  if (outcome === "sent") {
    run.sentToday.set(phone.id, (run.sentToday.get(phone.id) ?? 0) + 1);
    await settle("sent");
    await db.pushAutomation.update({
      where: { id: automation.id },
      data: {
        sent: { increment: 1 },
        ...(automation.problem ? { problem: null } : {}),
      },
    });
    automation.problem = null;
    return true;
  }
  if (outcome === "gone") {
    // The phone's address no longer works: the phone and what it shared go.
    await db.pushDevice.deleteMany({ where: { id: phone.id } });
    return true;
  }
  await settle("failed");
  if (typeof outcome === "object") {
    run.stopped[platform] = outcome.stop;
    const problem = notSent({ [platform]: outcome.stop });
    await db.pushAutomation.update({
      where: { id: automation.id },
      data: { problem },
    });
    automation.problem = problem;
  }
  return true;
}

// Events already claimed for these phones.
async function claimedFor(automationId: string, phoneIds: string[]) {
  const sends = await db.pushAutomationSend.findMany({
    where: { automationId, deviceId: { in: phoneIds } },
    select: { deviceId: true, event: true },
  });
  return new Set(sends.map((send) => `${send.deviceId}|${send.event}`));
}

// The window an event must have happened in to send now: at least `wait` ago, not so long
// ago that it's past the late limit, and not before the automatic notification was on.
function dueWindow(automation: PushAutomation, wait: number, now: Date) {
  const latest = new Date(now.getTime() - wait);
  const earliest = new Date(
    Math.max(
      latest.getTime() - LATE_LIMIT_MS,
      automation.enabledAt?.getTime() ?? now.getTime(),
    ),
  );
  return { earliest, latest };
}

// Abandoned bag: phones whose bag last changed `delay` hours ago. The bag is read from the
// store when it's time; a bag that has ended (ordered or expired) or emptied is forgotten.
async function bagAttempts(
  run: Run,
  store: Store,
  appProjectId: string,
  automation: PushAutomation,
  platforms: Platform[],
): Promise<Attempt[]> {
  const { earliest, latest } = dueWindow(
    automation,
    automation.delay * HOUR_MS,
    run.now,
  );
  if (earliest > latest) return [];
  const phones = await db.pushDevice.findMany({
    where: {
      appProjectId,
      platform: { in: platforms },
      cartId: { not: null },
      bagChangedAt: { gte: earliest, lte: latest },
    },
    orderBy: { bagChangedAt: "asc" },
    take: BATCH,
    select: {
      id: true,
      token: true,
      platform: true,
      utcOffset: true,
      cartId: true,
      bagChangedAt: true,
    },
  });
  const claimed = await claimedFor(
    automation.id,
    phones.map((phone) => phone.id),
  );
  return phones.flatMap((phone) => {
    const event = `bag:${phone.bagChangedAt!.toISOString()}`;
    if (claimed.has(`${phone.id}|${event}`)) return [];
    return [
      {
        automation,
        phone,
        event,
        build: async () => {
          const product = await readBag(store, phone.cartId!);
          if (!product) {
            await db.pushDevice.updateMany({
              where: { id: phone.id, cartId: phone.cartId },
              data: { cartId: null, bagChangedAt: null },
            });
            return null;
          }
          return message(automation, store, product, {
            automation: automation.id,
            bag: true,
          });
        },
      },
    ];
  });
}

// Wishlist reminder: products saved `delay` days ago that are still on the wishlist and for
// sale. One per phone per check, the most recently saved one for sale; the phone's other
// products for sale are passed over, so a long wishlist doesn't bring a run of reminders.
// Products not for sale (or gone from the app) wait, until they're too old to send.
async function wishlistAttempts(
  run: Run,
  store: Store,
  appProjectId: string,
  automation: PushAutomation,
  platforms: Platform[],
): Promise<Attempt[]> {
  const { earliest, latest } = dueWindow(
    automation,
    automation.delay * DAY_MS,
    run.now,
  );
  if (earliest > latest) return [];
  const items = await db.pushWishlistItem.findMany({
    where: {
      savedAt: { gte: earliest, lte: latest },
      device: { appProjectId, platform: { in: platforms } },
    },
    orderBy: { savedAt: "desc" },
    take: BATCH,
    select: {
      productId: true,
      savedAt: true,
      device: {
        select: { id: true, token: true, platform: true, utcOffset: true },
      },
    },
  });
  const claimed = await claimedFor(automation.id, [
    ...new Set(items.map((item) => item.device.id)),
  ]);
  const due = items
    .map((item) => ({
      ...item,
      event: `wishlist:${item.productId}:${item.savedAt!.toISOString()}`,
    }))
    .filter((item) => !claimed.has(`${item.device.id}|${item.event}`));
  if (due.length === 0) return [];
  const products = await readProducts(store, [
    ...new Set(due.map((item) => item.productId)),
  ]);
  const forSale = due.filter((item) => {
    const product = products.get(item.productId);
    return product && product.availableForSale !== false;
  });
  const chosen = new Map<string, (typeof due)[number]>();
  for (const item of forSale) {
    if (!chosen.has(item.device.id)) chosen.set(item.device.id, item);
  }
  return [...chosen.values()].map((item) => ({
    automation,
    phone: item.device,
    event: item.event,
    build: async () => {
      const product = products.get(item.productId)!;
      // The phone's others for sale are passed over once it has its reminder.
      const others = forSale.filter(
        (other) =>
          other.device.id === item.device.id && other.event !== item.event,
      );
      if (others.length > 0) {
        await db.pushAutomationSend.createMany({
          data: others.map((other) => ({
            automationId: automation.id,
            deviceId: item.device.id,
            event: other.event,
            outcome: "skipped",
          })),
          skipDuplicates: true,
        });
      }
      return message(automation, store, product, {
        automation: automation.id,
        link: {
          type: "product",
          id: product.id,
          handle: product.handle,
          title: product.title,
        },
      });
    },
  }));
}

async function runForApp(
  appProjectId: string,
  automations: PushAutomation[],
  now: Date,
) {
  const project = await db.appProject.findUnique({
    where: { id: appProjectId },
    select: {
      appName: true,
      iosBundleId: true,
      shop: {
        select: {
          shopDomain: true,
          storefrontToken: true,
          uninstalledAt: true,
          plan: true,
        },
      },
    },
  });
  if (!project || project.shop.uninstalledAt || !project.shop.storefrontToken)
    return;
  // On the Pro and Advanced plans (app-config plans.ts); they wait, switched on, otherwise.
  if (!allows(planAccessOf(project.shop), "automations")) return;
  const store: Store = {
    domain: project.shop.shopDomain,
    token: project.shop.storefrontToken,
    name: project.appName,
  };
  const run: Run = { now, senders: {}, stopped: {}, sentToday: new Map() };
  // What's due first, so the design and the keys are read only when something is.
  const platforms: Platform[] = ["android", "ios"];
  const attempts: Attempt[] = [];
  for (const automation of automations) {
    attempts.push(
      ...(automation.kind === "abandoned_bag"
        ? await bagAttempts(run, store, appProjectId, automation, platforms)
        : await wishlistAttempts(
            run,
            store,
            appProjectId,
            automation,
            platforms,
          )),
    );
  }
  if (attempts.length === 0) return;
  if (!pushOn(await loadDesign(appProjectId))) return;
  run.senders = sendersFor(
    await getStoreKeys(appProjectId),
    project.iosBundleId,
  );
  if (Object.keys(run.senders).length === 0) return;
  const recent = await db.pushAutomationSend.groupBy({
    by: ["deviceId"],
    where: {
      outcome: "sent",
      createdAt: { gte: new Date(now.getTime() - DAY_MS) },
      device: { appProjectId },
    },
    _count: true,
  });
  run.sentToday = new Map(
    recent.map((entry) => [entry.deviceId, entry._count]),
  );
  try {
    for (const next of attempts) {
      await attempt(run, next);
    }
  } finally {
    for (const sender of Object.values(run.senders)) sender.close();
  }
}

// Sends what's due for every store with automatic notifications switched on.
let running = false;
async function runAutomations(now = new Date()) {
  if (running) return;
  running = true;
  try {
    const automations = await db.pushAutomation.findMany({
      where: { enabled: true, kind: { in: [...AUTOMATION_KINDS] } },
      orderBy: [{ appProjectId: "asc" }, { position: "asc" }],
    });
    const byApp = new Map<string, PushAutomation[]>();
    for (const automation of automations) {
      byApp.set(automation.appProjectId, [
        ...(byApp.get(automation.appProjectId) ?? []),
        automation,
      ]);
    }
    for (const [appProjectId, list] of byApp) {
      await runForApp(appProjectId, list, now).catch((error) =>
        console.error(
          `Automatic notifications for app ${appProjectId}:`,
          error,
        ),
      );
    }
  } finally {
    running = false;
  }
}

// --- A test to one phone (routes/app.push.automations.$id.tsx) --------------------------

// Sends the notification as written to the phone with this test code, about that phone's own
// bag or wishlist when it has shared one, else about the store's first product. Not counted.
export async function sendAutomationTest(
  appProjectId: string,
  code: string,
  input: PushAutomationInput,
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
    select: {
      token: true,
      platform: true,
      cartId: true,
      wishlist: {
        orderBy: { savedAt: "desc" },
        take: 1,
        select: { productId: true },
      },
    },
    take: 2,
  });
  if (phones.length !== 1) {
    return [
      phones.length === 0
        ? "No phone has this code. In your app, allow notifications, then check the code under Privacy choices in the menu."
        : "More than one phone has this code. Turn notifications off and on again in the app for a new one.",
    ];
  }
  const phone = phones[0]!;
  const project = await db.appProject.findUniqueOrThrow({
    where: { id: appProjectId },
    select: {
      appName: true,
      iosBundleId: true,
      shop: { select: { shopDomain: true, storefrontToken: true } },
    },
  });
  if (!project.shop.storefrontToken) {
    return [
      "Appsy can't read your store just now. Reload the page and try again.",
    ];
  }
  const store: Store = {
    domain: project.shop.shopDomain,
    token: project.shop.storefrontToken,
    name: project.appName,
  };
  const iphone = phone.platform === "ios";
  const sender = sendersFor(
    await getStoreKeys(appProjectId),
    project.iosBundleId,
  )[iphone ? "ios" : "android"];
  if (!sender) {
    return [
      iphone
        ? "This code is an iPhone's. Connect your APNs key on the Functionality page first."
        : "This code is an Android phone's. Connect your Firebase key on the Functionality page first.",
    ];
  }
  let product:
    | (Pick<ProductData, "title" | "featuredImage"> & Partial<ProductData>)
    | null = null;
  try {
    if (input.kind === "abandoned_bag" && phone.cartId) {
      product = await readBag(store, phone.cartId);
    }
    if (!product && input.kind === "wishlist" && phone.wishlist[0]) {
      product =
        (await readProducts(store, [phone.wishlist[0].productId])).get(
          phone.wishlist[0].productId,
        ) ?? null;
    }
    if (!product) {
      const { products } = await storefrontQuery<{
        products: { nodes: ProductData[] };
      }>(store.domain, store.token, FIRST_PRODUCT_QUERY);
      product = products.nodes[0] ?? null;
    }
  } catch (error) {
    console.error(`Automatic notification test for ${appProjectId}:`, error);
    return ["Appsy couldn't read your store just now. Please try again."];
  }
  if (!product) {
    return [
      "Your app has no products yet, so there's nothing to show in the test.",
    ];
  }
  const data: PushData =
    input.kind === "wishlist" && product.id && product.handle
      ? {
          link: {
            type: "product",
            id: product.id,
            handle: product.handle,
            title: product.title,
          },
        }
      : { bag: true };
  const built = message(
    {
      title: input.title,
      body: input.body,
      imageMode: input.imageMode,
      imageUrl,
    },
    store,
    product,
    data,
  );
  if (!built) {
    return [
      "This notification is too long for Google or Apple. Shorten the message.",
    ];
  }
  let outcome: Outcome;
  try {
    outcome = await sender.deliver(phone.token, built);
  } finally {
    sender.close();
  }
  const company = iphone ? "Apple" : "Google";
  if (outcome === "sent") return [];
  if (outcome === "gone") {
    return [
      `${company} says this phone can no longer get notifications from your app. Open the app again to register it.`,
    ];
  }
  if (outcome === "failed") {
    return [`${company} didn't take the test. Please try again in a minute.`];
  }
  return [outcome.stop];
}

// --- Running while the server does --------------------------------------------------------

// Claims older than every wait go: they only stop events sending twice.
async function forgetOldClaims() {
  await db.pushAutomationSend.deleteMany({
    where: {
      createdAt: { lt: new Date(Date.now() - KEEP_SENDS_DAYS * DAY_MS) },
    },
  });
}

declare global {
  // eslint-disable-next-line no-var
  var appsyAutomationCheck: (() => Promise<void>) | undefined;
  // eslint-disable-next-line no-var
  var appsyAutomationTimer: NodeJS.Timeout | undefined;
  // eslint-disable-next-line no-var
  var appsyAutomationCleanTimer: NodeJS.Timeout | undefined;
}

globalThis.appsyAutomationCheck = () =>
  runAutomations().catch((error) =>
    console.error("Sending automatic notifications:", error),
  );

if (!globalThis.appsyAutomationTimer) {
  globalThis.appsyAutomationTimer = setInterval(
    () => void globalThis.appsyAutomationCheck?.(),
    CHECK_EVERY_MS,
  );
  globalThis.appsyAutomationTimer.unref();
}

if (!globalThis.appsyAutomationCleanTimer) {
  const clean = () =>
    void forgetOldClaims().catch((error) =>
      console.error("Deleting old automatic notification claims:", error),
    );
  globalThis.appsyAutomationCleanTimer = setInterval(clean, CLEAN_EVERY_MS);
  globalThis.appsyAutomationCleanTimer.unref();
  setTimeout(clean, 2 * 60_000).unref();
}
