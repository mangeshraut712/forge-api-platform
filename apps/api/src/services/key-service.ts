/**
 * API key verification and management.
 * Looks up keys by hash, checks revocation/expiry, and updates lastUsedAt.
 */
import { prisma } from "@forge/db";
import { hashKey, generateKey } from "../lib/key-crypto.js";
import { isValidApiKeyFormat, visibleKeyPrefix } from "@forge/shared";
import { ApiError, unauthorized, forbidden } from "../lib/errors.js";
import type { AuthContext } from "../lib/types.js";

export type VerifiedKey = AuthContext;

/**
 * Verify a raw API key and return the auth context (project + scopes).
 * Throws ApiError on invalid/revoked/expired keys.
 */
export async function verifyApiKey(rawKey: string): Promise<VerifiedKey> {
  if (!isValidApiKeyFormat(rawKey)) {
    throw unauthorized("Invalid API key format");
  }

  const keyHash = hashKey(rawKey);
  const apiKey = await prisma.apiKey.findFirst({
    where: { keyHash },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          customDailyLimit: true,
          customMonthlyLimit: true,
        },
      },
    },
  });

  if (!apiKey) {
    throw unauthorized("Unknown API key");
  }

  if (apiKey.revokedAt) {
    // Grace period for rotated keys — still usable until graceEndsAt
    const inGrace =
      apiKey.graceEndsAt != null && apiKey.graceEndsAt.getTime() > Date.now();
    if (!inGrace) {
      throw new ApiError(403, "key_revoked", "API key has been revoked");
    }
  }

  if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
    throw new ApiError(403, "key_expired", "API key has expired");
  }

  // Fire-and-forget lastUsedAt update
  void prisma.apiKey
    .update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});

  return {
    project: apiKey.project,
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      environment: apiKey.environment,
      scopes: apiKey.scopes,
    },
    scopes: apiKey.scopes,
  };
}

/**
 * Create a new API key. Returns the raw key once + the DB record.
 */
export async function createApiKey(params: {
  projectId: string;
  name: string;
  environment: "TEST" | "LIVE";
  scopes: string[];
  expiresAt?: Date | null;
}) {
  const rawKey = generateKey(params.environment);

  const record = await prisma.apiKey.create({
    data: {
      projectId: params.projectId,
      name: params.name,
      environment: params.environment,
      keyPrefix: visibleKeyPrefix(rawKey),
      keyHash: hashKey(rawKey),
      scopes: params.scopes,
      ...(params.expiresAt ? { expiresAt: params.expiresAt } : {}),
    },
  });

  return { rawKey, record };
}

/** Revoke an API key by id within a project. */
export async function revokeApiKey(projectId: string, keyId: string) {
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, projectId },
  });
  if (!key) {
    throw new ApiError(404, "not_found", "API key not found");
  }
  return prisma.apiKey.update({
    where: { id: keyId },
    data: { revokedAt: new Date() },
  });
}

/**
 * Rotate an API key — creates a new key and marks the old one as revoked
 * with a grace period so active clients aren't broken immediately.
 * Returns the new raw key (shown once) + the new record.
 */
export async function rotateApiKey(
  projectId: string,
  keyId: string,
  graceDays = 7,
): Promise<{
  rawKey: string;
  record: Awaited<ReturnType<typeof prisma.apiKey.create>>;
}> {
  const existing = await prisma.apiKey.findFirst({
    where: { id: keyId, projectId },
  });
  if (!existing) {
    throw new ApiError(404, "not_found", "API key not found");
  }
  // Fully revoked (past grace) cannot be rotated
  if (
    existing.revokedAt &&
    (!existing.graceEndsAt || existing.graceEndsAt.getTime() <= Date.now())
  ) {
    throw new ApiError(409, "conflict", "Cannot rotate a revoked key");
  }

  const rawKey = generateKey(existing.environment);
  const now = new Date();
  const graceEndsAt = new Date(now.getTime() + graceDays * 24 * 60 * 60 * 1000);

  const record = await prisma.$transaction(async (tx) => {
    // Revoke old key but keep it usable until graceEndsAt
    await tx.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: now, graceEndsAt },
    });

    // Create new key linked to the old one
    return tx.apiKey.create({
      data: {
        projectId,
        name: existing.name,
        environment: existing.environment,
        keyPrefix: visibleKeyPrefix(rawKey),
        keyHash: hashKey(rawKey),
        scopes: existing.scopes,
        rotatedFromId: keyId,
        expiresAt: existing.expiresAt,
      },
    });
  });

  return { rawKey, record };
}
