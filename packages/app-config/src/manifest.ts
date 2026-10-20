import { z } from "zod";
import { PAGE_NAMES, type PageName } from "./design";
import { semver, slug } from "./fields";

export const PACKAGE_KINDS = [
  "section",
  "block",
  "feature",
  "integration",
  "homeWidget",
] as const;

export type PackageKind = (typeof PACKAGE_KINDS)[number];

// A block a new section starts with: its type alone (the block's own defaults), or with
// settings that replace some of those defaults, like sample text in a Shopify preset.
export type DefaultBlock = string | { type: string; settings?: Record<string, unknown> };

// Describes one package (doc 04, section 3). `settings` drives the editor form and the
// publish check; `defaults` fill a newly added section, block or feature.
export type PackageManifest<Settings extends z.ZodType = z.ZodType> = {
  id: string;
  kind: PackageKind;
  title: string;
  version: string;
  // Oldest runtime release that contains this package. Older phones skip it.
  minRuntime: string;
  plans: "all" | string[];
  settings: Settings;
  defaults: z.input<Settings>;
  // Sections only: the block types the editor may place inside.
  acceptsBlocks?: string[];
  // Sections only: the blocks a newly added section starts with, like a Shopify preset.
  defaultBlocks?: DefaultBlock[];
  // Sections only: the pages it can be added to. See sectionPages() when left out.
  pages?: PageName[];
  partner?: {
    name: string;
    publicSettings: z.ZodType;
    serverSecrets?: string[];
  };
  native?: {
    configPlugins: string[];
    permissions: { ios?: string[]; android?: string[] };
    privacy: { apple: string[]; google: string[] };
  };
};

// Keeps `defaults` type-checked against `settings` while writing a manifest.
export function defineManifest<Settings extends z.ZodType>(
  manifest: PackageManifest<Settings>,
): PackageManifest<Settings> {
  return manifest;
}

export type Catalog = {
  get(kind: PackageKind, id: string): PackageManifest | undefined;
  list(kind: PackageKind): PackageManifest[];
};

const manifestFieldsSchema = z.object({
  id: slug,
  kind: z.enum(PACKAGE_KINDS),
  title: z.string().min(1).max(60),
  version: semver,
  minRuntime: semver,
  plans: z.union([z.literal("all"), z.array(slug).min(1)]),
  acceptsBlocks: z.array(slug).optional(),
  defaultBlocks: z
    .array(
      z.union([
        slug,
        z.object({ type: slug, settings: z.record(z.string(), z.unknown()).optional() }),
      ]),
    )
    .max(10)
    .optional(),
  pages: z.array(z.enum(PAGE_NAMES)).min(1).optional(),
});

// The pages a section can go on. Without a list, the Home, Product and Collection pages:
// the Menu page takes only sections made for the side drawer.
export function sectionPages(manifest: PackageManifest): PageName[] {
  return manifest.pages ?? PAGE_NAMES.filter((page) => page !== "menu");
}

// A section's starting blocks, each as a block type with the settings it starts with.
export function defaultBlocksOf(
  manifest: PackageManifest,
): { type: string; settings: Record<string, unknown> }[] {
  return (manifest.defaultBlocks ?? []).map((block) =>
    typeof block === "string"
      ? { type: block, settings: {} }
      : { type: block.type, settings: block.settings ?? {} },
  );
}

// Every package that a runtime release or the editor knows. It throws on mistakes, so a
// broken manifest fails the tests instead of reaching merchants.
export function createCatalog(manifests: PackageManifest[]): Catalog {
  const byKey = new Map<string, PackageManifest>();
  const problems: string[] = [];

  for (const manifest of manifests) {
    const label = `${manifest.kind} "${manifest.id}"`;
    const fields = manifestFieldsSchema.safeParse(manifest);
    if (!fields.success) {
      problems.push(`${label}: ${z.prettifyError(fields.error)}`);
    }
    if (!manifest.settings.safeParse(manifest.defaults).success) {
      problems.push(`${label}: defaults don't match its settings schema`);
    }
    if (manifest.acceptsBlocks && manifest.kind !== "section") {
      problems.push(`${label}: only sections accept blocks`);
    }
    if (manifest.pages && manifest.kind !== "section") {
      problems.push(`${label}: only sections are limited to pages`);
    }
    for (const { type } of defaultBlocksOf(manifest)) {
      if (!manifest.acceptsBlocks?.includes(type)) {
        problems.push(`${label}: starts with "${type}" blocks but doesn't accept them`);
      }
    }
    const key = `${manifest.kind}:${manifest.id}`;
    if (byKey.has(key)) problems.push(`${label} is listed twice`);
    byKey.set(key, manifest);
  }

  for (const manifest of byKey.values()) {
    for (const blockId of manifest.acceptsBlocks ?? []) {
      if (!byKey.has(`block:${blockId}`)) {
        problems.push(`section "${manifest.id}" accepts unknown block "${blockId}"`);
      }
    }
    // Sample settings must suit the block, or a new section would fail its first save.
    for (const { type, settings } of defaultBlocksOf(manifest)) {
      const block = byKey.get(`block:${type}`);
      const defaults = block?.defaults as Record<string, unknown> | undefined;
      if (block && !block.settings.safeParse({ ...defaults, ...settings }).success) {
        problems.push(`section "${manifest.id}" starts with "${type}" settings that don't match it`);
      }
    }
  }

  if (problems.length > 0) {
    throw new Error(`Invalid package catalog:\n- ${problems.join("\n- ")}`);
  }
  return {
    get: (kind, id) => byKey.get(`${kind}:${id}`),
    list: (kind) => [...byKey.values()].filter((manifest) => manifest.kind === kind),
  };
}
