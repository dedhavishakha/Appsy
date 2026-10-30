import { z } from "zod";
import { appDesignSchema, PAGE_NAMES, type AppDesign } from "./design";
import { httpsUrl, myshopifyDomain, semver, shopifyApiVersion } from "./fields";
import { MIN_RUNTIME, SCHEMA_VERSION } from "./version";

const shopSchema = z.object({
  domain: myshopifyDomain,
  storefrontUrl: httpsUrl,
  // Public by Shopify's design: it can only read what the merchant published to Appsy.
  storefrontToken: z.string().min(1),
  apiVersion: shopifyApiVersion,
  // Carts carry sourceName "channel:<handle>", which credits orders to Appsy's channel
  // (spike S2). Optional, so files published before it existed still load.
  channelHandle: z.string().min(1).optional(),
});

const linksSchema = z.object({
  privacyPolicy: httpsUrl,
  // Present once shoppers can sign in (account feature, Phase 3): Apple 5.1.1(v).
  accountDeletion: httpsUrl.optional(),
  // Where the app sends usage events once the shopper allows it (analytics.ts). Files
  // published before analytics, and the editor's preview, have none, so nothing is sent.
  events: httpsUrl.optional(),
  // Where the app registers for push notifications once the shopper allows them (push.ts).
  // Files written before push notifications have none, and the app then doesn't register.
  push: httpsUrl.optional(),
});

// The app's own identity, from Appsy's setup guide. Its name shows in the header when there's
// no logo. Optional, so files published before it existed still load.
const appSchema = z.object({ name: z.string().min(1).max(30) });

// The file every phone downloads (doc 04, section 2). It's public, so it never holds
// secrets. A phone whose runtime is older than `minRuntime` keeps its last good file.
export const publishedSettingsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  version: z.number().int().positive(),
  publishedAt: z.iso.datetime(),
  minRuntime: semver,
  shop: shopSchema,
  links: linksSchema,
  app: appSchema.optional(),
  ...appDesignSchema.shape,
});

export type PublishedSettings = z.output<typeof publishedSettingsSchema>;
export type ShopDetails = z.output<typeof shopSchema>;
export type AppLinks = z.output<typeof linksSchema>;
export type AppIdentity = z.output<typeof appSchema>;

// Builds the file for one publish. Hidden sections and blocks stay in the draft only.
export function buildPublishedSettings(input: {
  design: AppDesign;
  version: number;
  publishedAt: Date;
  shop: ShopDetails;
  links: AppLinks;
  app?: AppIdentity;
}): PublishedSettings {
  const { design } = input;
  const pages = Object.fromEntries(
    PAGE_NAMES.map((name) => [name, withoutHidden(design.pages[name])]),
  );
  return publishedSettingsSchema.parse({
    schemaVersion: SCHEMA_VERSION,
    version: input.version,
    publishedAt: input.publishedAt.toISOString(),
    minRuntime: MIN_RUNTIME,
    shop: input.shop,
    links: input.links,
    app: input.app,
    ...design,
    pages,
  });
}

function withoutHidden(page: AppDesign["pages"][(typeof PAGE_NAMES)[number]]) {
  return {
    sections: page.sections
      .filter((section) => !section.hidden)
      .map(({ hidden: _hidden, blocks, ...section }) => ({
        ...section,
        blocks: blocks
          .filter((block) => !block.hidden)
          .map(({ hidden: _blockHidden, ...block }) => block),
      })),
  };
}
