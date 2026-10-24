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
    // Probes must not consume or be blocked by the caller rate limit.
    allowList: (req) => isPublicRoute(req.url),
    // Quota middleware owns X-RateLimit-* so the two limiters do not overwrite
    // each other. Retry-After still tells clients when they can try again.
    addHeaders: {
      "x-ratelimit-limit": false,
      "x-ratelimit-remaining": false,
      "x-ratelimit-reset": false,
      "retry-after": true,
    },
  });

  // preParsing runs after the route onRequest rate-limit hook, so rejected
  // credentials still consume the IP budget, and before the body is parsed.
  app.addHook(
    "preParsing",
    async (req: FastifyRequest, reply: FastifyReply) => {
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
    },
  );
}
