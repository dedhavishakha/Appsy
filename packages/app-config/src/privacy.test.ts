import { describe, expect, it } from "vitest";
import {
  APP_POLICY_HEADING,
  appPolicyText,
  DATA_SAFETY_ITEMS,
  USAGE_DATA_KEEP_MONTHS,
} from "./index";

describe("the section stores add to their privacy policy", () => {
  const text = appPolicyText("Local noodle");

  it("starts with its heading and names the app", () => {
    expect(text.startsWith(`${APP_POLICY_HEADING}\n\n`)).toBe(true);
    expect(text).toContain("the Local noodle app");
  });

  it("covers what Google asks a policy to say", () => {
    // What's collected, the choice and deletion, who handles it, security, how long.
    expect(text).toContain("searching (but not the words you search for)");
    expect(text).toContain("Privacy choices");
    expect(text).toContain("the usage data already sent from your phone is deleted");
    expect(text).toContain("Appsy, a service by Scopegen");
    expect(text).toContain("encrypted connections (HTTPS)");
    expect(text).toContain(`deleted ${USAGE_DATA_KEEP_MONTHS} months after`);
  });

  it("names each kind of usage event once", () => {
    expect(text.match(/opening the app/g)).toHaveLength(1);
    expect(DATA_SAFETY_ITEMS[0]?.what.match(/app opens/g)).toHaveLength(1);
  });

  it("pastes as plain paragraphs", () => {
    expect(text).not.toMatch(/ {2}|\n{3}|^ | $/m);
  });
});

describe("Data safety answers", () => {
  it("make only usage data optional, for analytics", () => {
    const optional = DATA_SAFETY_ITEMS.filter((item) => item.optional);
    expect(optional.map((item) => item.type)).toEqual(["App interactions", "Device or other IDs"]);
    expect(optional.every((item) => item.purpose === "Analytics")).toBe(true);
  });

  it("list each data type once", () => {
    const types = DATA_SAFETY_ITEMS.map((item) => `${item.category} › ${item.type}`);
    expect(new Set(types).size).toBe(types.length);
  });
});
