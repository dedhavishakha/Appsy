import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { forgetInstall } from "../models/usage-data.server";

// POST /api/events/:appId/forget: deletes the usage events one install sent, when the
// shopper turns usage data off in the app (components/analytics-provider.tsx). Public like
// the events route beside it: only the phone knows its random install ID. The underscore
// in the file name keeps the address under /api/events/:appId without nesting the routes.

const MAX_BODY_BYTES = 1024;
const appId = z.uuid();
const forgetBody = z.object({ deviceId: z.uuid() });

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
  const install = forgetBody.safeParse(body);
  if (!install.success) return reply(400);

  await forgetInstall(id.data, install.data.deviceId);
  return reply(204);
};
