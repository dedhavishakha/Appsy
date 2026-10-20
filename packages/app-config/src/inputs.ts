import { z } from "zod";
import { hexColor, httpsUrl, shopifyGid } from "./fields";

// Setting inputs for the editor, named like Shopify theme settings (text, textarea,
// checkbox, range, select, color, collection, collection_list, product, image_picker,
// url, link_list), plus datetime, phone and email. Each returns a zod schema whose
// metadata tells the editor which control to draw. Every input has a default, so a newly
// added section is valid straight away.

export type SettingInput =
  | "text"
  | "textarea"
  | "checkbox"
  | "range"
  | "select"
  | "color"
  | "collection"
  | "collection_list"
  | "product"
  | "image_picker"
  | "url"
  | "link_list"
  | "datetime"
  | "phone"
  | "email";

// A picture in the store's Shopify Files, uploaded in the editor. Phones load `url`; the
// id lets the editor manage the file, and the size keeps the picture's shape.
export const imageValue = z.object({
  id: shopifyGid("MediaImage"),
  url: httpsUrl,
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  alt: z.string().max(512).default(""),
});

const handleField = z.string().min(1).max(255);
const titleField = z.string().max(255);

// Where a tap goes. Collections and products open in the app, found by id so a renamed
// handle still works; Shopify pages and web addresses open in an in-app browser.
export const linkValue = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("collection"),
    id: shopifyGid("Collection"),
    handle: handleField,
    title: titleField,
  }),
  z.object({
    type: z.literal("product"),
    id: shopifyGid("Product"),
    handle: handleField,
    title: titleField,
  }),
  z.object({
    type: z.literal("page"),
    id: z.string().min(1).max(255),
    title: titleField,
    url: httpsUrl,
  }),
  z.object({ type: z.literal("url"), url: httpsUrl }),
]);

export type ImageValue = z.output<typeof imageValue>;
export type LinkValue = z.output<typeof linkValue>;

export const input = {
  // `info` is a help line the editor shows under the field.
  text: (title: string, options: { max?: number; default?: string; info?: string } = {}) =>
    z
      .string()
      .max(options.max ?? 120)
      .default(options.default ?? "")
      .meta({ title, input: "text", ...(options.info ? { info: options.info } : {}) }),

  textarea: (title: string, options: { max?: number; default?: string } = {}) =>
    z
      .string()
      .max(options.max ?? 1000)
      .default(options.default ?? "")
      .meta({ title, input: "textarea" }),

  checkbox: (title: string, defaultValue: boolean) =>
    z.boolean().default(defaultValue).meta({ title, input: "checkbox" }),

  range: (
    title: string,
    options: { min: number; max: number; step?: number; default: number },
  ) =>
    z
      .number()
      .int()
      .min(options.min)
      .max(options.max)
      .default(options.default)
      .meta({ title, input: "range", step: options.step ?? 1 }),

  // Phones on an older runtime fall back to the default for choices added later.
  select: <const Choice extends string>(
    title: string,
    labels: Record<Choice, string>,
    defaultValue: NoInfer<Choice>,
  ) =>
    z
      .enum(Object.keys(labels) as [Choice, ...Choice[]])
      .default(defaultValue)
      .catch(defaultValue)
      .meta({ title, input: "select", labels }),

  color: (title: string, defaultValue: string) =>
    hexColor.default(defaultValue).meta({ title, input: "color" }),

  // Empty until the merchant picks one; phones skip the section meanwhile.
  collection: (title: string) =>
    shopifyGid("Collection").nullable().default(null).meta({ title, input: "collection" }),

  collectionList: (title: string, options: { max: number }) =>
    z
      .array(shopifyGid("Collection"))
      .max(options.max)
      .default([])
      .meta({ title, input: "collection_list" }),

  // Empty until the merchant picks one; phones skip the section meanwhile.
  product: (title: string) =>
    shopifyGid("Product").nullable().default(null).meta({ title, input: "product" }),

  // A moment in time, saved in UTC; the editor shows it in the merchant's time zone.
  datetime: (title: string) =>
    z.iso.datetime().nullable().default(null).catch(null).meta({ title, input: "datetime" }),

  // Empty until the merchant uploads one.
  image: (title: string) =>
    imageValue.nullable().default(null).catch(null).meta({ title, input: "image_picker" }),

  // No link until the merchant chooses one. Phones on an older runtime treat a link type
  // added later as no link, and still draw the rest of the section.
  link: (title: string) =>
    linkValue.nullable().default(null).catch(null).meta({ title, input: "url" }),

  // One of the store's menus (Online Store › Navigation in Shopify), saved by its handle as
  // Shopify themes save a link_list. Empty until the merchant picks one; phones skip the
  // section meanwhile.
  menu: (title: string) =>
    z.string().min(1).max(255).nullable().default(null).meta({ title, input: "link_list" }),

  // A phone number with its country code. Empty until the merchant adds one.
  phone: (title: string) =>
    z
      .string()
      .regex(
        /^(\+?[0-9][0-9 ()-]{5,19})?$/,
        "Use a phone number with its country code, like +91 98765 43210",
      )
      .default("")
      .meta({ title, input: "phone" }),

  // Empty until the merchant adds one.
  email: (title: string) =>
    z
      .union([
        z.literal(""),
        z.email("Use an email address like help@yourstore.com").max(254),
      ])
      .default("")
      .meta({ title, input: "email" }),
};

// One property of the form the editor draws: JSON Schema from zod, carrying the input's
// type, label, default and limits.
export type SettingField = {
  title?: string;
  input?: SettingInput;
  info?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  step?: number;
  maxLength?: number;
  maxItems?: number;
  labels?: Record<string, string>;
};

export type SettingsForm = { properties: Record<string, SettingField> };

// Plain data, so the editor's browser code can draw a package's form without zod.
export function settingsForm(settings: z.ZodType): SettingsForm {
  const schema = z.toJSONSchema(settings, { io: "input" }) as {
    properties?: Record<string, SettingField>;
  };
  return { properties: schema.properties ?? {} };
}
