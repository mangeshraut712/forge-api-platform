/**
 * Todo CRUD routes — v1 API.
 * All routes require auth + quota. Write routes require todos:write, read routes require todos:read.
 * POST/PUT/PATCH support idempotency via the Idempotency-Key header.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  createTodoSchema,
  updateTodoSchema,
  listTodosQuerySchema,
  SCOPES,
  isValidIdempotencyKey,
} from "@forge/shared";
import { requireScope } from "../../middleware/scope.js";
import { conflict, validationError } from "../../lib/errors.js";
import {
  createTodo,
  getTodo,
  listTodos,
  updateTodo,
  deleteTodo,
} from "../../services/todo-service.js";
import { runIdempotent } from "../../services/idempotency-service.js";

const IDEMPOTENCY_HEADER = "idempotency-key";

function getIdempotencyKey(req: FastifyRequest): string | undefined {
  const value = req.headers[IDEMPOTENCY_HEADER];
  if (value === undefined) return undefined;
  if (!isValidIdempotencyKey(value)) {
    throw validationError(
      "Invalid Idempotency-Key header",
      "Use 1-255 printable ASCII characters",
    );
  }
  return value;
}

/**
 * Shared handler for PUT and PATCH — validates the body, checks idempotency,
 * performs the update, and stores the response for future replays.
 */
async function handleTodoUpdate(req: FastifyRequest, reply: FastifyReply) {
  const { id } = req.params as { id: string };
  const parsed = updateTodoSchema.safeParse(req.body);
  if (!parsed.success) {
    throw validationError("Invalid request body", parsed.error.issues);
  }

  const idempotencyKey = getIdempotencyKey(req);
  const projectId = req.auth!.project.id;

  if (idempotencyKey) {
    const result = await runIdempotent(
      projectId,
      idempotencyKey,
      req.body,
      async (tx) => ({
        responseCode: 200,
        responseBody: await updateTodo(projectId, id, parsed.data, tx),
      }),
    );
    if (result.conflict) {
      throw conflict("Idempotency key was used with a different request body");
    }
    return reply.code(result.responseCode).send(result.responseBody);
  }

  return reply.send(await updateTodo(projectId, id, parsed.data));
}

export async function todoRoutes(app: FastifyInstance): Promise<void> {
  // List todos
  app.get(
    "/v1/todos",
    { preHandler: requireScope(SCOPES.TODOS_READ) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = listTodosQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        throw validationError("Invalid query parameters", parsed.error.issues);
      }

      const result = await listTodos(req.auth!.project.id, parsed.data);
      return reply.send(result);
    },
  );

  // Get single todo
  app.get(
    "/v1/todos/:id",
    { preHandler: requireScope(SCOPES.TODOS_READ) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const todo = await getTodo(req.auth!.project.id, id);
      return reply.send(todo);
    },
  );

  // Create todo
  app.post(
    "/v1/todos",
    { preHandler: requireScope(SCOPES.TODOS_WRITE) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = createTodoSchema.safeParse(req.body);
      if (!parsed.success) {
        throw validationError("Invalid request body", parsed.error.issues);
      }

      const idempotencyKey = getIdempotencyKey(req);
      const projectId = req.auth!.project.id;

      if (idempotencyKey) {
        const result = await runIdempotent(
          projectId,
          idempotencyKey,
          req.body,
          async (tx) => ({
            responseCode: 201,
            responseBody: await createTodo(projectId, parsed.data, tx),
          }),
        );
        if (result.conflict) {
          throw conflict(
            "Idempotency key was used with a different request body",
          );
        }
        return reply.code(result.responseCode).send(result.responseBody);
      }

      const todo = await createTodo(projectId, parsed.data);
      return reply.code(201).send(todo);
    },
  );

  // Update todo (full replace)
  app.put(
    "/v1/todos/:id",
    { preHandler: requireScope(SCOPES.TODOS_WRITE) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      return handleTodoUpdate(req, reply);
    },
  );

  // Patch todo (partial update)
  app.patch(
    "/v1/todos/:id",
    { preHandler: requireScope(SCOPES.TODOS_WRITE) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      return handleTodoUpdate(req, reply);
    },
  );

  // Delete todo
  app.delete(
    "/v1/todos/:id",
    { preHandler: requireScope(SCOPES.TODOS_WRITE) },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      await deleteTodo(req.auth!.project.id, id);
      return reply.code(204).send();
    },
  );
}
