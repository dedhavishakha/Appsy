import type { PackageManifest } from "@appsy/app-config";
import { announcementBar } from "./announcement-bar/manifest";
import { collectionTiles } from "./collection-tiles/manifest";
import { productRow } from "./product-row/manifest";

export { announcementBar, collectionTiles, productRow };

// Every section in this runtime release, in the order the editor's library lists them.
export const SECTION_MANIFESTS: PackageManifest[] = [
  productRow,
  collectionTiles,
  announcementBar,
];
