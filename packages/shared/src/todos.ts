import { z } from "zod";

export const createTodoSchema = z
  .object({
    title: z.string().trim().min(1).max(500),
    completed: z.boolean().optional().default(false),
  })
  .strict();

export const updateTodoSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    completed: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.completed !== undefined, {
    message: "At least one of title or completed is required",
  });

export const listTodosQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().optional(),
  })
  .strict();

/** Input type — `completed` is optional because the schema applies a default. */
export type CreateTodoInput = z.input<typeof createTodoSchema>;
export type UpdateTodoInput = z.input<typeof updateTodoSchema>;
export type ListTodosQuery = z.infer<typeof listTodosQuerySchema>;

export type Todo = {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TodoListResponse = {
  data: Todo[];
  nextCursor: string | null;
};
