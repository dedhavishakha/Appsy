import { z } from "zod";
import { hexColor, shopifyGid } from "./fields";

// Setting inputs for the editor, named like Shopify theme settings (text, textarea,
// checkbox, range, select, color, collection, collection_list). Each returns a zod schema
// whose metadata tells the editor which control to draw. Every input has a default, so a
// newly added section is valid straight away.

export type SettingInput =
  | "text"
  | "textarea"
  | "checkbox"
  | "range"
  | "select"
  | "color"
  | "collection"
  | "collection_list";

export const input = {
  text: (title: string, options: { max?: number; default?: string } = {}) =>
    z
      .string()
      .max(options.max ?? 120)
      .default(options.default ?? "")
      .meta({ title, input: "text" }),

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
};

// One property of the form the editor draws: JSON Schema from zod, carrying the input's
// type, label, default and limits.
export type SettingField = {
  title?: string;
  input?: SettingInput;
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
