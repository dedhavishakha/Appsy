import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { analyticsBatchSchema, checkAnalyticsEvent } from "@appsy/app-config";
import db from "../db.server";

// Usage events from merchant apps (docs/04, section 7). Public like the published design:
// phones send events only after the shopper allows it, and the events hold no names, emails
// or typed text. Events this version doesn't know, or that don't match their format, are
// dropped and the rest kept, so phones on other runtime versions keep working.

const MAX_BODY_BYTES = 64 * 1024;
// Batches per install per minute. A phone sends one every 20 seconds at most.
const MAX_BATCHES_PER_MINUTE = 30;
const appId = z.uuid();

const recent = new Map<string, { count: number; since: number }>();

// A simple limit per install, kept in memory: enough for one server. Hosting (Phase 4)
// moves it to a shared store when there's more than one.
function tooMany(deviceId: string, now: number) {
  const entry = recent.get(deviceId);
  if (!entry || now - entry.since > 60_000) {
    recent.set(deviceId, { count: 1, since: now });
    if (recent.size > 50_000) recent.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_BATCHES_PER_MINUTE;
}

const reply = (status: number) => new Response(null, { status });

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return reply(405);
  const id = appId.safeParse(params.appId);
  if (!id.success) return reply(404);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return reply(413);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return reply(413);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply(400);
  }
  const batch = analyticsBatchSchema.safeParse(body);
  if (!batch.success) return reply(400);

  const now = Date.now();
  if (tooMany(batch.data.deviceId, now)) return reply(429);
  const app = await db.appProject.findUnique({
    where: { id: id.data },
    select: { id: true },
  });
  if (!app) return reply(404);

  const rows = batch.data.events.flatMap((event) => {
    const checked = checkAnalyticsEvent(event, now);
    return checked
      ? [
          {
            appProjectId: app.id,
            deviceId: batch.data.deviceId,
            sessionId: checked.sessionId,
            name: checked.name,
            props: checked.props as Record<string, string | number>,
            occurredAt: checked.occurredAt,
          },
        ]
      : [];
  });
  if (rows.length > 0) await db.analyticsEvent.createMany({ data: rows });
  return reply(204);
};
