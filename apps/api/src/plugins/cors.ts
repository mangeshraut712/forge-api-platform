/**
 * CORS plugin — configures @fastify/cors from env.
 */
import type { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { env } from "../lib/env.js";

export async function corsPlugin(app: FastifyInstance): Promise<void> {
  await app.register(cors, {
    origin: env.corsOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "Idempotency-Key",
      "X-Request-Id",
    ],
    exposedHeaders: [
      "X-Request-Id",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "X-RateLimit-Reset",
    ],
    credentials: true,
  });
}
