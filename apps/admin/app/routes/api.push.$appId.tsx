import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { pushDeviceInput } from "@appsy/app-config";
import db from "../db.server";
import { registerPhone } from "../models/push.server";

// POST /api/push/:appId: a phone whose shopper allowed push notifications, with its address
// from Firebase Cloud Messaging (app-config push.ts). Public like the events route: phones
// call it without a login, and the address is only useful with the store's own Firebase key.
// Phones send it again each day the app opens. Turning notifications off:
// api.push.$appId_.forget.tsx; taps: api.push.$appId_.opened.tsx.

const MAX_BODY_BYTES = 8 * 1024;
// Registrations per install per minute; a phone sends one a day, and when its address changes.
const MAX_PER_MINUTE = 10;
const appId = z.uuid();

const recent = new Map<string, { count: number; since: number }>();

// A simple limit per install, kept in memory: enough for one server.
function tooMany(installId: string, now: number) {
  const entry = recent.get(installId);
  if (!entry || now - entry.since > 60_000) {
    recent.set(installId, { count: 1, since: now });
    if (recent.size > 50_000) recent.clear();
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_PER_MINUTE;
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
  const phone = pushDeviceInput.safeParse(body);
  if (!phone.success) return reply(400);
  if (tooMany(phone.data.installId, Date.now())) return reply(429);

  const app = await db.appProject.findUnique({
    where: { id: id.data },
    select: { id: true },
  });
  if (!app) return reply(404);
  await registerPhone(app.id, phone.data);
  return reply(204);
};
