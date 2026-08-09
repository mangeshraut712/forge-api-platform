/**
 * Request logging plugin — writes to RequestLog table on response.
 * Uses onResponse hook to capture status code and latency.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { logRequest } from "../services/log-service.js";
import { isPublicRoute } from "../lib/request-utils.js";

export async function requestLoggerPlugin(app: FastifyInstance): Promise<void> {
  const startTimes = new WeakMap<FastifyRequest, number>();

  app.addHook("onRequest", async (req: FastifyRequest) => {
    startTimes.set(req, Date.now());
  });

  app.addHook(
    "onResponse",
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.auth || isPublicRoute(req.url)) {
        return;
      }

      const start = startTimes.get(req);
      const latencyMs = start ? Date.now() - start : 0;

      logRequest({
        projectId: req.auth.project.id,
        apiKeyId: req.auth.apiKey.id,
        method: req.method,
        path: req.url,
        statusCode: reply.statusCode,
        latencyMs,
        requestId: req.requestId,
        errorCode: req.errorCode,
      });
    },
  );
}
