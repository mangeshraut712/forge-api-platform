import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { SCOPES } from "@forge/shared";
import { authContext } from "../test/fixtures.js";
import { requireScope } from "./scope.js";

async function createApp(
  required: Parameters<typeof requireScope>[0],
  auth: ReturnType<typeof authContext> | null,
): Promise<{ app: FastifyInstance; handled: () => boolean }> {
  const app = Fastify({ logger: false });
  let handled = false;
  app.addHook("onRequest", async (request) => {
    request.requestId = "req_scope";
    if (auth) request.auth = auth;
  });
  app.get("/v1/todos", { preHandler: requireScope(required) }, async () => {
    handled = true;
    return { ok: true };
  });
  return { app, handled: () => handled };
}

describe("requireScope", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("rejects a request with no auth context", async () => {
    const created = await createApp(SCOPES.TODOS_READ, null);
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/v1/todos" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "No auth context",
        request_id: "req_scope",
      },
    });
    expect(created.handled()).toBe(false);
  });

  it("rejects a key that is missing one required scope", async () => {
    const created = await createApp(
      SCOPES.TODOS_WRITE,
      authContext(["todos:read"]),
    );
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/v1/todos" });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toEqual({
      code: "insufficient_scope",
      message: "Missing required scope(s): todos:write",
      request_id: "req_scope",
    });
    expect(created.handled()).toBe(false);
  });

  it("requires every scope in a list", async () => {
    const created = await createApp(
      [SCOPES.TODOS_READ, SCOPES.TODOS_WRITE],
      authContext(["todos:read"]),
    );
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/v1/todos" });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.message).toBe(
      "Missing required scope(s): todos:read, todos:write",
    );
    expect(created.handled()).toBe(false);
  });

  it("allows a key that has the required scopes", async () => {
    const created = await createApp(
      [SCOPES.TODOS_READ, SCOPES.TODOS_WRITE],
      authContext(),
    );
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/v1/todos" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(created.handled()).toBe(true);
  });
});
