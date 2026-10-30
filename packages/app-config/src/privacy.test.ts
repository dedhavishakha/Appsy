import { describe, expect, it } from "vitest";
import {
  APP_POLICY_HEADING,
  appPolicyText,
  DATA_SAFETY_ITEMS,
  dataSafetyItems,
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
    const usage = DATA_SAFETY_ITEMS.find((item) => item.type === "App interactions");
    expect(usage?.what.match(/app opens/g)).toHaveLength(1);
  });

  it("pastes as plain paragraphs", () => {
    expect(text).not.toMatch(/ {2}|\n{3}|^ | $/m);
  });

  it("mentions Google Analytics only for stores that use it", () => {
    expect(text).not.toContain("Google Analytics");
    const withGa4 = appPolicyText("Local noodle", { googleAnalytics: true });
    expect(withGa4).toContain("Google Analytics. If you allow usage data");
    expect(withGa4).not.toMatch(/ {2}|\n{3}|^ | $/m);
  });

  it("mentions notifications only for stores that send them", () => {
    expect(text).not.toContain("Notifications.");
    expect(text).not.toContain("notification address");
    const withPush = appPolicyText("Local noodle", { pushNotifications: true });
    expect(withPush).toContain("Notifications. The app asks before it sends you notifications.");
    expect(withPush).toContain("your bag isn't sent to us");
    expect(withPush).toContain("usage data and notification addresses can be reached only");
    expect(withPush).toContain("270 days after the app was last opened on it");
    expect(withPush).not.toMatch(/ {2}|\n{3}|^ | $/m);
  });
});

describe("Data safety answers", () => {
  it("make only usage data optional, for analytics", () => {
    const optional = DATA_SAFETY_ITEMS.filter((item) => item.optional);
    expect(optional.map((item) => item.type)).toEqual(["App interactions", "Device or other IDs"]);
    expect(optional.every((item) => item.purposes.join() === "Analytics")).toBe(true);
  });

  it("add a rough location and analytics for purchases when Google Analytics is on", () => {
    const items = dataSafetyItems({ googleAnalytics: true });
    expect(items[0]).toMatchObject({ type: "Approximate location", optional: true });
    expect(items.find((item) => item.type === "Purchase history")?.purposes).toEqual([
      "App functionality",
      "Analytics",
    ]);
    expect(items.map((item) => item.type)).toEqual([
      "Approximate location",
      ...DATA_SAFETY_ITEMS.map((item) => item.type),
    ]);
  });

  it("add notification purposes to device IDs when push notifications are on", () => {
    const items = dataSafetyItems({ pushNotifications: true });
    expect(items.map((item) => item.type)).toEqual(DATA_SAFETY_ITEMS.map((item) => item.type));
    const ids = items.find((item) => item.type === "Device or other IDs");
    expect(ids).toMatchObject({
      purposes: ["Analytics", "Developer communications", "Advertising or marketing"],
      optional: true,
    });
    expect(ids?.what).toContain("Firebase Cloud Messaging");
    expect(items.find((item) => item.type === "App interactions")?.what).toContain(
      "not linked to the phone",
    );
  });

  it("list each data type once", () => {
    for (const items of [
      DATA_SAFETY_ITEMS,
      dataSafetyItems({ googleAnalytics: true, pushNotifications: true }),
    ]) {
      const types = items.map((item) => `${item.category} › ${item.type}`);
      expect(new Set(types).size).toBe(types.length);
    }
  });
});
