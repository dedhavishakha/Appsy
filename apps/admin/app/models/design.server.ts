import type { Prisma } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  appDesignSchema,
  buildPublishedSettings,
  createCatalog,
  defaultBlocksOf,
  defaultPageSections,
  migrateDesign,
  PAGE_NAMES,
  SCHEMA_VERSION,
  sectionPages,
  settingsForm,
  validateDesign,
  type AppDesign,
  type AppIdentity,
  type AppLinks,
  type DesignIssue,
  type PackageManifest,
  type PageName,
  type PublishedSettings,
  type SettingsForm,
  type ShopDetails,
} from "@appsy/app-config";
import { BLOCK_MANIFESTS } from "@appsy/blocks/manifests";
import { FEATURE_MANIFESTS } from "@appsy/features/manifests";
import { SECTION_MANIFESTS } from "@appsy/sections/manifests";
import db from "../db.server";
import { apiVersion } from "../shopify.server";
import { loadChannel, reportSetup } from "./channel.server";
import type { ShopSetup } from "./shop.server";
import { publicUrl, putPublicFile } from "./storage.server";
import { storefrontQuery } from "./storefront.server";

// Every package this version of the editor knows (docs/04, section 3).
const catalog = createCatalog([
  ...SECTION_MANIFESTS,
  ...BLOCK_MANIFESTS,
  ...FEATURE_MANIFESTS,
]);

// What the editor's browser code needs to draw a block type: plain data, no zod.
export type BlockType = {
  id: string;
  title: string;
  form: SettingsForm;
  defaults: Record<string, unknown>;
};

export type SectionType = BlockType & {
  // The pages it can go on.
  pages: PageName[];
  acceptsBlocks: string[];
  // The blocks a newly added one starts with, and the settings each starts with.
  defaultBlocks: { type: string; settings: Record<string, unknown> }[];
};

function packageType(manifest: PackageManifest): BlockType {
  return {
    id: manifest.id,
    title: manifest.title,
    form: settingsForm(manifest.settings),
    defaults: manifest.settings.parse(manifest.defaults) as Record<
      string,
      unknown
    >,
  };
}

export const SECTION_TYPES: SectionType[] = catalog
  .list("section")
  .map((manifest) => ({
    ...packageType(manifest),
    pages: sectionPages(manifest),
    acceptsBlocks: manifest.acceptsBlocks ?? [],
    defaultBlocks: defaultBlocksOf(manifest),
  }));

export const BLOCK_TYPES: BlockType[] = catalog.list("block").map(packageType);

export function liveKey(appProjectId: string) {
  return `a/${appProjectId}/live.json`;
}

function versionKey(appProjectId: string, number: number) {
  return `a/${appProjectId}/v/${number}.json`;
}

// The design the editor opens: the current draft, or the live version when there's none,
// with every setting filled in (settings added since it was saved get their defaults).
export async function loadDesign(appProjectId: string): Promise<AppDesign> {
  const version = await db.configVersion.findFirstOrThrow({
    where: { appProjectId, status: { in: ["draft", "published"] } },
    orderBy: { number: "desc" },
  });
  const saved = migrateDesign(version.json, version.schemaVersion);
  const design = appDesignSchema.parse(saved);
  // Phones draw an empty Product or Collection page from its template
  // (apps/mobile/src/lib/page-context.ts), so the editor shows the template too.
  for (const page of ["product", "collection"] as const) {
    if (design.pages[page].sections.length === 0) {
      design.pages[page] = { sections: defaultPageSections(page) };
    }
  }
  // A design saved before the side menu existed gets the one new designs start with. An
  // empty Menu page saved since then is the merchant's choice and stays empty.
  if (!hasMenuPage(saved)) {
    design.pages.menu = { sections: defaultPageSections("menu") };
    const { header } = design.navigation;
    if (!header.left.includes("menu") && !header.right.includes("menu")) {
      header.left = ["menu", ...header.left];
    }
  }
  const check = validateDesign(design, catalog);
  return check.success ? check.design : design;
}

function hasMenuPage(saved: unknown) {
  const pages = (saved as { pages?: Record<string, unknown> } | null)?.pages;
  return typeof pages === "object" && pages !== null && "menu" in pages;
}

// Whether there are unpublished changes, and the version phones have.
export async function loadStatus(appProjectId: string) {
  const versions = await db.configVersion.findMany({
    where: { appProjectId, status: { in: ["draft", "published"] } },
    select: { number: true, status: true },
  });
  return {
    hasDraft: versions.some((version) => version.status === "draft"),
    liveVersion:
      versions.find((version) => version.status === "published")?.number ??
      null,
  };
}

