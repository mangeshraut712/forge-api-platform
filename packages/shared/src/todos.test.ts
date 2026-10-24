import { describe, expect, it } from "vitest";
import {
  createTodoSchema,
  listTodosQuerySchema,
  updateTodoSchema,
} from "./todos.js";

describe("todo request schemas", () => {
  it("defaults completed to false when creating a todo", () => {
    expect(createTodoSchema.parse({ title: "Ship it" })).toEqual({
      title: "Ship it",
      completed: false,
    });
  });

  it("rejects unknown fields instead of silently dropping them", () => {
    expect(() =>
      createTodoSchema.parse({ title: "Ship it", unexpected: true }),
    ).toThrow();
    expect(() =>
      updateTodoSchema.parse({ completed: true, unexpected: true }),
    ).toThrow();
  });

  it("applies the default page size", () => {
    expect(listTodosQuerySchema.parse({})).toEqual({ limit: 20 });
  });

  it("rejects null bytes in titles and unsafe cursors", () => {
    expect(() => createTodoSchema.parse({ title: "bad\u0000title" })).toThrow();
    expect(() => updateTodoSchema.parse({ title: "bad\u0000title" })).toThrow();
    expect(() => listTodosQuerySchema.parse({ cursor: "../secret" })).toThrow();
    expect(() =>
      listTodosQuerySchema.parse({ cursor: "x".repeat(65) }),
    ).toThrow();
    expect(listTodosQuerySchema.parse({ cursor: "todo_1" })).toMatchObject({
      cursor: "todo_1",
      limit: 20,
    });
  });
});
