import type { ComponentType } from "react";
import type { z } from "zod";
import type { BlockInstance, PackageManifest, SectionInstance } from "@appsy/app-config";
import {
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
} from "@appsy/sections/manifests";
import { AnnouncementBar } from "./announcement-bar";
import { BannerCarousel } from "./banner-carousel";
import { CollectionBanner } from "./collection-banner";
import { CollectionList } from "./collection-list";
import { CollectionTiles } from "./collection-tiles";
import { Countdown } from "./countdown";
import { FeaturedProduct } from "./featured-product";
import { ImageBanner } from "./image-banner";
import { ImageWithText } from "./image-with-text";
import { MediaGrid } from "./media-grid";
import { MenuItems } from "./menu-items";
import { MenuLinks } from "./menu-links";
import { MultiColumn } from "./multi-column";
import { Offer } from "./offer";
import { ProductDetails } from "./product-details";
import { ProductGrid } from "./product-grid";
import { ProductRow } from "./product-row";
import { RelatedProducts } from "./related-products";
import { RichText } from "./rich-text";
import { ScrollingContent } from "./scrolling-content";
import { Spacer } from "./spacer";
import { Testimonials } from "./testimonials";
import { TextWithIcons } from "./text-with-icons";

type SectionProps<Settings> = { settings: Settings; blocks: BlockInstance[] };

type SectionEntry = {
  manifest: PackageManifest;
  Component: ComponentType<SectionProps<never>>;
};

// Pairs a manifest with the component that draws it, keeping their settings types in step.
function section<Settings extends z.ZodType>(
  manifest: PackageManifest<Settings>,
  Component: ComponentType<SectionProps<z.output<Settings>>>,
): SectionEntry {
  return { manifest, Component: Component as ComponentType<SectionProps<never>> };
}

// The sections this runtime release can draw, by package id.
const SECTIONS: Record<string, SectionEntry> = {
  [imageBanner.id]: section(imageBanner, ImageBanner),
  [bannerCarousel.id]: section(bannerCarousel, BannerCarousel),
  [announcementBar.id]: section(announcementBar, AnnouncementBar),
  [collectionTiles.id]: section(collectionTiles, CollectionTiles),
  [collectionList.id]: section(collectionList, CollectionList),
  [productRow.id]: section(productRow, ProductRow),
  [productDetails.id]: section(productDetails, ProductDetails),
  [productGrid.id]: section(productGrid, ProductGrid),
  [richText.id]: section(richText, RichText),
  [imageWithText.id]: section(imageWithText, ImageWithText),
  [multiColumn.id]: section(multiColumn, MultiColumn),
  [textWithIcons.id]: section(textWithIcons, TextWithIcons),
  [testimonials.id]: section(testimonials, Testimonials),
  [scrollingContent.id]: section(scrollingContent, ScrollingContent),
  [mediaGrid.id]: section(mediaGrid, MediaGrid),
  [featuredProduct.id]: section(featuredProduct, FeaturedProduct),
  [countdown.id]: section(countdown, Countdown),
  [offer.id]: section(offer, Offer),
  [spacer.id]: section(spacer, Spacer),
  [collectionBanner.id]: section(collectionBanner, CollectionBanner),
  [relatedProducts.id]: section(relatedProducts, RelatedProducts),
  [menuItems.id]: section(menuItems, MenuItems),
  [menuLinks.id]: section(menuLinks, MenuLinks),
};

// Draws a page's sections in order. Hidden sections, types this release doesn't know, and
// settings it can't read are skipped, so older apps keep working with newer designs
// (docs/04, section 2).
export function Sections({ sections }: { sections: SectionInstance[] }) {
  return sections.map((instance) => {
    if (instance.hidden) return null;
    const entry = SECTIONS[instance.type];
    if (!entry) return null;
    const settings = entry.manifest.settings.safeParse(instance.settings);
    if (!settings.success) return null;
    const { Component } = entry;
    return (
      <Component key={instance.id} settings={settings.data as never} blocks={instance.blocks} />
    );
  });
}
