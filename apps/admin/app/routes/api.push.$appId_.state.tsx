import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { pushStateInput } from "@appsy/app-config";
import { updatePhoneState } from "../models/push-automations.server";

// POST /api/push/:appId/state: a phone that allows notifications tells Appsy its bag and
// wishlist, for automatic notifications (app-config push-automations.ts pushStateInput), when
// either changes. Public like the registration route (api.push.$appId.tsx); a phone Appsy
// doesn't know gets 404 and tries again once it's registered.

const MAX_BODY_BYTES = 16 * 1024;
// Updates per install per minute: a phone sends one after each change, a few seconds apart.
const MAX_PER_MINUTE = 20;
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
  const state = pushStateInput.safeParse(body);
  if (!state.success) return reply(400);
  if (tooMany(state.data.installId, Date.now())) return reply(429);

  const known = await updatePhoneState(id.data, state.data);
  return reply(known ? 204 : 404);
};
