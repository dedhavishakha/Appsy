import { USAGE_DATA_KEEP_MONTHS } from "@appsy/app-config";
import db from "../db.server";

// Usage events after Appsy stores them (routes/api.events.$appId.tsx) are deleted when the
// shopper turns usage data off (the phone asks, routes/api.events.$appId_.forget.tsx) and
// USAGE_DATA_KEEP_MONTHS after they happen, as Appsy's privacy policy and the section each
// store adds to its own policy promise.

const CLEAN_EVERY_MS = 24 * 60 * 60 * 1000;
const FIRST_CLEAN_AFTER_MS = 60_000;
// Rows per delete, so a big clean-up never holds the table for long.
const BATCH = 5000;

// Everything one install sent to one app.
export async function forgetInstall(appProjectId: string, deviceId: string) {
  const { count } = await db.analyticsEvent.deleteMany({
    where: { appProjectId, deviceId },
  });
  return count;
}

export async function deleteExpiredEvents(now = new Date()) {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - USAGE_DATA_KEEP_MONTHS);
  const apps = await db.appProject.findMany({ select: { id: true } });
  let deleted = 0;
  // One app at a time, so each delete uses the (appProjectId, occurredAt) index. Event
  // times are stored in UTC, as analytics.server.ts reads them.
  for (const app of apps) {
    for (;;) {
      const count = await db.$executeRaw`
        DELETE FROM "AnalyticsEvent" WHERE id IN (
          SELECT id FROM "AnalyticsEvent"
          WHERE "appProjectId" = ${app.id}::uuid
            AND "occurredAt" < (${cutoff}::timestamptz AT TIME ZONE 'UTC')
          LIMIT ${BATCH}::int
        )`;
      deleted += count;
      if (count < BATCH) break;
    }
  }
  return deleted;
}

async function clean() {
  try {
    const deleted = await deleteExpiredEvents();
    if (deleted > 0) {
      console.log(
        `Deleted ${deleted} usage events older than ${USAGE_DATA_KEEP_MONTHS} months.`,
      );
    }
  } catch (error) {
    console.error("Deleting old usage events:", error);
  }
}

// Runs while the server does, from a minute after it starts (this module loads with the
// server build), then once a day. Deleting twice is harmless with more than one server.
declare global {
  // eslint-disable-next-line no-var
  var appsyUsageCleanTimer: NodeJS.Timeout | undefined;
}

if (!globalThis.appsyUsageCleanTimer) {
  globalThis.appsyUsageCleanTimer = setInterval(
    () => void clean(),
    CLEAN_EVERY_MS,
  );
  globalThis.appsyUsageCleanTimer.unref();
  setTimeout(() => void clean(), FIRST_CLEAN_AFTER_MS).unref();
}
