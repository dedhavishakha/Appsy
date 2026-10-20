import type { ComponentType } from "react";
import type { z } from "zod";
import type { BlockInstance, PackageManifest } from "@appsy/app-config";
import {
  buyButtons,
  collapsibleTab,
  featureWithIcon,
  productDescription,
  productPrice,
  productTitle,
  separator,
  text,
  variantPicker,
} from "@appsy/blocks/manifests";
import {
  BuyButtons,
  CollapsibleTab,
  FeatureWithIcon,
  ProductDescription,
  ProductPrice,
  ProductTitle,
  Separator,
  TextBlock,
  VariantPicker,
  type ProductBlockState,
} from "./product-blocks";

type BlockEntry = {
  manifest: PackageManifest;
  Component: ComponentType<{ settings: never; state: ProductBlockState }>;
};

// Pairs a block's manifest with the component that draws it.
function block<Settings extends z.ZodType>(
  manifest: PackageManifest<Settings>,
  Component: ComponentType<{ settings: z.output<Settings>; state: ProductBlockState }>,
): BlockEntry {
  return {
    manifest,
    Component: Component as ComponentType<{ settings: never; state: ProductBlockState }>,
  };
}

// The blocks this runtime release can draw, by package id.
const BLOCKS: Record<string, BlockEntry> = {
  [productTitle.id]: block(productTitle, ProductTitle),
  [productPrice.id]: block(productPrice, ProductPrice),
  [variantPicker.id]: block(variantPicker, VariantPicker),
  [buyButtons.id]: block(buyButtons, BuyButtons),
  [productDescription.id]: block(productDescription, ProductDescription),
  [text.id]: block(text, TextBlock),
  [featureWithIcon.id]: block(featureWithIcon, FeatureWithIcon),
  [collapsibleTab.id]: block(collapsibleTab, CollapsibleTab),
  [separator.id]: block(separator, Separator),
};

// Draws a section's blocks in order, skipping hidden ones and any this release doesn't know.
export function ProductBlocks({
  blocks,
  state,
}: {
  blocks: BlockInstance[];
  state: ProductBlockState;
}) {
  return blocks.map((instance) => {
    if (instance.hidden) return null;
    const entry = BLOCKS[instance.type];
    const settings = entry?.manifest.settings.safeParse(instance.settings);
    if (!entry || !settings?.success) return null;
    const { Component } = entry;
    return <Component key={instance.id} settings={settings.data as never} state={state} />;
  });
}
