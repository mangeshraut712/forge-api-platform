/**
 * Server actions for API key and project management.
 * Auth is resolved from the server session — never trust client-provided userId.
 */
"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@forge/db";
import { assertProjectOwner } from "@forge/auth";
import {
  ALL_SCOPES,
  KEY_PREFIX_BY_ENV,
  KEY_SECRET_BYTES,
  visibleKeyPrefix,
  type KeyEnv,
  type Scope,
} from "@forge/shared";
import { createHash, randomBytes } from "node:crypto";
import { requireSessionUser } from "./session";

function hashKey(raw: string, pepper = getHashPepper()): string {
  return createHash("sha256").update(`${pepper}${raw}`).digest("hex");
}

function getHashPepper(): string {
  const pepper = process.env.API_KEY_HASH_PEPPER ?? "";
  if (process.env.NODE_ENV === "production" && pepper.length < 32) {
    throw new Error(
      "API_KEY_HASH_PEPPER must be at least 32 characters in production",
    );
  }
  return pepper;
}

function generateKey(environment: KeyEnv): string {
  const secret = randomBytes(KEY_SECRET_BYTES).toString("hex");
  return `${KEY_PREFIX_BY_ENV[environment]}${secret}`;
}

function isValidScopes(scopes: unknown): scopes is Scope[] {
  return (
    Array.isArray(scopes) &&
    scopes.length > 0 &&
    scopes.every((s) => (ALL_SCOPES as string[]).includes(s))
  );
}

export async function createApiKeyAction(params: {
  projectId: string;
  name: string;
  environment: "TEST" | "LIVE";
  scopes: Scope[];
  expiresAt?: string | null;
}): Promise<
  { success: true; rawKey: string } | { success: false; error: string }
> {
  try {
    const user = await requireSessionUser();
    await assertProjectOwner(prisma, params.projectId, user.id);

    const name = params.name.trim();
    if (!name) {
      return { success: false, error: "Key name is required" };
    }
    if (name.length > 100) {
      return {
        success: false,
        error: "Key name must be 100 characters or fewer",
      };
    }
    if (params.environment !== "TEST" && params.environment !== "LIVE") {
      return { success: false, error: "Invalid key environment" };
    }
    if (!isValidScopes(params.scopes)) {
      return { success: false, error: "At least one valid scope is required" };
    }

    let expiresAt: Date | null = null;
    if (params.expiresAt) {
      expiresAt = new Date(params.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        return { success: false, error: "Expiration must be a valid date" };
      }
      if (expiresAt.getTime() <= Date.now()) {
        return { success: false, error: "Expiration must be in the future" };
      }
    }

    const rawKey = generateKey(params.environment);

    await prisma.apiKey.create({
      data: {
        projectId: params.projectId,
        name,
        environment: params.environment,
        keyPrefix: visibleKeyPrefix(rawKey),
        keyHash: hashKey(rawKey),
        scopes: params.scopes,
        ...(expiresAt ? { expiresAt } : {}),
      },
    });

    revalidatePath(`/projects/${params.projectId}/keys`);
    return { success: true, rawKey };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create key",
    };
  }
}

export async function revokeApiKeyAction(params: {
  projectId: string;
  keyId: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await requireSessionUser();
    await assertProjectOwner(prisma, params.projectId, user.id);

    const key = await prisma.apiKey.findFirst({
      where: { id: params.keyId, projectId: params.projectId },
    });
    if (!key) {
      return { success: false, error: "Key not found" };
    }
    if (
      key.revokedAt &&
      (!key.graceEndsAt || key.graceEndsAt.getTime() <= Date.now())
    ) {
      return { success: false, error: "Key is already revoked" };
    }

    await prisma.apiKey.update({
      where: { id: params.keyId },
      data: {
        revokedAt: new Date(),
        // Immediate revoke — clear any remaining grace window
        graceEndsAt: null,
      },
    });

    revalidatePath(`/projects/${params.projectId}/keys`);
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to revoke key",
    };
  }
}

export async function rotateApiKeyAction(params: {
  projectId: string;
  keyId: string;
}): Promise<
  { success: true; rawKey: string } | { success: false; error: string }
> {
  try {
    const user = await requireSessionUser();
    await assertProjectOwner(prisma, params.projectId, user.id);

    const existing = await prisma.apiKey.findFirst({
      where: { id: params.keyId, projectId: params.projectId },
    });
    if (!existing) {
      return { success: false, error: "Key not found" };
    }
    // Only fully-revoked keys (past grace) cannot be rotated
    if (
      existing.revokedAt &&
      (!existing.graceEndsAt || existing.graceEndsAt.getTime() <= Date.now())
    ) {
      return { success: false, error: "Cannot rotate a revoked key" };
    }

    const rawKey = generateKey(existing.environment);
    const now = new Date();
    const graceEndsAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      // Mark old key revoked with a 7-day grace so active clients keep working
      await tx.apiKey.update({
        where: { id: params.keyId },
        data: {
          revokedAt: now,
          graceEndsAt,
        },
      });
      await tx.apiKey.create({
        data: {
          projectId: params.projectId,
          name: existing.name,
          environment: existing.environment,
          keyPrefix: visibleKeyPrefix(rawKey),
          keyHash: hashKey(rawKey),
          scopes: existing.scopes,
          rotatedFromId: params.keyId,
          expiresAt: existing.expiresAt,
        },
      });
    });

    revalidatePath(`/projects/${params.projectId}/keys`);
    return { success: true, rawKey };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to rotate key",
    };
  }
}

export async function createProjectAction(params: {
  name: string;
  slug: string;
}): Promise<
  { success: true; projectId: string } | { success: false; error: string }
> {
  try {
    const user = await requireSessionUser();

    const name = params.name.trim();
    const slug = params.slug
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (!name) {
      return { success: false, error: "Project name is required" };
    }
    if (!slug || slug.length < 2) {
      return { success: false, error: "Slug must be at least 2 characters" };
    }
    if (slug.length > 63) {
      return { success: false, error: "Slug must be 63 characters or fewer" };
    }

    const project = await prisma.project.create({
      data: {
        name,
        slug,
        ownerId: user.id,
        plan: "FREE",
      },
    });
    revalidatePath("/projects");
    return { success: true, projectId: project.id };
  } catch (err) {
    // Unique constraint on (ownerId, slug)
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: string }).code === "P2002"
    ) {
      return {
        success: false,
        error: "A project with this slug already exists",
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to create project",
    };
  }
}
