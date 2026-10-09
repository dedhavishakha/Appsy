import type { Prisma } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-react-router/server";
import {
  appDesignSchema,
  buildPublishedSettings,
  createCatalog,
  migrateDesign,
  SCHEMA_VERSION,
  settingsForm,
  validateDesign,
  type AppDesign,
  type DesignIssue,
  type SettingsForm,
} from "@appsy/app-config";
import { SECTION_MANIFESTS } from "@appsy/sections/manifests";
import db from "../db.server";
import { apiVersion } from "../shopify.server";
import type { ShopSetup } from "./shop.server";
import { publicUrl, putPublicFile } from "./storage.server";
import { storefrontQuery } from "./storefront.server";

// Every package this version of the editor knows (docs/04, section 3).
const catalog = createCatalog(SECTION_MANIFESTS);

export type SectionType = {
  id: string;
  title: string;
  form: SettingsForm;
  defaults: Record<string, unknown>;
};

// What the editor's browser code needs to draw each section type: plain data, no zod.
export const SECTION_TYPES: SectionType[] = catalog.list("section").map((manifest) => ({
  id: manifest.id,
  title: manifest.title,
  form: settingsForm(manifest.settings),
  defaults: manifest.settings.parse(manifest.defaults) as Record<string, unknown>,
}));

export function liveKey(appProjectId: string) {
  return `a/${appProjectId}/live.json`;
}

function versionKey(appProjectId: string, number: number) {
  return `a/${appProjectId}/v/${number}.json`;
}

// The design the editor opens: the current draft, or the live version when there's none.
export async function loadDesign(appProjectId: string): Promise<AppDesign> {
  const version = await db.configVersion.findFirstOrThrow({
    where: { appProjectId, status: { in: ["draft", "published"] } },
    orderBy: { number: "desc" },
  });
  return appDesignSchema.parse(migrateDesign(version.json, version.schemaVersion));
}

export async function listVersions(appProjectId: string) {
  return db.configVersion.findMany({
    where: { appProjectId },
    orderBy: { number: "desc" },
    take: 10,
    select: { number: true, status: true, publishedAt: true, updatedAt: true },
  });
}

const COLLECTION_TITLES_QUERY = `#graphql
  query AppsyCollectionTitles($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Collection {
        id
        title
      }
    }
  }`;

// Names of the collections the design uses, shown next to each collection picker.
export async function loadCollectionTitles(
  admin: AdminApiContext,
  design: AppDesign,
): Promise<Record<string, string>> {
  const ids = new Set<string>();
  for (const section of design.pages.home.sections) {
    const form = SECTION_TYPES.find((type) => type.id === section.type)?.form;
    for (const [key, field] of Object.entries(form?.properties ?? {})) {
      const value = section.settings[key];
      if (field.input === "collection" && typeof value === "string") ids.add(value);
      if (field.input === "collection_list" && Array.isArray(value)) {
        for (const id of value) if (typeof id === "string") ids.add(id);
      }
    }
  }
  if (ids.size === 0) return {};

  const response = await admin.graphql(COLLECTION_TITLES_QUERY, {
    variables: { ids: [...ids] },
  });
  const { data } = (await response.json()) as {
    data: { nodes: ({ id?: string; title?: string } | null)[] };
  };
  return Object.fromEntries(
    data.nodes.flatMap((node) => (node?.id && node.title ? [[node.id, node.title]] : [])),
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

  const draft = await db.configVersion.findFirst({ where: { appProjectId, status: "draft" } });
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
  shop: { primaryDomain: { url: string }; privacyPolicy: { url: string } | null };
};

export type PublishResult = { issues: DesignIssue[]; number?: number; liveUrl?: string };

// Publishes the draft (docs/01, section 6): writes an immutable version file, points
// live.json at it, marks the draft published and archives the previous version.
export async function publishDraft(shop: ShopSetup, appUrl: string): Promise<PublishResult> {
  const appProjectId = shop.appProject.id;
  const draft = await db.configVersion.findFirst({ where: { appProjectId, status: "draft" } });
  if (!draft) return { issues: [{ path: [], message: "There are no changes to publish." }] };

  const check = validateDesign(migrateDesign(draft.json, draft.schemaVersion), catalog);
  if (!check.success) return { issues: check.issues };

  if (!shop.storefrontToken) {
    return {
      issues: [
        { path: [], message: "Appsy is still setting up your store. Reload the page and try again." },
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
    design: check.design,
    version: draft.number,
    publishedAt: new Date(),
    shop: {
      domain: shop.shopDomain,
      storefrontUrl: details.shop.primaryDomain.url,
      storefrontToken: shop.storefrontToken,
      apiVersion,
    },
    links: { privacyPolicy: details.shop.privacyPolicy.url },
  });

  const key = versionKey(appProjectId, draft.number);
  await putPublicFile(key, JSON.stringify(file));
  await putPublicFile(
    liveKey(appProjectId),
    JSON.stringify({ version: draft.number, url: publicUrl(appUrl, key), minRuntime: file.minRuntime }),
  );

  await db.$transaction([
    db.configVersion.updateMany({
      where: { appProjectId, status: "published" },
      data: { status: "archived" },
    }),
    db.configVersion.update({
      where: { id: draft.id },
      data: {
        status: "published",
        publishedAt: new Date(file.publishedAt),
        cdnKey: key,
        minRuntime: file.minRuntime,
      },
    }),
  ]);
  return { issues: [], number: draft.number, liveUrl: publicUrl(appUrl, liveKey(appProjectId)) };
}
