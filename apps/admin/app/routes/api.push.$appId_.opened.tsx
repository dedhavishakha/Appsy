import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { pushOpenedInput } from "@appsy/app-config";
import { countAutomationOpen } from "../models/push-automations.server";
import { countOpen } from "../models/push.server";

// POST /api/push/:appId/opened: a shopper opened the app from a campaign or an automatic
// notification. Only which one is sent, not the phone, so Appsy counts opens without knowing
// whose they are; none counts more opens than phones it reached (models/push.server.ts,
// models/push-automations.server.ts).

const MAX_BODY_BYTES = 1024;
const appId = z.uuid();

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
  const opened = pushOpenedInput.safeParse(body);
  if (!opened.success) return reply(400);

  if (opened.data.campaign) await countOpen(id.data, opened.data.campaign);
  if (opened.data.automation) {
    await countAutomationOpen(id.data, opened.data.automation);
  }
  return reply(204);
};
