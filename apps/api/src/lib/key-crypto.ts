/**
 * API key hashing and generation utilities.
 * Hashing uses SHA-256 with an optional pepper — same scheme as the seed script.
 */
import { createHash, randomBytes } from "node:crypto";
import { env } from "./env.js";
import {
  KEY_PREFIX_BY_ENV,
  KEY_SECRET_BYTES,
  type KeyEnv,
} from "@forge/shared";

export function hashKey(raw: string, pepper = env.apiKeyHashPepper): string {
  return createHash("sha256").update(`${pepper}${raw}`).digest("hex");
}

export function generateKey(environment: KeyEnv): string {
  const secret = randomBytes(KEY_SECRET_BYTES).toString("hex");
  return `${KEY_PREFIX_BY_ENV[environment]}${secret}`;
}
