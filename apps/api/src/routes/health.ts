/**
 * Health check routes — no auth required.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "@forge/db";
import { getRedis } from "../lib/redis.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  app.get("/ready", async (_req, reply: FastifyReply) => {
    const [database, redis] = await Promise.allSettled([
      prisma.$queryRaw`SELECT 1`,
      getRedis().ping(),
    ]);
    const ready =
      database.status === "fulfilled" && redis.status === "fulfilled";

    if (!ready) {
      app.log.warn(
        {
          database: database.status,
          redis: redis.status,
        },
        "readiness check failed",
      );
      return reply.code(503).send({
        status: "not_ready",
        timestamp: new Date().toISOString(),
      });
    }

    return reply.send({
      status: "ready",
      timestamp: new Date().toISOString(),
    });
  });
}
