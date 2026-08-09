/**
 * Todo CRUD operations scoped to a project.
 * Uses cursor-based pagination for list endpoints.
 */
import { prisma } from "@forge/db";
import type { PrismaClient } from "@forge/db";
import type { Todo, TodoListResponse } from "@forge/shared";
import { notFound, validationError } from "../lib/errors.js";

type TodoDatabase = Pick<PrismaClient, "todo">;

function toTodo(row: {
  id: string;
  title: string;
  completed: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Todo {
  return {
    id: row.id,
    title: row.title,
    completed: row.completed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function createTodo(
  projectId: string,
  input: { title: string; completed?: boolean },
  db: TodoDatabase = prisma,
): Promise<Todo> {
  const row = await db.todo.create({
    data: {
      projectId,
      title: input.title,
      completed: input.completed ?? false,
    },
  });
  return toTodo(row);
}

export async function getTodo(projectId: string, id: string): Promise<Todo> {
  const row = await prisma.todo.findFirst({
    where: { id, projectId },
  });
  if (!row) throw notFound("Todo not found");
  return toTodo(row);
}

export async function listTodos(
  projectId: string,
  query: { limit: number; cursor?: string },
  db: TodoDatabase = prisma,
): Promise<TodoListResponse> {
  // Stable cursor: order by createdAt desc, id desc so ties don't skip/duplicate rows
  let rows;
  try {
    rows = await db.todo.findMany({
      where: { projectId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "P2025"
    ) {
      throw validationError("Invalid pagination cursor");
    }
    throw err;
  }

  const hasMore = rows.length > query.limit;
  const data = hasMore ? rows.slice(0, query.limit) : rows;
  const nextCursor =
    hasMore && data.length > 0 ? data[data.length - 1]!.id : null;

  return {
    data: data.map(toTodo),
    nextCursor,
  };
}

export async function updateTodo(
  projectId: string,
  id: string,
  input: { title?: string; completed?: boolean },
  db: TodoDatabase = prisma,
): Promise<Todo> {
  const existing = await db.todo.findFirst({
    where: { id, projectId },
  });
  if (!existing) throw notFound("Todo not found");

  const row = await db.todo.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.completed !== undefined ? { completed: input.completed } : {}),
    },
  });
  return toTodo(row);
}

export async function deleteTodo(projectId: string, id: string): Promise<void> {
  const existing = await prisma.todo.findFirst({
    where: { id, projectId },
  });
  if (!existing) throw notFound("Todo not found");
  await prisma.todo.delete({ where: { id } });
}
