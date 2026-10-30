import {
  appDesignSchema,
  KNOWN_HEADER_ITEMS,
  KNOWN_TABS,
  PAGE_NAMES,
  type AppDesign,
  type PageName,
  type SectionInstance,
} from "./design";
import { sectionPages, type Catalog, type PackageManifest } from "./manifest";

export const MAX_TABS = 5;
export const MAX_HEADER_ITEMS_PER_SIDE = 3;
export const MAX_SECTIONS_PER_PAGE = 50;
export const MAX_BLOCKS_PER_SECTION = 30;

// Tabs and header buttons that open a feature need that feature switched on.
const NEEDS_FEATURE: Partial<Record<string, string>> = {
  wishlist: "wishlist",
  account: "account",
};

export type IssuePath = (string | number)[];
export type DesignIssue = { path: IssuePath; message: string };
export type DesignCheck =
  | { success: true; design: AppDesign }
  | { success: false; issues: DesignIssue[] };

// The editor's check before saving a draft or publishing. Stricter than what phones
// accept: every id must be known to this Appsy version, and every section, block and
// feature must match its package's settings schema. On success, `design` holds the
// settings as the packages parsed them, with defaults filled in.
export function validateDesign(input: unknown, catalog: Catalog): DesignCheck {
  const parsed = appDesignSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      issues: parsed.error.issues.map((issue) => ({
        path: toPath(issue.path),
        message: issue.message,
      })),
    };
  }

  const design = parsed.data;
  const issues: DesignIssue[] = [];
  const { tabs, header } = design.navigation;

  checkIds(tabs, KNOWN_TABS, MAX_TABS, ["navigation", "tabs"], issues);
  if (!tabs.includes("home")) {
    issues.push({ path: ["navigation", "tabs"], message: "The Home tab is required" });
  }
  for (const side of ["left", "right"] as const) {
    checkIds(
      header[side],
      KNOWN_HEADER_ITEMS,
      MAX_HEADER_ITEMS_PER_SIDE,
      ["navigation", "header", side],
      issues,
    );
  }
  const headerItems = [...header.left, ...header.right];
  for (const id of new Set([...tabs, ...headerItems])) {
    const feature = NEEDS_FEATURE[id];
    if (feature && design.features[feature]?.enabled !== true) {
      issues.push({
        path: ["navigation"],
        message: `"${id}" needs the ${feature} feature switched on`,
      });
    }
  }

  const features: AppDesign["features"] = {};
  for (const [id, entry] of Object.entries(design.features)) {
    const settings = checkSettings(
      catalog.get("feature", id),
      entry.settings,
      `Unknown feature "${id}"`,
      ["features", id],
      issues,
    );
    features[id] = { ...entry, settings };
  }

  const pages = {} as AppDesign["pages"];
  for (const name of PAGE_NAMES) {
    const sections = design.pages[name].sections;
    const path: IssuePath = ["pages", name, "sections"];
    if (sections.length > MAX_SECTIONS_PER_PAGE) {
      issues.push({
        path,
        message: `A page can have up to ${MAX_SECTIONS_PER_PAGE} sections`,
      });
    }
    const ids = new Set<string>();
    pages[name] = {
      sections: sections.map((section, index) =>
        checkSection(section, name, [...path, index], catalog, ids, issues),
      ),
    };
  }

  if (issues.length > 0) return { success: false, issues };
  return { success: true, design: { ...design, features, pages } };
}

// Switches an app-wide feature on or off (Appsy's Functionality page) and keeps the design
// valid.
// On, its tab joins the tab bar if there's room, before Account; off, the tabs and header
// buttons that need it go too.
export function switchFeature(design: AppDesign, feature: string, on: boolean): AppDesign {
  const needsIt = (id: string) => NEEDS_FEATURE[id] === feature;
  const { tabs, header } = design.navigation;
  const tab = KNOWN_TABS.find(needsIt);
  let nextTabs = on ? tabs : tabs.filter((id) => !needsIt(id));
  if (on && tab && !tabs.includes(tab) && tabs.length < MAX_TABS) {
    const account = tabs.indexOf("account");
    nextTabs =
      account === -1 ? [...tabs, tab] : [...tabs.slice(0, account), tab, ...tabs.slice(account)];
  }
  return {
    ...design,
    features: {
      ...design.features,
      [feature]: { enabled: on, settings: design.features[feature]?.settings ?? {} },
    },
    navigation: {
      ...design.navigation,
      tabs: nextTabs,
      header: on
        ? header
        : {
            left: header.left.filter((id) => !needsIt(id)),
            right: header.right.filter((id) => !needsIt(id)),
          },
    },
  };
}

function checkSection(
  section: SectionInstance,
  page: PageName,
  path: IssuePath,
  catalog: Catalog,
  ids: Set<string>,
  issues: DesignIssue[],
): SectionInstance {
  checkUniqueId(section.id, path, ids, issues);
  const manifest = catalog.get("section", section.type);
  if (manifest && !sectionPages(manifest).includes(page)) {
    issues.push({ path, message: `"${manifest.title}" can't go on the ${page} page` });
  }
  const settings = checkSettings(
    manifest,
    section.settings,
    `Unknown section type "${section.type}"`,
    path,
    issues,
  );
  if (section.blocks.length > MAX_BLOCKS_PER_SECTION) {
    issues.push({
      path: [...path, "blocks"],
      message: `A section can have up to ${MAX_BLOCKS_PER_SECTION} blocks`,
    });
  }
  const blocks = section.blocks.map((block, index) => {
    const blockPath = [...path, "blocks", index];
    checkUniqueId(block.id, blockPath, ids, issues);
    if (manifest && !manifest.acceptsBlocks?.includes(block.type)) {
      issues.push({
        path: blockPath,
        message: `"${manifest.title}" doesn't accept "${block.type}" blocks`,
      });
    }
    const blockSettings = checkSettings(
      catalog.get("block", block.type),
      block.settings,
      `Unknown block type "${block.type}"`,
      blockPath,
      issues,
    );
    return { ...block, settings: blockSettings };
  });
  return { ...section, settings, blocks };
}

function checkSettings(
  manifest: PackageManifest | undefined,
  settings: Record<string, unknown>,
  unknownMessage: string,
  path: IssuePath,
  issues: DesignIssue[],
): Record<string, unknown> {
  if (!manifest) {
    issues.push({ path, message: unknownMessage });
    return settings;
  }
  const result = manifest.settings.safeParse(settings);
  if (!result.success) {
    for (const issue of result.error.issues) {
      issues.push({
        path: [...path, "settings", ...toPath(issue.path)],
        message: issue.message,
      });
    }
    return settings;
  }
  return result.data as Record<string, unknown>;
}

function checkIds(
  ids: string[],
  known: readonly string[],
  max: number,
  path: IssuePath,
  issues: DesignIssue[],
) {
  if (ids.length > max) issues.push({ path, message: `Choose up to ${max}` });
  if (new Set(ids).size !== ids.length) {
    issues.push({ path, message: "Each item can appear only once" });
  }
  for (const id of ids) {
    if (!known.includes(id)) issues.push({ path, message: `Unknown item "${id}"` });
  }
}

function checkUniqueId(
  id: string,
  path: IssuePath,
  ids: Set<string>,
  issues: DesignIssue[],
) {
  if (ids.has(id)) {
    issues.push({ path: [...path, "id"], message: `The id "${id}" is used twice on this page` });
  }
  ids.add(id);
}

function toPath(path: PropertyKey[]): IssuePath {
  return path.map((key) => (typeof key === "symbol" ? String(key) : key));
}
