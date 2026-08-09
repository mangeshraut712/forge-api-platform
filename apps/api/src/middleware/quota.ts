/**
 * Quota enforcement middleware.
 * Increments the Redis counter for the current window and rejects if over limit.
 * Adds X-RateLimit-* headers to the response.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { checkQuota } from "../services/quota-service.js";
import { sendApiError, quotaExceeded } from "../lib/errors.js";
import { isPublicRoute } from "../lib/request-utils.js";

export async function quotaPlugin(app: FastifyInstance): Promise<void> {
  app.addHook(
    "preHandler",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.auth || isPublicRoute(req.url)) {
        return;
      }

      const result = await checkQuota(req.auth.project.id, req.auth.project);

      reply.header("X-RateLimit-Limit", result.limit);
      reply.header("X-RateLimit-Remaining", result.remaining);
      reply.header("X-RateLimit-Reset", result.resetUnix);

      if (!result.allowed) {
        return sendApiError(
          reply,
          quotaExceeded(
            `Quota exceeded. Resets at ${new Date(result.resetUnix * 1000).toISOString()}`,
          ),
          req.requestId,
        );
      }
    },
  );
}
