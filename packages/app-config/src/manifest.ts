import { z } from "zod";
import { semver, slug } from "./fields";

export const PACKAGE_KINDS = [
  "section",
  "block",
  "feature",
  "integration",
  "homeWidget",
] as const;

export type PackageKind = (typeof PACKAGE_KINDS)[number];

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
});

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
  }

  if (problems.length > 0) {
    throw new Error(`Invalid package catalog:\n- ${problems.join("\n- ")}`);
  }
  return {
    get: (kind, id) => byKey.get(`${kind}:${id}`),
    list: (kind) => [...byKey.values()].filter((manifest) => manifest.kind === kind),
  };
}
