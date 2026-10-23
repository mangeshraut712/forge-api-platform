import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@forge/db";
import { ApiError } from "../lib/errors.js";
import {
  createTodo,
  deleteTodo,
  getTodo,
  listTodos,
  updateTodo,
} from "./todo-service.js";

const { prisma } = vi.hoisted(() => ({
  prisma: {
    todo: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock("@forge/db", () => ({ prisma }));

const createdAt = new Date("2026-03-01T00:00:00.000Z");
const updatedAt = new Date("2026-03-02T00:00:00.000Z");

function todoRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "todo_1",
    projectId: "proj_1",
    title: "Ship tests",
    completed: false,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

const todoJson = {
  id: "todo_1",
  title: "Ship tests",
  completed: false,
  createdAt: createdAt.toISOString(),
  updatedAt: updatedAt.toISOString(),
};

describe("todo service", () => {
  beforeEach(() => {
    prisma.todo.findFirst.mockReset();
    prisma.todo.findMany.mockReset();
    prisma.todo.create.mockReset();
    prisma.todo.delete.mockReset();
  });

  describe("createTodo", () => {
    it("defaults completed to false and returns the API shape", async () => {
      const create = vi.fn().mockResolvedValue(todoRow());
      const db = { todo: { create } } as unknown as PrismaClient;

      await expect(
        createTodo("proj_1", { title: "Ship tests" }, db),
      ).resolves.toEqual(todoJson);
      expect(create).toHaveBeenCalledWith({
        data: { projectId: "proj_1", title: "Ship tests", completed: false },
      });
      expect(prisma.todo.create).not.toHaveBeenCalled();
    });

    it("stores an explicit completed flag", async () => {
      const create = vi
        .fn()
        .mockResolvedValue(todoRow({ completed: true, title: "Done" }));
      const db = { todo: { create } } as unknown as PrismaClient;

      await expect(
        createTodo("proj_1", { title: "Done", completed: true }, db),
      ).resolves.toMatchObject({ title: "Done", completed: true });
      expect(create).toHaveBeenCalledWith({
        data: { projectId: "proj_1", title: "Done", completed: true },
      });
    });
  });

  describe("getTodo", () => {
    it("returns a todo owned by the project", async () => {
      prisma.todo.findFirst.mockResolvedValue(todoRow());

      await expect(getTodo("proj_1", "todo_1")).resolves.toEqual(todoJson);
      expect(prisma.todo.findFirst).toHaveBeenCalledWith({
        where: { id: "todo_1", projectId: "proj_1" },
      });
    });

    it("rejects a missing todo", async () => {
      prisma.todo.findFirst.mockResolvedValue(null);

      await expect(getTodo("proj_1", "missing")).rejects.toBeInstanceOf(
        ApiError,
      );
      await expect(getTodo("proj_1", "missing")).rejects.toMatchObject({
        statusCode: 404,
        code: "not_found",
        message: "Todo not found",
      });
    });
  });

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
        message: "Invalid pagination cursor",
      });
    });

    it("rethrows unexpected query failures", async () => {
      const failure = new Error("connection reset");
      const db = {
        todo: { findMany: vi.fn().mockRejectedValue(failure) },
      } as unknown as PrismaClient;

      await expect(listTodos("proj_1", { limit: 20 }, db)).rejects.toBe(
        failure,
      );
      await expect(
        listTodos("proj_1", { limit: 20 }, {
          todo: { findMany: vi.fn().mockRejectedValue({ code: "P2002" }) },
        } as unknown as PrismaClient),
      ).rejects.toEqual({ code: "P2002" });
      await expect(
        listTodos("proj_1", { limit: 20 }, {
          todo: { findMany: vi.fn().mockRejectedValue("boom") },
        } as unknown as PrismaClient),
      ).rejects.toBe("boom");
    });

    it("returns a cursor when another page exists", async () => {
      const findMany = vi
        .fn()
        .mockResolvedValue([
          todoRow({ id: "c" }),
          todoRow({ id: "b" }),
          todoRow({ id: "a" }),
        ]);
      const db = { todo: { findMany } } as unknown as PrismaClient;

      await expect(
        listTodos("proj_1", { limit: 2, cursor: "d" }, db),
      ).resolves.toEqual({
        data: [
          { ...todoJson, id: "c" },
          { ...todoJson, id: "b" },
        ],
        nextCursor: "b",
      });
      expect(findMany).toHaveBeenCalledWith({
        where: { projectId: "proj_1" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 3,
        cursor: { id: "d" },
        skip: 1,
      });
      expect(prisma.todo.findMany).not.toHaveBeenCalled();
    });

    it("omits the cursor once the page is full", async () => {
      const findMany = vi.fn().mockResolvedValue([todoRow()]);
      const db = { todo: { findMany } } as unknown as PrismaClient;

      await expect(listTodos("proj_1", { limit: 20 }, db)).resolves.toEqual({
        data: [todoJson],
        nextCursor: null,
      });
      expect(findMany).toHaveBeenCalledWith({
        where: { projectId: "proj_1" },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 21,
      });
    });
  });

  describe("updateTodo", () => {
    it("patches only the provided fields", async () => {
      const findFirst = vi.fn().mockResolvedValue(todoRow());
      const update = vi
        .fn()
        .mockResolvedValue(todoRow({ title: "Next", completed: true }));
      const db = { todo: { findFirst, update } } as unknown as PrismaClient;

      await expect(
        updateTodo("proj_1", "todo_1", { title: "Next", completed: true }, db),
      ).resolves.toMatchObject({ title: "Next", completed: true });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: "todo_1", projectId: "proj_1" },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: "todo_1" },
        data: { title: "Next", completed: true },
      });
    });

    it.each([
      [{ title: "Next" }, { title: "Next" }],
      [{ completed: false }, { completed: false }],
    ] as const)("writes %j", async (input, data) => {
      const update = vi.fn().mockResolvedValue(todoRow());
      const db = {
        todo: {
          findFirst: vi.fn().mockResolvedValue(todoRow()),
          update,
        },
      } as unknown as PrismaClient;

      await updateTodo("proj_1", "todo_1", input, db);
      expect(update).toHaveBeenCalledWith({
        where: { id: "todo_1" },
        data,
      });
    });

    it("rejects a missing todo before writing", async () => {
      const update = vi.fn();
      const db = {
        todo: {
          findFirst: vi.fn().mockResolvedValue(null),
          update,
        },
      } as unknown as PrismaClient;

      await expect(
        updateTodo("proj_1", "missing", { title: "Next" }, db),
      ).rejects.toMatchObject({ statusCode: 404, message: "Todo not found" });
      expect(update).not.toHaveBeenCalled();
    });
  });

  describe("deleteTodo", () => {
    it("deletes a todo after scoping it to the project", async () => {
      prisma.todo.findFirst.mockResolvedValue(todoRow());
      prisma.todo.delete.mockResolvedValue(todoRow());

      await expect(deleteTodo("proj_1", "todo_1")).resolves.toBeUndefined();
      expect(prisma.todo.findFirst).toHaveBeenCalledWith({
        where: { id: "todo_1", projectId: "proj_1" },
      });
      expect(prisma.todo.delete).toHaveBeenCalledWith({
        where: { id: "todo_1" },
      });
    });

    it("rejects a missing todo before deleting", async () => {
      prisma.todo.findFirst.mockResolvedValue(null);

      await expect(deleteTodo("proj_1", "missing")).rejects.toMatchObject({
        statusCode: 404,
        code: "not_found",
      });
      expect(prisma.todo.delete).not.toHaveBeenCalled();
    });
  });
});
