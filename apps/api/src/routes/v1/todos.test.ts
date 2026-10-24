import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { FastifyInstance } from "fastify";
import { notFound, validationError } from "../../lib/errors.js";
import { buildServer } from "../../index.js";
import {
  API_KEY_ID,
  PROJECT_ID,
  RAW_KEY,
  authContext,
  sampleTodo,
} from "../../test/fixtures.js";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    verifyApiKey: vi.fn(),
    checkQuota: vi.fn(),
    createTodo: vi.fn(),
    getTodo: vi.fn(),
    listTodos: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
    runIdempotent: vi.fn(),
    logRequest: vi.fn(),
  },
}));

vi.mock("../../services/key-service.js", () => ({
  verifyApiKey: mocks.verifyApiKey,
}));
vi.mock("../../services/quota-service.js", () => ({
  checkQuota: mocks.checkQuota,
}));
vi.mock("../../services/todo-service.js", () => ({
  createTodo: mocks.createTodo,
  getTodo: mocks.getTodo,
  listTodos: mocks.listTodos,
  updateTodo: mocks.updateTodo,
  deleteTodo: mocks.deleteTodo,
}));
vi.mock("../../services/idempotency-service.js", () => ({
  runIdempotent: mocks.runIdempotent,
}));
vi.mock("../../services/log-service.js", () => ({
  logRequest: mocks.logRequest,
}));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function authHeaders(
  extra: Record<string, string | string[]> = {},
): Record<string, string | string[]> {
  return { authorization: `Bearer ${RAW_KEY}`, ...extra };
}

function installDefaults(): void {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.verifyApiKey.mockResolvedValue(authContext());
  mocks.checkQuota.mockResolvedValue({
    allowed: true,
    remaining: 99,
    limit: 100,
    window: "day",
    resetUnix: 1_800_000_000,
  });
  mocks.listTodos.mockResolvedValue({ data: [sampleTodo], nextCursor: null });
  mocks.getTodo.mockResolvedValue(sampleTodo);
  mocks.createTodo.mockResolvedValue(sampleTodo);
  mocks.updateTodo.mockResolvedValue(sampleTodo);
  mocks.deleteTodo.mockResolvedValue(undefined);
  mocks.runIdempotent.mockResolvedValue({
    conflict: false,
    replay: false,
    responseCode: 201,
    responseBody: sampleTodo,
  });
}

