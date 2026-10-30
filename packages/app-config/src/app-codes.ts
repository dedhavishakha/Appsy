import { z } from "zod";
import type { AppDesign } from "./design";

// App-only discount codes (Appsy's Functionality page). The store creates each code in
// Shopify with its code start, like K7Q2-POTLI, and gives shoppers POTLI. The app adds the
// start before it sends a code to Shopify, so POTLI works in the app and not on the
// website. The start isn't a secret: the app has to know it, and it's in the published
// file. It only keeps app codes away from the website's shoppers.
export const APP_CODES_FEATURE = "app-only-codes";

// Letters and digits that can't be mistaken for each other: no 0, O, 1, I or L.
export const CODE_START_LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_START_LENGTH = 4;
export const codeStart = z.string().regex(/^[A-HJKMNP-Z2-9]{4}$/);

const SEPARATOR = "-";

// The store's code start, kept while app-only codes are off so it stays the same.
export function savedCodeStart(design: Pick<AppDesign, "features">): string | null {
  const start = codeStart.safeParse(design.features[APP_CODES_FEATURE]?.settings.start);
  return start.success ? start.data : null;
}

// The code start the app adds, while app-only codes are on.
export function appCodeStart(design: Pick<AppDesign, "features">): string | null {
  return design.features[APP_CODES_FEATURE]?.enabled === true ? savedCodeStart(design) : null;
}

// A code as shoppers see and type it: without the store's code start. Shopify's codes are
// case-insensitive, so the start matches in any case.
export function withoutCodeStart(code: string, start: string | null): string {
  if (!start) return code;
  const prefix = start + SEPARATOR;
  return code.length > prefix.length && code.slice(0, prefix.length).toUpperCase() === prefix
    ? code.slice(prefix.length)
    : code;
}

// The code the store creates in Shopify for one that shoppers type.
export function withCodeStart(code: string, start: string): string {
  return start + SEPARATOR + withoutCodeStart(code, start);
}

// Switches app-only codes on or off (Appsy's Functionality page), keeping the store's start.
export function switchAppCodes(design: AppDesign, on: boolean, start: string): AppDesign {
  return {
    ...design,
    features: { ...design.features, [APP_CODES_FEATURE]: { enabled: on, settings: { start } } },
  };
}
