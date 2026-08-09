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
});
