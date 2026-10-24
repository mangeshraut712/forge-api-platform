import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@forge/db";
import { assertProjectOwner, softDeleteUser } from "./index.js";

const NOW = new Date("2026-06-01T00:00:00.000Z");

describe("assertProjectOwner", () => {
  it("returns the owned project", async () => {
    const project = { id: "proj_1", ownerId: "user_1" };
    const db = {
      project: { findFirst: vi.fn().mockResolvedValue(project) },
    } as unknown as PrismaClient;

    await expect(assertProjectOwner(db, "proj_1", "user_1")).resolves.toBe(
      project,
    );
    expect(db.project.findFirst).toHaveBeenCalledWith({
      where: { id: "proj_1", ownerId: "user_1" },
    });
  });

  it("rejects a project the user does not own", async () => {
    const db = {
      project: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaClient;

    await expect(
      assertProjectOwner(db, "proj_1", "user_2"),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("softDeleteUser", () => {
  it("revokes every project key and clears grace windows", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const tx = {
      user: { update: vi.fn().mockResolvedValue({}) },
      project: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ id: "proj_1" }, { id: "proj_2" }]),
      },
      apiKey: { updateMany: vi.fn().mockResolvedValue({ count: 3 }) },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const db = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as unknown as PrismaClient;

    await expect(softDeleteUser(db, "user_1")).resolves.toEqual({
      revokedProjects: 2,
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: "user_1" },
      data: { deletedAt: NOW },
    });
    expect(tx.apiKey.updateMany).toHaveBeenCalledWith({
      where: { projectId: { in: ["proj_1", "proj_2"] } },
      data: { revokedAt: NOW, graceEndsAt: null },
    });
    expect(tx.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user_1" },
    });
    vi.useRealTimers();
  });

  it("does not touch keys when the user has no projects", async () => {
    const tx = {
      user: { update: vi.fn().mockResolvedValue({}) },
      project: { findMany: vi.fn().mockResolvedValue([]) },
      apiKey: { updateMany: vi.fn() },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const db = {
      $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    } as unknown as PrismaClient;

    await expect(softDeleteUser(db, "user_1")).resolves.toEqual({
      revokedProjects: 0,
    });
    expect(tx.apiKey.updateMany).not.toHaveBeenCalled();
  });
});