export async function listVersions(appProjectId: string) {
  return db.configVersion.findMany({
    where: { appProjectId },
    orderBy: { number: "desc" },
    take: 10,
    select: { number: true, status: true, publishedAt: true, updatedAt: true },
  });
}

const RESOURCE_TITLES_QUERY = `#graphql
  query AppsyResourceTitles($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Collection {
        id
        title
      }
      ... on Product {
        id
        title
      }
    }
  }`;

// Names of the collections and products the design uses, shown next to their pickers.
export async function loadResourceTitles(
  admin: AdminApiContext,
  design: AppDesign,
): Promise<Record<string, string>> {
  const ids = new Set<string>();
  const collect = (
    form: SettingsForm | undefined,
    settings: Record<string, unknown>,
  ) => {
    for (const [key, field] of Object.entries(form?.properties ?? {})) {
      const value = settings[key];
      if (
        (field.input === "collection" || field.input === "product") &&
        typeof value === "string"
      ) {
        ids.add(value);
      }
      if (field.input === "collection_list" && Array.isArray(value)) {
        for (const id of value) if (typeof id === "string") ids.add(id);
      }
    }
  };
  for (const page of PAGE_NAMES) {
    for (const section of design.pages[page].sections) {
      collect(
        SECTION_TYPES.find((type) => type.id === section.type)?.form,
        section.settings,
      );
      for (const block of section.blocks) {
        collect(
          BLOCK_TYPES.find((type) => type.id === block.type)?.form,
          block.settings,
        );
      }
    }
  }
  if (ids.size === 0) return {};

  const response = await admin.graphql(RESOURCE_TITLES_QUERY, {
    variables: { ids: [...ids] },
  });
  const { data } = (await response.json()) as {
    data: { nodes: ({ id?: string; title?: string } | null)[] };
  };
  return Object.fromEntries(
    data.nodes.flatMap((node) =>
      node?.id && node.title ? [[node.id, node.title]] : [],
    ),
  );
}

// Saves the editor's design as the draft. After a publish, the next save starts a new
// numbered draft, so published versions never change.
export async function saveDraft(
  appProjectId: string,
  input: unknown,
  createdBy: string | null,
): Promise<{ issues: DesignIssue[] }> {
  const check = validateDesign(input, catalog);
  if (!check.success) return { issues: check.issues };
  const json = check.design as Prisma.InputJsonValue;

  const draft = await db.configVersion.findFirst({
    where: { appProjectId, status: "draft" },
  });
  if (draft) {
    await db.configVersion.update({
      where: { id: draft.id },
      data: { json, schemaVersion: SCHEMA_VERSION, createdBy },
    });
  } else {
    const latest = await db.configVersion.findFirst({
      where: { appProjectId },
      orderBy: { number: "desc" },
    });
    await db.configVersion.create({
      data: {
        appProjectId,
        number: (latest?.number ?? 0) + 1,
        json,
        schemaVersion: SCHEMA_VERSION,
        createdBy,
      },
    });
  }
  return { issues: [] };
}

const PREVIEW_DETAILS_QUERY = `#graphql
  query AppsyPreviewDetails {
    shop {
      primaryDomain {
        url
      }
      privacyPolicy {
        url
      }
    }
    products(first: 1, sortKey: BEST_SELLING) {
      nodes {
        handle
        title
      }
    }
    collections(first: 1, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        handle
        title
      }
    }
  }`;

export type PreviewItem = { handle: string; title: string };

type PreviewDetails = {
  shop: {
    primaryDomain: { url: string };
    privacyPolicy: { url: string } | null;
  };
  products: { nodes: PreviewItem[] };
  collections: { nodes: PreviewItem[] };
};

export type PreviewSetup = {
  shop: ShopDetails;
  links: AppLinks;
  app?: AppIdentity;
  // What the Product and Collection pages show first: only items the app can see.
  product: PreviewItem | null;
  collection: PreviewItem | null;
};

// What the editor's phone preview needs besides the design: the store details a publish
// adds, read with Appsy's Storefront token the way phones read them. Null until the store
// has the token.
export async function loadPreview(
  shop: ShopSetup,
): Promise<PreviewSetup | null> {
  if (!shop.storefrontToken) return null;
  const details = await storefrontQuery<PreviewDetails>(
    shop.shopDomain,
    shop.storefrontToken,
    PREVIEW_DETAILS_QUERY,
  );
  return {
    shop: {
      domain: shop.shopDomain,
      storefrontUrl: details.shop.primaryDomain.url,
      storefrontToken: shop.storefrontToken,
      apiVersion,
    },
    // Publishing needs the real policy; the preview never opens it.
    links: {
      privacyPolicy:
        details.shop.privacyPolicy?.url ?? details.shop.primaryDomain.url,
    },
    app: appIdentity(shop),
    product: details.products.nodes[0] ?? null,
    collection: details.collections.nodes[0] ?? null,
  };
}

