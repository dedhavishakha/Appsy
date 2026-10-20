import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import type { IconName, LinkIconName } from "@appsy/blocks/manifests";

export type Glyph = ComponentProps<typeof Ionicons>["name"];

// Appsy's icon ids (packages/blocks/src/icons.ts), drawn with Ionicons.
const GLYPHS: Record<IconName, Glyph> = {
  delivery: "car-outline",
  returns: "return-down-back-outline",
  secure: "lock-closed-outline",
  support: "chatbubble-ellipses-outline",
  gift: "gift-outline",
  star: "star-outline",
  quality: "ribbon-outline",
  eco: "leaf-outline",
  heart: "heart-outline",
  warranty: "shield-checkmark-outline",
  fast: "flash-outline",
  offer: "pricetag-outline",
  payment: "card-outline",
  worldwide: "globe-outline",
  package: "cube-outline",
};

// The side menu's link icons.
export const LINK_GLYPHS: Record<LinkIconName, Glyph> = {
  link: "link-outline",
  store: "storefront-outline",
  calendar: "calendar-outline",
  location: "location-outline",
  info: "information-circle-outline",
  help: "help-circle-outline",
  chat: "chatbubble-outline",
  news: "newspaper-outline",
  gift: "gift-outline",
  offer: "pricetag-outline",
  star: "star-outline",
  heart: "heart-outline",
  delivery: "car-outline",
  returns: "return-down-back-outline",
  instagram: "logo-instagram",
  facebook: "logo-facebook",
  youtube: "logo-youtube",
  tiktok: "logo-tiktok",
  x: "logo-x",
  pinterest: "logo-pinterest",
  linkedin: "logo-linkedin",
  snapchat: "logo-snapchat",
};

export function FeatureIcon({
  name,
  color,
  size = 26,
}: {
  name: IconName;
  color: string;
  size?: number;
}) {
  return <Ionicons name={GLYPHS[name]} size={size} color={color} />;
}
