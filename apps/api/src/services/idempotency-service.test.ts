import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@forge/db";
import { runIdempotent } from "./idempotency-service.js";

function hashBody(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(body ?? null))
    .digest("hex");
}

type Tx = {
  idempotencyRecord: {
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

function createDb() {
  const tx: Tx = {
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "rec_1" }),
    },
  };
  const db = {
    $transaction: vi.fn(async (fn: (client: Tx) => Promise<unknown>) => fn(tx)),
    idempotencyRecord: {
      findUnique: vi.fn(),
    },
  };
  return { db: db as unknown as PrismaClient, tx, raw: db };
}

describe("runIdempotent", () => {
  it("replays the committed response after a unique-key race", async () => {
    const body = { title: "Create once" };
    const { db, raw } = createDb();
    raw.$transaction.mockRejectedValue({ code: "P2002" });
    raw.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: hashBody(body),
      responseCode: 201,
      responseBody: { id: "todo-1" },
    });
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

  it("replays a stored response inside the transaction", async () => {
    const body = { title: "Create once" };
    const { db, tx } = createDb();
    tx.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: hashBody(body),
      responseCode: 200,
      responseBody: { id: "todo_1", title: "Same" },
    });
    const operation = vi.fn();

    await expect(
      runIdempotent("proj_1", "key_1", body, operation, db),
    ).resolves.toEqual({
      conflict: false,
      replay: true,
      responseCode: 200,
      responseBody: { id: "todo_1", title: "Same" },
    });
    expect(operation).not.toHaveBeenCalled();
    expect(tx.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it("reports a conflict when the stored hash differs", async () => {
    const { db, tx } = createDb();
    tx.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: hashBody({ title: "Other" }),
      responseCode: 201,
      responseBody: { id: "todo_1" },
    });
    const operation = vi.fn();

    await expect(
      runIdempotent("proj_1", "key_1", { title: "Create once" }, operation, db),
    ).resolves.toEqual({ conflict: true, replay: false });
    expect(operation).not.toHaveBeenCalled();
  });

  it("stores the operation result for a new key", async () => {
    const body = { title: "Create once" };
    const { db, tx } = createDb();
    const operation = vi.fn(async () => ({
      responseCode: 201,
      responseBody: { id: "todo_1" },
    }));

    await expect(
      runIdempotent("proj_1", "key_1", body, operation, db),
    ).resolves.toEqual({
      conflict: false,
      replay: false,
      responseCode: 201,
      responseBody: { id: "todo_1" },
    });
    expect(operation).toHaveBeenCalledWith(tx);
    expect(tx.idempotencyRecord.create).toHaveBeenCalledWith({
      data: {
        projectId: "proj_1",
        key: "key_1",
        requestHash: hashBody(body),
        responseCode: 201,
        responseBody: { id: "todo_1" },
      },
    });
  });

  it("treats a missing body the same as null when hashing", async () => {
    const { db, tx } = createDb();
    tx.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: hashBody(null),
      responseCode: 200,
      responseBody: { ok: true },
    });

    await expect(
      runIdempotent("proj_1", "key_1", undefined, vi.fn(), db),
    ).resolves.toMatchObject({ conflict: false, replay: true });
  });

  it("propagates an operation failure without storing a response", async () => {
    const { db, tx } = createDb();
    const operation = vi.fn().mockRejectedValue(new Error("insert failed"));

    await expect(
      runIdempotent("proj_1", "key_1", { title: "Create once" }, operation, db),
    ).rejects.toThrow("insert failed");
    expect(tx.idempotencyRecord.create).not.toHaveBeenCalled();
  });

  it("returns a conflict when the raced record has a different hash", async () => {
    const { db, raw } = createDb();
    raw.$transaction.mockRejectedValue({ code: "P2002" });
    raw.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash: hashBody({ title: "Other" }),
      responseCode: 201,
      responseBody: { id: "todo_1" },
    });

    await expect(
      runIdempotent("proj_1", "key_1", { title: "Create once" }, vi.fn(), db),
    ).resolves.toEqual({ conflict: true, replay: false });
  });

  it("rethrows the unique-key error when the raced record is gone", async () => {
    const race = { code: "P2002" };
    const { db, raw } = createDb();
    raw.$transaction.mockRejectedValue(race);
    raw.idempotencyRecord.findUnique.mockResolvedValue(null);

    await expect(
      runIdempotent("proj_1", "key_1", { title: "Create once" }, vi.fn(), db),
    ).rejects.toBe(race);
  });

  it("rethrows unrelated transaction failures", async () => {
    const failure = new Error("timeout");
    const { db, raw } = createDb();
    raw.$transaction.mockRejectedValue(failure);

    await expect(
      runIdempotent("proj_1", "key_1", { title: "Create once" }, vi.fn(), db),
    ).rejects.toBe(failure);
    expect(raw.idempotencyRecord.findUnique).not.toHaveBeenCalled();

    raw.$transaction.mockRejectedValue("nope");
    await expect(
      runIdempotent("proj_1", "key_1", { title: "Create once" }, vi.fn(), db),
    ).rejects.toBe("nope");
  });

  it("propagates a read failure while reconciling a race", async () => {
    const { db, raw } = createDb();
    raw.$transaction.mockRejectedValue({ code: "P2002" });
    raw.idempotencyRecord.findUnique.mockRejectedValue(
      new Error("read failed"),
    );

    await expect(
      runIdempotent("proj_1", "key_1", { title: "Create once" }, vi.fn(), db),
    ).rejects.toThrow("read failed");
  });
});
