/**
 * Health check routes — no auth required.
 */
import type { FastifyInstance, FastifyReply } from "fastify";
import { prisma } from "@forge/db";
import { getRedis } from "../lib/redis.js";

const READINESS_TIMEOUT_MS = 2_000;

function withTimeout<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
  const pending = work();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("dependency timeout"));
    }, timeoutMs);
    pending.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  app.get("/ready", async (_req, reply: FastifyReply) => {
    const [database, redis] = await Promise.allSettled([
      withTimeout(() => prisma.$queryRaw`SELECT 1`, READINESS_TIMEOUT_MS),
      withTimeout(() => getRedis().ping(), READINESS_TIMEOUT_MS),
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
