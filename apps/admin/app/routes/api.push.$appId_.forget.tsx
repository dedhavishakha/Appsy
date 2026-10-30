import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { pushForgetInput } from "@appsy/app-config";
import { forgetPhone } from "../models/push.server";

// POST /api/push/:appId/forget: deletes a phone's notification address when the shopper
// turns notifications off in the app. Public like the route beside it: only the phone knows
// its random install ID. The underscore keeps the address under /api/push/:appId without
// nesting the routes.

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
  const install = pushForgetInput.safeParse(body);
  if (!install.success) return reply(400);

  await forgetPhone(id.data, install.data.installId);
  return reply(204);
};
