import { describe, expect, it } from "vitest";
import { APP_RELEASE, APP_RELEASES, releaseAt, releasesSince } from "./index";

describe("app releases", () => {
  it("count up from 1, each with a change", () => {
    APP_RELEASES.forEach((entry, index) => {
      expect(entry.release).toBe(index + 1);
      if (entry.at) expect(Number.isNaN(new Date(entry.at).getTime())).toBe(false);
      expect(entry.change.trim()).not.toBe("");
    });
    expect(APP_RELEASE).toBe(APP_RELEASES.length);
  });

  it("tell what an older build lacks, and nothing for the latest", () => {
    expect(releasesSince(0, "android").map((entry) => entry.change)).toContain(
      "push notifications and bag reminders",
    );
    expect(releasesSince(1, "android")).toHaveLength(APP_RELEASE - 1);
    expect(releasesSince(APP_RELEASE, "android")).toEqual([]);
    expect(releasesSince(APP_RELEASE, "ios")).toEqual([]);
  });

  it("date builds that didn't record their release, never past release 1", () => {
    // Local noodle's version 7 started before push notifications were pushed.
    expect(releaseAt(new Date("2026-10-30T08:47:00Z"))).toBe(0);
    expect(releaseAt(new Date("2026-11-02T10:00:00Z"))).toBe(1);
    expect(releaseAt(new Date("2027-01-01T00:00:00Z"))).toBe(1);
  });
});