describe("todo routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    installDefaults();
  });

  describe("authentication and quota", () => {
    it("rejects a missing credential and replaces an unsafe request id", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/todos",
        headers: { "x-request-id": "bad id" },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe("unauthorized");
      expect(response.headers["x-request-id"]).toMatch(UUID);
      expect(mocks.listTodos).not.toHaveBeenCalled();
      expect(mocks.logRequest).not.toHaveBeenCalled();
    });

    it("rejects a malformed bearer token before verification", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/todos",
        headers: { authorization: "Bearer secret extra" },
      });

      expect(response.statusCode).toBe(401);
      expect(mocks.verifyApiKey).not.toHaveBeenCalled();
    });

    it("rejects a read when the key lacks todos:read", async () => {
      mocks.verifyApiKey.mockResolvedValue(authContext(["todos:write"]));

      const response = await app.inject({
        method: "GET",
        url: "/v1/todos",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toMatchObject({
        code: "insufficient_scope",
        message: "Missing required scope(s): todos:read",
      });
      expect(mocks.listTodos).not.toHaveBeenCalled();
      expect(mocks.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: PROJECT_ID,
          apiKeyId: API_KEY_ID,
          statusCode: 403,
          errorCode: "insufficient_scope",
        }),
      );
    });

    it("rejects an exhausted quota and still returns the quota headers", async () => {
      mocks.checkQuota.mockResolvedValue({
        allowed: false,
        remaining: 0,
        limit: 100,
        window: "day",
        resetUnix: 1_800_000_000,
      });

      const response = await app.inject({
        method: "GET",
        url: "/v1/todos",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(429);
      expect(response.json().error.code).toBe("quota_exceeded");
      expect(response.headers["x-ratelimit-limit"]).toBe("100");
      expect(response.headers["x-ratelimit-remaining"]).toBe("0");
      expect(response.headers["x-ratelimit-reset"]).toBe("1800000000");
      expect(mocks.listTodos).not.toHaveBeenCalled();
      expect(mocks.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 429,
          errorCode: "quota_exceeded",
        }),
      );
    });
  });

  describe("GET /v1/todos", () => {
    it("lists todos with the default page and echoes a safe request id", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/todos",
        headers: authHeaders({ "x-request-id": "job:42" }),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ data: [sampleTodo], nextCursor: null });
      expect(response.headers["x-request-id"]).toBe("job:42");
      expect(response.headers["x-ratelimit-remaining"]).toBe("99");
      expect(mocks.verifyApiKey).toHaveBeenCalledWith(RAW_KEY);
      expect(mocks.listTodos).toHaveBeenCalledWith(PROJECT_ID, { limit: 20 });
      expect(mocks.checkQuota).toHaveBeenCalledWith(
        PROJECT_ID,
        expect.objectContaining({ id: PROJECT_ID, plan: "FREE" }),
      );
      expect(mocks.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: "GET",
          path: "/v1/todos",
          statusCode: 200,
          projectId: PROJECT_ID,
          apiKeyId: API_KEY_ID,
          requestId: "job:42",
        }),
      );
    });

    it("forwards a cursor and page size", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/todos?limit=2&cursor=todo_9",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.listTodos).toHaveBeenCalledWith(PROJECT_ID, {
        limit: 2,
        cursor: "todo_9",
      });
    });

    it.each([
      "limit=0",
      "limit=101",
      "limit=-3",
      "limit=1.5",
      "limit=abc",
      "extra=1",
    ])("rejects invalid query %s", async (query) => {
      const response = await app.inject({
        method: "GET",
        url: `/v1/todos?${query}`,
        headers: authHeaders({ "x-request-id": "trace_422" }),
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error).toMatchObject({
        code: "validation_error",
        message: "Invalid query parameters",
        request_id: "trace_422",
      });
      expect(response.headers["x-request-id"]).toBe("trace_422");
      expect(mocks.listTodos).not.toHaveBeenCalled();
    });

    it("renders an invalid cursor from the service", async () => {
      mocks.listTodos.mockRejectedValue(
        validationError("Invalid pagination cursor"),
      );

      const response = await app.inject({
        method: "GET",
        url: "/v1/todos?cursor=missing",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error).toMatchObject({
        code: "validation_error",
        message: "Invalid pagination cursor",
      });
    });
  });

  describe("GET /v1/todos/:id", () => {
    it("returns one todo", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/v1/todos/todo_1",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(sampleTodo);
      expect(mocks.getTodo).toHaveBeenCalledWith(PROJECT_ID, "todo_1");
    });

    it("returns a not-found envelope", async () => {
      mocks.getTodo.mockRejectedValue(notFound("Todo not found"));

      const response = await app.inject({
        method: "GET",
        url: "/v1/todos/missing",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toMatchObject({
        code: "not_found",
        message: "Todo not found",
      });
    });

    it("hides unexpected read failures", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      mocks.getTodo.mockRejectedValue(new Error("database password=secret"));

      try {
        const response = await app.inject({
          method: "GET",
          url: "/v1/todos/todo_1",
          headers: authHeaders(),
        });

        expect(response.statusCode).toBe(500);
        expect(response.json().error).toMatchObject({
          code: "internal_error",
          message: "Internal server error",
        });
        expect(JSON.stringify(response.json())).not.toContain("password");
        expect(mocks.logRequest).toHaveBeenCalledWith(
          expect.objectContaining({
            statusCode: 500,
            errorCode: "internal_error",
          }),
        );
      } finally {
        spy.mockRestore();
      }
    });
  });

  describe("POST /v1/todos", () => {
    it("creates a todo", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders(),
        payload: { title: "Ship tests", completed: true },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(sampleTodo);
      expect(mocks.createTodo).toHaveBeenCalledWith(PROJECT_ID, {
        title: "Ship tests",
        completed: true,
      });
      expect(mocks.runIdempotent).not.toHaveBeenCalled();
    });

    it("trims the stored title and hashes the raw idempotent body", async () => {
      const tx = { tx: true };
      mocks.runIdempotent.mockImplementation(
        async (
          _projectId: string,
          _key: string,
          _body: unknown,
          operation: (
            client: unknown,
          ) => Promise<{ responseCode: number; responseBody: unknown }>,
        ) => {
          const result = await operation(tx);
          return { conflict: false, replay: false, ...result };
        },
      );

      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders({ "Idempotency-Key": "key-1" }),
        payload: { title: "  Ship tests  " },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.runIdempotent).toHaveBeenCalledWith(
        PROJECT_ID,
        "key-1",
        { title: "  Ship tests  " },
        expect.any(Function),
      );
      expect(mocks.createTodo).toHaveBeenCalledWith(
        PROJECT_ID,
        { title: "Ship tests", completed: false },
        tx,
      );
    });

    it("replays a stored create without writing again", async () => {
      mocks.runIdempotent.mockResolvedValue({
        conflict: false,
        replay: true,
        responseCode: 201,
        responseBody: sampleTodo,
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders({ "idempotency-key": "k".repeat(255) }),
        payload: { title: "Ship tests" },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(sampleTodo);
      expect(mocks.createTodo).not.toHaveBeenCalled();
    });

    it("rejects an idempotency key reused for a different body", async () => {
      mocks.runIdempotent.mockResolvedValue({ conflict: true, replay: false });

      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders({ "idempotency-key": "key-1" }),
        payload: { title: "Ship tests" },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toMatchObject({
        code: "conflict",
        message: "Idempotency key was used with a different request body",
      });
      expect(mocks.createTodo).not.toHaveBeenCalled();
    });

    it.each([
      ["a space", " "],
      ["too long", "k".repeat(256)],
      ["non-ascii", "café"],
    ])("rejects an idempotency key that is %s", async (_label, key) => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders({ "idempotency-key": key }),
        payload: { title: "Ship tests" },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error).toMatchObject({
        code: "validation_error",
        message: "Invalid Idempotency-Key header",
        details: "Use 1-255 printable ASCII characters",
      });
      expect(mocks.runIdempotent).not.toHaveBeenCalled();
    });

    it("combines duplicate idempotency headers into one key", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders({ "idempotency-key": ["one", "two"] }),
        payload: { title: "Ship tests" },
      });

      expect(response.statusCode).toBe(201);
      expect(mocks.runIdempotent).toHaveBeenCalledWith(
        PROJECT_ID,
        "one,two",
        { title: "Ship tests" },
        expect.any(Function),
      );
    });

    it("rejects duplicate idempotency headers that join into an invalid key", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders({ "idempotency-key": ["bad key", "other"] }),
        payload: { title: "Ship tests" },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("validation_error");
      expect(mocks.runIdempotent).not.toHaveBeenCalled();
    });

    it.each([
      ["missing title", {}],
      ["empty title", { title: "" }],
      ["blank title", { title: "   " }],
      ["unknown field", { title: "ok", extra: true }],
      ["string completed", { title: "ok", completed: "yes" }],
      ["numeric title", { title: 12 }],
    ] as const)("rejects a create body with %s", async (_label, payload) => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders(),
        payload,
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error).toMatchObject({
        code: "validation_error",
        message: "Invalid request body",
      });
      expect(Array.isArray(response.json().error.details)).toBe(true);
      expect(mocks.createTodo).not.toHaveBeenCalled();
    });

    it("rejects a title longer than 500 characters", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders(),
        payload: { title: "a".repeat(501) },
      });

      expect(response.statusCode).toBe(422);
      expect(mocks.createTodo).not.toHaveBeenCalled();
    });

    it("rejects a create from a read-only key", async () => {
      mocks.verifyApiKey.mockResolvedValue(authContext(["todos:read"]));

      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders(),
        payload: { title: "Ship tests" },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.message).toContain("todos:write");
      expect(mocks.createTodo).not.toHaveBeenCalled();
    });

    it("rejects invalid JSON before the handler", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders({ "content-type": "application/json" }),
        payload: "{",
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("validation_error");
      expect(mocks.createTodo).not.toHaveBeenCalled();
    });

    it("rejects a plain-text body as invalid", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders({ "content-type": "text/plain" }),
        payload: "hello",
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error).toMatchObject({
        code: "validation_error",
        message: "Invalid request body",
      });
      expect(mocks.createTodo).not.toHaveBeenCalled();
    });

    it("rejects an unsupported content type", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders({ "content-type": "application/xml" }),
        payload: "<title>Ship</title>",
      });

      expect(response.statusCode).toBe(415);
      expect(response.json().error.code).toBe("validation_error");
      expect(mocks.createTodo).not.toHaveBeenCalled();
    });

    it("rejects a body over the one megabyte limit", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/v1/todos",
        headers: authHeaders({ "content-type": "application/json" }),
        payload: JSON.stringify({ title: "x".repeat(1_100_000) }),
      });

      expect(response.statusCode).toBe(413);
      expect(response.json().error.code).toBe("validation_error");
      expect(mocks.createTodo).not.toHaveBeenCalled();
    });
  });

  describe("PUT and PATCH /v1/todos/:id", () => {
    it.each(["PUT", "PATCH"] as const)(
      "updates a todo with %s",
      async (method) => {
        const response = await app.inject({
          method,
          url: "/v1/todos/todo_9",
          headers: authHeaders(),
          payload: method === "PUT" ? { title: "Next" } : { completed: true },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual(sampleTodo);
        expect(mocks.updateTodo).toHaveBeenCalledWith(
          PROJECT_ID,
          "todo_9",
          method === "PUT" ? { title: "Next" } : { completed: true },
        );
        expect(mocks.runIdempotent).not.toHaveBeenCalled();
      },
    );

    it.each(["PUT", "PATCH"] as const)(
      "rejects an empty %s body",
      async (method) => {
        const response = await app.inject({
          method,
          url: "/v1/todos/todo_1",
          headers: authHeaders(),
          payload: {},
        });

        expect(response.statusCode).toBe(422);
        expect(response.json().error.code).toBe("validation_error");
        expect(mocks.updateTodo).not.toHaveBeenCalled();
      },
    );

    it("replays a stored update", async () => {
      mocks.runIdempotent.mockResolvedValue({
        conflict: false,
        replay: true,
        responseCode: 200,
        responseBody: sampleTodo,
      });

      const response = await app.inject({
        method: "PUT",
        url: "/v1/todos/todo_1",
        headers: authHeaders({ "idempotency-key": "update-1" }),
        payload: { title: "Next" },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(sampleTodo);
      expect(mocks.updateTodo).not.toHaveBeenCalled();
    });

    it("rejects a conflicting patch key", async () => {
      mocks.runIdempotent.mockResolvedValue({ conflict: true, replay: false });

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/todos/todo_1",
        headers: authHeaders({ "idempotency-key": "update-1" }),
        payload: { completed: true },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("conflict");
      expect(mocks.updateTodo).not.toHaveBeenCalled();
    });

    it("rejects an invalid idempotency key on update", async () => {
      const response = await app.inject({
        method: "PUT",
        url: "/v1/todos/todo_1",
        headers: authHeaders({ "idempotency-key": "bad key" }),
        payload: { title: "Next" },
      });

      expect(response.statusCode).toBe(422);
      expect(mocks.updateTodo).not.toHaveBeenCalled();
      expect(mocks.runIdempotent).not.toHaveBeenCalled();
    });

    it("passes the idempotent update through the same transaction", async () => {
      const tx = { tx: true };
      mocks.runIdempotent.mockImplementation(
        async (
          _projectId: string,
          _key: string,
          _body: unknown,
          operation: (
            client: unknown,
          ) => Promise<{ responseCode: number; responseBody: unknown }>,
        ) => {
          const result = await operation(tx);
          return { conflict: false, replay: false, ...result };
        },
      );

      const response = await app.inject({
        method: "PATCH",
        url: "/v1/todos/todo_9",
        headers: authHeaders({ "idempotency-key": "~" }),
        payload: { title: "  Next  ", completed: false },
      });

      expect(response.statusCode).toBe(200);
      expect(mocks.updateTodo).toHaveBeenCalledWith(
        PROJECT_ID,
        "todo_9",
        { title: "Next", completed: false },
        tx,
      );
    });

    it("returns not found from an update", async () => {
      mocks.updateTodo.mockRejectedValue(notFound("Todo not found"));

      const response = await app.inject({
        method: "PUT",
        url: "/v1/todos/missing",
        headers: authHeaders(),
        payload: { title: "Next" },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("not_found");
    });
  });

  describe("DELETE /v1/todos/:id", () => {
    it("deletes a todo", async () => {
      const response = await app.inject({
        method: "DELETE",
        url: "/v1/todos/todo_1",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe("");
      expect(mocks.deleteTodo).toHaveBeenCalledWith(PROJECT_ID, "todo_1");
      expect(mocks.logRequest).toHaveBeenCalledWith(
        expect.objectContaining({ method: "DELETE", statusCode: 204 }),
      );
    });

    it("returns not found when the todo is already gone", async () => {
      mocks.deleteTodo.mockRejectedValue(notFound("Todo not found"));

      const response = await app.inject({
        method: "DELETE",
        url: "/v1/todos/missing",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toMatchObject({
        code: "not_found",
        message: "Todo not found",
      });
    });

    it("rejects a delete from a read-only key", async () => {
      mocks.verifyApiKey.mockResolvedValue(authContext(["todos:read"]));

      const response = await app.inject({
        method: "DELETE",
        url: "/v1/todos/todo_1",
        headers: authHeaders(),
      });

      expect(response.statusCode).toBe(403);
      expect(mocks.deleteTodo).not.toHaveBeenCalled();
    });
  });
});
