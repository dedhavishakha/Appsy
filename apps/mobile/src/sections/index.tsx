import type { ComponentType } from "react";
import type { z } from "zod";
import type { PackageManifest, SectionInstance } from "@appsy/app-config";
import { announcementBar, collectionTiles, productRow } from "@appsy/sections/manifests";
import { AnnouncementBar } from "./announcement-bar";
import { CollectionTiles } from "./collection-tiles";
import { ProductRow } from "./product-row";

type SectionEntry = {
  manifest: PackageManifest;
  Component: ComponentType<{ settings: never }>;
};

// Pairs a manifest with the component that draws it, keeping their settings types in step.
function section<Settings extends z.ZodType>(
  manifest: PackageManifest<Settings>,
  Component: ComponentType<{ settings: z.output<Settings> }>,
): SectionEntry {
  return { manifest, Component: Component as ComponentType<{ settings: never }> };
}

// The sections this runtime release can draw, by package id.
const SECTIONS: Record<string, SectionEntry> = {
  [announcementBar.id]: section(announcementBar, AnnouncementBar),
  [collectionTiles.id]: section(collectionTiles, CollectionTiles),
  [productRow.id]: section(productRow, ProductRow),
};

// Draws a page's sections in order. A type this release doesn't know, or settings it can't
// read, is skipped, so older apps keep working with newer designs (docs/04, section 2).
export function Sections({ sections }: { sections: SectionInstance[] }) {
  return sections.map((instance) => {
    const entry = SECTIONS[instance.type];
    if (!entry) return null;
    const settings = entry.manifest.settings.safeParse(instance.settings);
    if (!settings.success) return null;
    const { Component } = entry;
    return <Component key={instance.id} settings={settings.data as never} />;
  });
}