const PAGES_QUERY = `#graphql
  query AppsyPages {
    pages(first: 100, sortKey: TITLE) {
      nodes {
        id
        title
        onlineStoreUrl
      }
    }
  }`;

export type StorePage = { id: string; title: string; url: string };

// The store's pages a banner can open: those on the online store, which have a web
// address. Read with Appsy's Storefront token, so no extra admin permission is needed.
export async function loadPages(shop: ShopSetup): Promise<StorePage[]> {
  if (!shop.storefrontToken) return [];
  const data = await storefrontQuery<{
    pages: {
      nodes: { id: string; title: string; onlineStoreUrl: string | null }[];
    };
  }>(shop.shopDomain, shop.storefrontToken, PAGES_QUERY);
  return data.pages.nodes.flatMap((page) =>
    page.onlineStoreUrl
      ? [{ id: page.id, title: page.title, url: page.onlineStoreUrl }]
      : [],
  );
}

const MENUS_QUERY = `#graphql
  query AppsyMenus {
    menus(first: 100, sortKey: TITLE) {
      nodes {
        handle
        title
      }
    }
  }`;

export type StoreMenu = { handle: string; title: string };

// The store's menus (Online Store › Navigation in Shopify), for the side menu's Shopify
// menu section. Needs read_online_store_navigation; phones read the chosen one by handle
// with the Storefront token.
export async function loadMenus(admin: AdminApiContext): Promise<StoreMenu[]> {
  const response = await admin.graphql(MENUS_QUERY);
  const { data } = (await response.json()) as {
    data: { menus: { nodes: StoreMenu[] } };
  };
  return data.menus.nodes;
}

const PUBLISH_DETAILS_QUERY = `#graphql
  query AppsyPublishDetails {
    shop {
      primaryDomain {
        url
      }
      privacyPolicy {
        url
      }
    }
  }`;

type PublishDetails = {
  shop: {
    primaryDomain: { url: string };
    privacyPolicy: { url: string } | null;
  };
};

export type PublishResult = {
  issues: DesignIssue[];
  number?: number;
  liveUrl?: string;
};

// Publishes the draft (docs/01, section 6): writes an immutable version file, points
// live.json at it, marks the draft published and archives the previous version.
export async function publishDraft(
  admin: AdminApiContext,
  shop: ShopSetup,
  appUrl: string,
): Promise<PublishResult> {
  const appProjectId = shop.appProject.id;
  const draft = await db.configVersion.findFirst({
    where: { appProjectId, status: "draft" },
  });
  if (!draft)
    return {
      issues: [{ path: [], message: "There are no changes to publish." }],
    };

  const check = validateDesign(
    migrateDesign(draft.json, draft.schemaVersion),
    catalog,
  );
  if (!check.success) return { issues: check.issues };

  const written = await writeLiveFile(
    admin,
    shop,
    appUrl,
    check.design,
    draft.number,
  );
  if ("issues" in written) return { issues: written.issues };

  await db.$transaction([
    db.configVersion.updateMany({
      where: { appProjectId, status: "published" },
      data: { status: "archived" },
    }),
    db.configVersion.update({
      where: { id: draft.id },
      data: {
        status: "published",
        publishedAt: new Date(written.file.publishedAt),
        cdnKey: written.key,
        minRuntime: written.file.minRuntime,
      },
    }),
  ]);
  // Clears the "publish your design" step on the merchant's Shopify admin home.
  await reportSetup(admin, true);
  return {
    issues: [],
    number: draft.number,
    liveUrl: publicUrl(appUrl, liveKey(appProjectId)),
  };
}

