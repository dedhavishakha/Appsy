import type { ActionFunctionArgs } from "react-router";
import { z } from "zod";
import { accountDeletionInput } from "@appsy/app-config";
import {
  requestAccountDeletion,
  tooManyDeletions,
} from "../models/account-deletion.server";

// POST /api/accounts/:appId/delete: a signed-in shopper asks, in the app's Account tab, for
// their account to be deleted (models/account-deletion.server.ts). Public like the app's other
// routes; the shopper's Customer Account API token, in the Authorization header as Shopify's
// API takes it, says who they are. Answers 200 with when it was asked, 401 when Shopify
// refuses the token, 404 when the app has no shopper accounts, 503 when the store can't take
// the request now.

const MAX_BODY_BYTES = 1024;
const MAX_TOKEN_LENGTH = 4096;
const appId = z.uuid();

const reply = (status: number) => new Response(null, { status });

export const action = async ({ request, params }: ActionFunctionArgs) => {
  if (request.method !== "POST") return reply(405);
  const id = appId.safeParse(params.appId);
  if (!id.success) return reply(404);
  const token = request.headers.get("authorization")?.trim() ?? "";
  if (!token || token.length > MAX_TOKEN_LENGTH) return reply(401);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return reply(413);
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return reply(413);

  let body: unknown = {};
  try {
    if (text) body = JSON.parse(text);
  } catch {
    return reply(400);
  }
  const input = accountDeletionInput.safeParse(body);
  if (!input.success) return reply(400);
  if (tooManyDeletions(token, Date.now())) return reply(429);

  const result = await requestAccountDeletion(id.data, token, input.data);
  if (result.status !== 200) return reply(result.status);
  return Response.json({ requestedAt: result.requestedAt });
};
