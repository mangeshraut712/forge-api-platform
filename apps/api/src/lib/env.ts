/**
 * Centralized env access with validation.
 * Reads from process.env and exposes a typed object.
 */
function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function csv(name: string, fallback: string[] = []): string[] {
  const v = process.env[name];
  if (!v) return fallback;
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV ?? "development";
const port = Number(process.env.PORT ?? 4000);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const quotaFailMode = process.env.QUOTA_FAIL_MODE ?? "open";
if (quotaFailMode !== "open" && quotaFailMode !== "closed") {
  throw new Error('QUOTA_FAIL_MODE must be either "open" or "closed"');
}

const apiKeyHashPepper = process.env.API_KEY_HASH_PEPPER ?? "";
if (nodeEnv === "production" && apiKeyHashPepper.length < 32) {
  throw new Error(
    "API_KEY_HASH_PEPPER must be at least 32 characters in production",
  );
}

/**
 * Fastify's trustProxy flag. Default is false so a client cannot spoof
 * X-Forwarded-For and bypass the IP rate limit. Set a hop count when the
 * process sits behind a known proxy.
 */
function trustProxySetting(): boolean | number {
  const raw = (process.env.TRUST_PROXY ?? "false").trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false" || raw === "") return false;
  if (/^\d+$/.test(raw)) {
    const hops = Number(raw);
    if (hops >= 0 && hops <= 10) return hops;
  }
  throw new Error(
    'TRUST_PROXY must be "true", "false", or a hop count from 0 to 10',
  );
}

const trustProxy = trustProxySetting();

export const env = {
  nodeEnv,
  isProd: nodeEnv === "production",
  port,
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: required(
    "DATABASE_URL",
    "postgresql://forge:forge@localhost:5432/forge?schema=public",
  ),
  redisUrl: required("REDIS_URL", "redis://localhost:6379"),
  corsOrigins: csv("CORS_ORIGINS", [
    "http://localhost:3000",
    "http://localhost:3001",
  ]),
  apiKeyHashPepper,
  quotaFailMode,
  trustProxy,
};

export type Env = typeof env;