// An app-wide setting from Appsy's Functionality page, which takes effect at once (Polaris:
// switches are for settings that apply immediately). The live design gets the change as a
// new published version, without publishing unfinished editor changes; the editor's draft
// gets it too, so its next publish keeps it. Before the first publish, the change waits in
// the draft. `live` says whether the app has it now.
export async function applySetting(
  admin: AdminApiContext,
  shop: ShopSetup,
  appUrl: string,
  change: (design: AppDesign) => AppDesign,
  createdBy: string | null,
): Promise<PublishResult & { live: boolean }> {
  const appProjectId = shop.appProject.id;
  const [live, draft] = await Promise.all([
    db.configVersion.findFirst({
      where: { appProjectId, status: "published" },
    }),
    db.configVersion.findFirst({ where: { appProjectId, status: "draft" } }),
  ]);
  const changed = (json: Prisma.JsonValue, schemaVersion: number) =>
    validateDesign(
      change(appDesignSchema.parse(migrateDesign(json, schemaVersion))),
      catalog,
    );

  if (!live) {
    const { issues } = await saveDraft(
      appProjectId,
      change(await loadDesign(appProjectId)),
      createdBy,
    );
    return { issues, live: false };
  }

  const check = changed(live.json, live.schemaVersion);
  if (!check.success) return { issues: check.issues, live: false };
  const draftCheck = draft ? changed(draft.json, draft.schemaVersion) : null;
  // The new version takes the draft's number; the draft moves up one, so numbers stay in order.
  const number = draft ? draft.number : live.number + 1;
  const written = await writeLiveFile(
    admin,
    shop,
    appUrl,
    check.design,
    number,
  );
  if ("issues" in written) return { issues: written.issues, live: false };

  await db.$transaction(async (tx) => {
    if (draft) {
      await tx.configVersion.update({
        where: { id: draft.id },
        data: {
          number: draft.number + 1,
          ...(draftCheck?.success
            ? { json: draftCheck.design as Prisma.InputJsonValue }
            : {}),
        },
      });
    }
    await tx.configVersion.updateMany({
      where: { appProjectId, status: "published" },
      data: { status: "archived" },
    });
    await tx.configVersion.create({
      data: {
        appProjectId,
        number,
        status: "published",
        json: check.design as Prisma.InputJsonValue,
        schemaVersion: SCHEMA_VERSION,
        createdBy,
        publishedAt: new Date(written.file.publishedAt),
        cdnKey: written.key,
        minRuntime: written.file.minRuntime,
      },
    });
  });
  return { issues: [], number, live: true };
}

// The app's name from the setup guide on Home, which the app shows when there's no logo.
function appIdentity(shop: ShopSetup): AppIdentity | undefined {
  const name = shop.appProject.appName.trim();
  return name ? { name } : undefined;
}

// Writes a version's public file and points live.json at it, after the checks the app needs
// to work and to pass Apple's and Google's review.
async function writeLiveFile(
  admin: AdminApiContext,
  shop: ShopSetup,
  appUrl: string,
  design: AppDesign,
  number: number,
): Promise<
  { issues: DesignIssue[] } | { file: PublishedSettings; key: string }
> {
  const appProjectId = shop.appProject.id;
  // Without the channel, the app shows no products and its orders aren't credited to it.
  const channel = await loadChannel(admin, shop);
  if (!channel) {
    return {
      issues: [
        {
          path: [],
          message: "Connect Appsy on its Home page before publishing.",
        },
      ],
    };
  }

  if (!shop.storefrontToken) {
    return {
      issues: [
        {
          path: [],
          message:
            "Appsy is still setting up your store. Reload the page and try again.",
        },
      ],
    };
  }
  // Read the way phones read it: with Appsy's Storefront token, so no extra admin scope.
  const details = await storefrontQuery<PublishDetails>(
    shop.shopDomain,
    shop.storefrontToken,
    PUBLISH_DETAILS_QUERY,
  );
  if (!details.shop.privacyPolicy) {
    return {
      issues: [
        {
          path: [],
          message:
            "Add a privacy policy in Shopify (Settings › Policies) before publishing. Apple and Google require one in every app.",
        },
      ],
    };
  }

  const file = buildPublishedSettings({
    design,
    version: number,
    publishedAt: new Date(),
    shop: {
      domain: shop.shopDomain,
      storefrontUrl: details.shop.primaryDomain.url,
      storefrontToken: shop.storefrontToken,
      apiVersion,
      channelHandle: channel.handle,
    },
    links: {
      privacyPolicy: details.shop.privacyPolicy.url,
      // Where the app sends usage events once shoppers allow it (routes/api.events.$appId.tsx).
      events: `${appUrl}/api/events/${appProjectId}`,
      // Where it registers for push notifications once shoppers allow them
      // (routes/api.push.$appId.tsx).
      push: `${appUrl}/api/push/${appProjectId}`,
    },
    app: appIdentity(shop),
  });

  const key = versionKey(appProjectId, number);
  await putPublicFile(key, JSON.stringify(file));
  await putPublicFile(
    liveKey(appProjectId),
    JSON.stringify({
      version: number,
      url: publicUrl(appUrl, key),
      minRuntime: file.minRuntime,
    }),
  );
  return { file, key };
}
