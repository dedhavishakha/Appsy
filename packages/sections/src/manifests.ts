import type { PackageManifest } from "@appsy/app-config";
import { announcementBar } from "./announcement-bar/manifest";
import { bannerCarousel } from "./banner-carousel/manifest";
import { collectionBanner } from "./collection-banner/manifest";
import { collectionList } from "./collection-list/manifest";
import { collectionTiles } from "./collection-tiles/manifest";
import { countdown } from "./countdown/manifest";
import { featuredProduct } from "./featured-product/manifest";
import { imageBanner } from "./image-banner/manifest";
import { imageWithText } from "./image-with-text/manifest";
import { mediaGrid } from "./media-grid/manifest";
import { menuItems } from "./menu-items/manifest";
import { menuLinks } from "./menu-links/manifest";
import { multiColumn } from "./multi-column/manifest";
import { offer } from "./offer/manifest";
import { productDetails } from "./product-details/manifest";
import { productGrid } from "./product-grid/manifest";
import { productRow } from "./product-row/manifest";
import { relatedProducts } from "./related-products/manifest";
import { richText } from "./rich-text/manifest";
import { scrollingContent } from "./scrolling-content/manifest";
import { spacer } from "./spacer/manifest";
import { testimonials } from "./testimonials/manifest";
import { textWithIcons } from "./text-with-icons/manifest";

export {
  announcementBar,
  bannerCarousel,
  collectionBanner,
  collectionList,
  collectionTiles,
  countdown,
  featuredProduct,
  imageBanner,
  imageWithText,
  mediaGrid,
  menuItems,
  menuLinks,
  multiColumn,
  offer,
  productDetails,
  productGrid,
  productRow,
  relatedProducts,
  richText,
  scrollingContent,
  spacer,
  testimonials,
  textWithIcons,
};

// Every section in this runtime release, in the order the editor's library lists them.
export const SECTION_MANIFESTS: PackageManifest[] = [
  imageBanner,
  bannerCarousel,
  productRow,
  collectionList,
  collectionTiles,
  featuredProduct,
  richText,
  imageWithText,
  multiColumn,
  textWithIcons,
  mediaGrid,
  scrollingContent,
  testimonials,
  countdown,
  offer,
  announcementBar,
  spacer,
  productDetails,
  relatedProducts,
  productGrid,
  collectionBanner,
  menuItems,
  menuLinks,
];
