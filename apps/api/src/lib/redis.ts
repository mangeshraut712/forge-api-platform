/**
 * Shared Redis client (ioredis) for quota counters and rate limiting.
 * Lazily created so the API can boot even if Redis is temporarily down.
 */
import { Redis } from "ioredis";
import { env } from "./env.js";

export type RedisClient = Redis;

let _client: RedisClient | null = null;

export function getRedis(): RedisClient {
  if (!_client) {
    _client = new Redis(env.redisUrl, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    _client.on("error", (err: Error) => {
      // Don't crash the process — quota middleware handles failures gracefully.
      console.error("[redis] error:", err.message);
    });
  }
  return _client;
}

export async function closeRedis(): Promise<void> {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}
