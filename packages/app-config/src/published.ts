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
});

const linksSchema = z.object({
  privacyPolicy: httpsUrl,
  accountDeletion: httpsUrl,
});

// The file every phone downloads (doc 04, section 2). It's public, so it never holds
// secrets. A phone whose runtime is older than `minRuntime` keeps its last good file.
export const publishedSettingsSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  version: z.number().int().positive(),
  publishedAt: z.iso.datetime(),
  minRuntime: semver,
  shop: shopSchema,
  links: linksSchema,
  ...appDesignSchema.shape,
});

export type PublishedSettings = z.output<typeof publishedSettingsSchema>;
export type ShopDetails = z.output<typeof shopSchema>;
export type AppLinks = z.output<typeof linksSchema>;

// Builds the file for one publish. Hidden sections and blocks stay in the draft only.
export function buildPublishedSettings(input: {
  design: AppDesign;
  version: number;
  publishedAt: Date;
  shop: ShopDetails;
  links: AppLinks;
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
