import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@forge/db";
import { listTodos } from "./todo-service.js";

describe("listTodos", () => {
  it("turns an unknown cursor into a validation error", async () => {
    const db = {
      todo: {
        findMany: vi.fn().mockRejectedValue({ code: "P2025" }),
      },
    } as unknown as PrismaClient;

    await expect(
      listTodos("project-1", { limit: 20, cursor: "missing" }, db),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "validation_error",
    });
  });
});
