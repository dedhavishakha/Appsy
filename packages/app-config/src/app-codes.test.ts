import { describe, expect, it } from "vitest";
import {
  APP_CODES_FEATURE,
  appCodeStart,
  CODE_START_LENGTH,
  CODE_START_LETTERS,
  codeStart,
  createDefaultDesign,
  savedCodeStart,
  switchAppCodes,
  withCodeStart,
  withoutCodeStart,
} from "./index";

describe("app-only discount codes", () => {
  it("add the store's code start to what shoppers type", () => {
    expect(withCodeStart("POTLI", "K7Q2")).toBe("K7Q2-POTLI");
    expect(withCodeStart("potli", "K7Q2")).toBe("K7Q2-potli");
  });

  it("don't add the start twice when shoppers type the whole code", () => {
    expect(withCodeStart("K7Q2-POTLI", "K7Q2")).toBe("K7Q2-POTLI");
    expect(withCodeStart("k7q2-potli", "K7Q2")).toBe("K7Q2-potli");
  });

  it("show codes without the start, in any case", () => {
    expect(withoutCodeStart("K7Q2-POTLI", "K7Q2")).toBe("POTLI");
    expect(withoutCodeStart("k7q2-potli", "K7Q2")).toBe("potli");
    expect(withoutCodeStart("SAVE10", "K7Q2")).toBe("SAVE10");
    expect(withoutCodeStart("K7Q2-", "K7Q2")).toBe("K7Q2-");
    expect(withoutCodeStart("K7Q2-POTLI", null)).toBe("K7Q2-POTLI");
  });

  it("use only letters and digits that can't be mistaken for each other", () => {
    expect(CODE_START_LETTERS).not.toMatch(/[01ILO]/);
    for (const letter of CODE_START_LETTERS) {
      expect(codeStart.safeParse(letter.repeat(CODE_START_LENGTH)).success).toBe(true);
    }
    expect(codeStart.safeParse("K7Q0").success).toBe(false);
    expect(codeStart.safeParse("k7q2").success).toBe(false);
  });

  it("keep the start while switched off, and add it only while on", () => {
    const design = createDefaultDesign({ defaultCountry: "IN" });
    expect(appCodeStart(design)).toBeNull();

    const on = switchAppCodes(design, true, "K7Q2");
    expect(appCodeStart(on)).toBe("K7Q2");

    const off = switchAppCodes(on, false, "K7Q2");
    expect(appCodeStart(off)).toBeNull();
    expect(savedCodeStart(off)).toBe("K7Q2");
  });

  it("ignore a start that isn't valid", () => {
    const design = createDefaultDesign({ defaultCountry: "IN" });
    const feature = { enabled: true, settings: { start: "0" } };
    const broken = { ...design, features: { ...design.features, [APP_CODES_FEATURE]: feature } };
    expect(appCodeStart(broken)).toBeNull();
  });
});
