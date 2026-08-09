/**
 * Idempotency support for POST/PUT/PATCH requests.
 * Stores response by (projectId, key) and replays it on retries.
 * Concurrent first-writes race on the unique constraint and reconcile safely.
 */
import { createHash } from "node:crypto";
import { prisma } from "@forge/db";
import type { Prisma, PrismaClient } from "@forge/db";

function requestHash(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? null))
    .digest("hex");
}

export type IdempotencyResult<T> =
  | { conflict: true; replay: false }
  | { conflict: false; replay: boolean; responseCode: number; responseBody: T };

/**
 * Execute a side effect and persist its response atomically with the key.
 * A concurrent unique-key race rolls back the losing transaction, then
 * replays the response committed by the winner.
 */
export async function runIdempotent<T>(
  projectId: string,
  key: string,
  body: unknown,
  operation: (
    tx: Prisma.TransactionClient,
  ) => Promise<{ responseCode: number; responseBody: T }>,
  db: PrismaClient = prisma,
): Promise<IdempotencyResult<T>> {
  const hash = requestHash(body);

  try {
    return await db.$transaction(async (tx) => {
      const existing = await tx.idempotencyRecord.findUnique({
        where: { projectId_key: { projectId, key } },
      });

      if (existing) {
        if (existing.requestHash !== hash) {
          return { conflict: true, replay: false };
        }
        return {
          conflict: false,
          replay: true,
          responseCode: existing.responseCode,
          responseBody: existing.responseBody as T,
        };
      }

      const result = await operation(tx);
      await tx.idempotencyRecord.create({
        data: {
          projectId,
          key,
          requestHash: hash,
          responseCode: result.responseCode,
          responseBody: result.responseBody as Prisma.InputJsonValue,
        },
      });

      return { conflict: false, replay: false, ...result };
    });
  } catch (err) {
    if (
      !err ||
      typeof err !== "object" ||
      !("code" in err) ||
      (err as { code?: string }).code !== "P2002"
    ) {
      throw err;
    }

    const existing = await db.idempotencyRecord.findUnique({
      where: { projectId_key: { projectId, key } },
    });
    if (!existing) throw err;
    if (existing.requestHash !== hash) {
      return { conflict: true, replay: false };
    }
    return {
      conflict: false,
      replay: true,
      responseCode: existing.responseCode,
      responseBody: existing.responseBody as T,
    };
  }
}
