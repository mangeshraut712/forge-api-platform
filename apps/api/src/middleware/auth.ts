/**
 * API key auth middleware.
 * Extracts the bearer token, verifies the key, and attaches auth context.
 * Must run after the request-id plugin.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { verifyApiKey } from "../services/key-service.js";
import { sendApiError, unauthorized, ApiError } from "../lib/errors.js";
import { isPublicRoute } from "../lib/request-utils.js";

function extractBearer(req: FastifyRequest): string | null {
  const auth = req.headers.authorization;
  if (!auth) return null;
  const match = /^Bearer ([^ \t]+)$/i.exec(auth);
  return match ? match[1]! : null;
}

export async function authPlugin(app: FastifyInstance): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
  });

  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health checks
    if (isPublicRoute(req.url)) {
      return;
    }

    const rawKey = extractBearer(req);
    if (!rawKey) {
      return sendApiError(
        reply,
        unauthorized("Missing or malformed Authorization header"),
        req.requestId,
      );
    }

    try {
      req.auth = await verifyApiKey(rawKey);
    } catch (err) {
      if (err instanceof ApiError) {
        return sendApiError(reply, err, req.requestId);
      }
      return sendApiError(
        reply,
        unauthorized("Authentication failed"),
        req.requestId,
      );
    }
  });
}
