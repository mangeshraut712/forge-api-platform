/**
 * ForgeAPI server — Fastify entry point.
 * Wires CORS, request-id, auth, quota, logging, error handling, and routes.
 */
import "dotenv/config";
import Fastify from "fastify";
import { pathToFileURL } from "node:url";
import { env } from "./lib/env.js";
import { closeRedis } from "./lib/redis.js";
import { corsPlugin } from "./plugins/cors.js";
import { requestIdPlugin } from "./middleware/request-id.js";
import { authPlugin } from "./middleware/auth.js";
import { quotaPlugin } from "./middleware/quota.js";
import { requestLoggerPlugin } from "./middleware/request-logger.js";
import { errorHandlerPlugin } from "./middleware/error-handler.js";
import { healthRoutes } from "./routes/health.js";
import { todoRoutes } from "./routes/v1/todos.js";

async function buildServer() {
  const app = Fastify({
    bodyLimit: 1_048_576,
    logger: {
      level: env.isProd ? "info" : "debug",
      transport: env.isProd
        ? undefined
        : { target: "pino-pretty", options: { colorize: true } },
    },
    trustProxy: true,
  });

  // Plugins (order matters)
  await app.register(corsPlugin);
  await app.register(requestIdPlugin);
  await app.register(authPlugin);
  await app.register(requestLoggerPlugin);
  await app.register(quotaPlugin);
  await app.register(errorHandlerPlugin);

  // Routes
  await app.register(healthRoutes);
  await app.register(todoRoutes);

  return app;
}

async function start() {
  const app = await buildServer();

  try {
    await app.listen({ port: env.port, host: env.host });
    console.log(`\n🚀 ForgeAPI running at http://${env.host}:${env.port}\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received, shutting down...`);
    await app.close();
    await closeRedis();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  start().catch((err) => {
    console.error("Fatal error during startup:", err);
    process.exit(1);
  });
}

export { buildServer };
