import type { PackageManifest } from "@appsy/app-config";
import { buyButtons } from "./buy-buttons/manifest";
import { callUs } from "./call-us/manifest";
import { card } from "./card/manifest";
import { collapsibleTab } from "./collapsible-tab/manifest";
import { collection } from "./collection/manifest";
import { column } from "./column/manifest";
import { countryPicker } from "./country-picker/manifest";
import { emailUs } from "./email-us/manifest";
import { featureWithIcon } from "./feature-with-icon/manifest";
import { iconText } from "./icon-text/manifest";
import { menuLink } from "./menu-link/manifest";
import { productDescription } from "./product-description/manifest";
import { productPrice } from "./product-price/manifest";
import { productTitle } from "./product-title/manifest";
import { separator } from "./separator/manifest";
import { slide } from "./slide/manifest";
import { testimonial } from "./testimonial/manifest";
import { text } from "./text/manifest";
import { tile } from "./tile/manifest";
import { variantPicker } from "./variant-picker/manifest";
import { whatsappChat } from "./whatsapp-chat/manifest";

export {
  ICON_LABELS,
  LINK_ICON_LABELS,
  type IconName,
  type LinkIconName,
} from "./icons";

export {
  buyButtons,
  callUs,
  card,
  collapsibleTab,
  collection,
  column,
  countryPicker,
  emailUs,
  featureWithIcon,
  iconText,
  menuLink,
  productDescription,
  productPrice,
  productTitle,
  separator,
  slide,
  testimonial,
  text,
  tile,
  variantPicker,
  whatsappChat,
};

// Every block in this runtime release, in the order the editor's library lists them.
export const BLOCK_MANIFESTS: PackageManifest[] = [
  productTitle,
  productPrice,
  variantPicker,
  buyButtons,
  productDescription,
  text,
  featureWithIcon,
  collapsibleTab,
  separator,
  slide,
  column,
  iconText,
  card,
  tile,
  testimonial,
  collection,
  menuLink,
  whatsappChat,
  callUs,
  emailUs,
  countryPicker,
];
