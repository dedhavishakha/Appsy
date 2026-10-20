import type { PackageManifest } from "@appsy/app-config";
import { wishlist } from "./wishlist/manifest";

export { wishlist };

// Every feature this release knows, for the editor's catalog (docs/04, section 3).
export const FEATURE_MANIFESTS: PackageManifest[] = [wishlist];
