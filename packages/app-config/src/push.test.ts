import { describe, expect, it } from "vitest";
import {
  BAG_REMINDER_DEFAULTS,
  bagReminderOf,
  createDefaultDesign,
  fcmRequest,
  PUSH_CHANNEL,
  PUSH_FEATURE,
  PUSH_TTL_SECONDS,
  pushCampaignInput,
  pushData,
  pushDeviceInput,
  pushMessageBytes,
  pushMessageFits,
  pushTestCode,
  readPushTestCode,
  savedPushSettings,
  setPushSettings,
  switchFeature,
  type PushMessage,
} from "./index";

const message: PushMessage = {
  title: "Diwali sale",
  body: "20% off everything until Sunday.",
  imageUrl: "https://cdn.shopify.com/s/files/1/0001/files/diwali.jpg?width=1024",
  data: {
    campaign: "6f2c1d4e-8a3b-4c5d-9e6f-7a8b9c0d1e2f",
    link: {
      type: "collection",
      id: "gid://shopify/Collection/7",
      handle: "festive",
      title: "Festive",
    },
  },
};

describe("push notification settings", () => {
  it("start with the bag reminder on, and use nothing while the feature is off", () => {
    const design = createDefaultDesign({ defaultCountry: "IN" });
    expect(savedPushSettings(design).bagReminder).toEqual(BAG_REMINDER_DEFAULTS);
    expect(bagReminderOf(design)).toBeNull();
    expect(bagReminderOf(switchFeature(design, PUSH_FEATURE, true))).toEqual(
      BAG_REMINDER_DEFAULTS,
    );
  });

  it("keep the switch when the settings change, and the settings when it's switched", () => {
    const on = switchFeature(createDefaultDesign({ defaultCountry: "IN" }), PUSH_FEATURE, true);
    const quiet = setPushSettings(on, {
      bagReminder: { ...BAG_REMINDER_DEFAULTS, enabled: false },
    });
    expect(quiet.features[PUSH_FEATURE]?.enabled).toBe(true);
    expect(bagReminderOf(quiet)).toBeNull();
    const later = setPushSettings(on, { bagReminder: { ...BAG_REMINDER_DEFAULTS, hours: 24 } });
    const off = switchFeature(later, PUSH_FEATURE, false);
    expect(bagReminderOf(off)).toBeNull();
    expect(savedPushSettings(off).bagReminder.hours).toBe(24);
  });
});

describe("a campaign as the merchant writes it", () => {
  const base = {
    title: "  Diwali sale ",
    body: "20% off",
    image: null,
    link: null,
    countries: ["IN"],
    sendAt: null,
  };

  it("is trimmed and checked", () => {
    expect(pushCampaignInput.parse(base).title).toBe("Diwali sale");
    expect(pushCampaignInput.safeParse({ ...base, title: " " }).success).toBe(false);
    expect(pushCampaignInput.safeParse({ ...base, body: "x".repeat(241) }).success).toBe(false);
    expect(pushCampaignInput.safeParse({ ...base, countries: ["india"] }).success).toBe(false);
    expect(
      pushCampaignInput.safeParse({ ...base, sendAt: "2026-11-01T12:30:00.000Z" }).success,
    ).toBe(true);
  });
});

describe("the message sent to Google", () => {
  it("is a notification for the phone with the app's data as JSON in data.body", () => {
    const request = fcmRequest("phone-token", message).message;
    expect(request.token).toBe("phone-token");
    expect(request.notification).toEqual({
      title: message.title,
      body: message.body,
      image: message.imageUrl,
    });
    expect(pushData.parse(JSON.parse(request.data.body))).toEqual(message.data);
    expect(request.android).toEqual({
      ttl: `${PUSH_TTL_SECONDS}s`,
      notification: { channel_id: PUSH_CHANNEL },
    });
  });

  it("leaves the picture out when there's none", () => {
    expect(fcmRequest("t", { ...message, imageUrl: null }).message.notification).not.toHaveProperty(
      "image",
    );
  });

  it("counts bytes as UTF-8 and stays under FCM's limit", () => {
    const plain = { ...message, title: "a", body: "a", imageUrl: null, data: {} };
    const base = pushMessageBytes(plain);
    // é, ₹ and 🛍: two, three and four bytes in place of "a".
    expect(pushMessageBytes({ ...plain, body: "é" })).toBe(base + 1);
    expect(pushMessageBytes({ ...plain, body: "₹" })).toBe(base + 2);
    expect(pushMessageBytes({ ...plain, body: "\u{1F6CD}" })).toBe(base + 3);
    expect(
      pushMessageFits({ ...message, title: "x".repeat(65), body: "₹".repeat(240) }),
    ).toBe(true);
    expect(pushMessageFits({ ...message, imageUrl: `https://a.com/${"x".repeat(4000)}` })).toBe(
      false,
    );
  });
});

describe("what phones send", () => {
  it("is checked", () => {
    const device = {
      installId: "3f9a0c12-5b6d-4e7f-8a9b-0c1d2e3f4a5b",
      token: "fcm-token",
      platform: "android",
      country: "IN",
    };
    expect(pushDeviceInput.safeParse(device).success).toBe(true);
    expect(pushDeviceInput.safeParse({ ...device, country: "IND" }).success).toBe(false);
    expect(pushDeviceInput.safeParse({ ...device, platform: "web" }).success).toBe(false);
    expect(pushDeviceInput.safeParse({ ...device, installId: "abc" }).success).toBe(false);
  });

  it("includes a short test code staff can type back", () => {
    const code = pushTestCode("3f9a0c12-5b6d-4e7f-8a9b-0c1d2e3f4a5b");
    expect(code).toBe("3F9A-0C12");
    expect(readPushTestCode(code)).toBe("3f9a0c12");
    expect(readPushTestCode(" 3f9a 0c12 ")).toBe("3f9a0c12");
    expect(readPushTestCode("3F9A-0C1")).toBeNull();
    expect(readPushTestCode("ZZZZ-0C12")).toBeNull();
  });
});
