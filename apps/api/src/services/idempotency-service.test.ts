import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@forge/db";
import { runIdempotent } from "./idempotency-service.js";

function hashBody(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? null))
    .digest("hex");
}

describe("runIdempotent", () => {
  it("replays the committed response after a unique-key race", async () => {
    const body = { title: "Create once" };
    const db = {
      $transaction: vi.fn().mockRejectedValue({ code: "P2002" }),
      idempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue({
          requestHash: hashBody(body),
          responseCode: 201,
          responseBody: { id: "todo-1" },
        }),
      },
    } as unknown as PrismaClient;
    const operation = vi.fn();

    const result = await runIdempotent(
      "project-1",
      "request-1",
      body,
      operation,
      db,
    );

    expect(result).toEqual({
      conflict: false,
      replay: true,
      responseCode: 201,
      responseBody: { id: "todo-1" },
    });
    expect(operation).not.toHaveBeenCalled();
  });
});
