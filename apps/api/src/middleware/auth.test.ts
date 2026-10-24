import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { ApiError } from "../lib/errors.js";
import { authContext } from "../test/fixtures.js";
import { authPlugin } from "./auth.js";
import { errorHandlerPlugin } from "./error-handler.js";

const { verifyApiKey } = vi.hoisted(() => ({
  verifyApiKey: vi.fn(),
}));

vi.mock("../services/key-service.js", () => ({
  verifyApiKey,
}));

async function createApp(): Promise<{
  app: FastifyInstance;
  handled: () => boolean;
}> {
  const app = Fastify({ logger: false });
  let handled = false;
  app.addHook("onRequest", async (request) => {
    request.requestId = "req_auth";
  });
  await authPlugin(app);
  await errorHandlerPlugin(app);
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/ready", async () => ({ status: "ready" }));
  app.get("/v1/todos", async (request) => {
    handled = true;
    return {
      projectId: request.auth?.project.id ?? null,
      scopes: request.auth?.scopes ?? [],
    };
  });
  return { app, handled: () => handled };
}

describe("auth middleware", () => {
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    verifyApiKey.mockReset();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("rejects a missing or malformed authorization header", async () => {
    const cases = [
      {},
      { authorization: "" },
      { authorization: "Basic secret-token" },
      { authorization: "Bearer" },
      { authorization: "Bearer " },
      { authorization: "Bearer  secret-token" },
      { authorization: "Bearer secret-token extra" },
      { authorization: "Bearer\tsecret-token" },
    ];

    for (const headers of cases) {
      const created = await createApp();
      app = created.app;
      const response = await app.inject({
        method: "GET",
        url: "/v1/todos",
        headers,
      });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: {
          code: "unauthorized",
          message: "Missing or malformed Authorization header",
          request_id: "req_auth",
        },
      });
      expect(verifyApiKey).not.toHaveBeenCalled();
      expect(created.handled()).toBe(false);
      await app.close();
      app = undefined;
    }
  });

  it("passes the bearer token through and attaches the auth context", async () => {
    verifyApiKey.mockResolvedValue(authContext(["todos:read"]));
    const created = await createApp();
    app = created.app;

    const response = await app.inject({
      method: "GET",
      url: "/v1/todos",
      headers: { authorization: "bEaReR secret-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      projectId: "proj_1",
      scopes: ["todos:read"],
    });
    expect(verifyApiKey).toHaveBeenCalledWith("secret-token");
    expect(created.handled()).toBe(true);
  });

  it("forwards API key errors from verification", async () => {
    verifyApiKey.mockRejectedValue(
      new ApiError(403, "key_expired", "API key has expired"),
    );
    const created = await createApp();
    app = created.app;

    const response = await app.inject({
      method: "GET",
      url: "/v1/todos",
      headers: { authorization: "Bearer secret-token" },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: "key_expired",
        message: "API key has expired",
        request_id: "req_auth",
      },
    });
    expect(created.handled()).toBe(false);
  });

  it("hides unexpected verification failures", async () => {
    const created = await createApp();
    app = created.app;

    verifyApiKey.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    const fromError = await app.inject({
      method: "GET",
      url: "/v1/todos",
      headers: { authorization: "Bearer secret-token" },
    });
    verifyApiKey.mockRejectedValueOnce("boom");
    const fromString = await app.inject({
      method: "GET",
      url: "/v1/todos",
      headers: { authorization: "Bearer secret-token" },
    });

    for (const response of [fromError, fromString]) {
      expect(response.statusCode).toBe(401);
      expect(response.json().error).toMatchObject({
        code: "unauthorized",
        message: "Authentication failed",
      });
      expect(JSON.stringify(response.json())).not.toContain("ECONNREFUSED");
    }
  });

  it("skips authentication for health routes only", async () => {
    const created = await createApp();
    app = created.app;
    const headers = { authorization: "Bearer" };

    expect(
      (await app.inject({ method: "GET", url: "/health?probe=true", headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/ready", headers })).statusCode,
    ).toBe(200);

    const healthExtra = await app.inject({
      method: "GET",
      url: "/health/extra",
      headers,
    });
    const healthcare = await app.inject({
      method: "GET",
      url: "/healthcare",
    });

    expect(healthExtra.statusCode).toBe(401);
    expect(healthcare.statusCode).toBe(401);
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it("does not rate limit health probes", async () => {
    const created = await createApp();
    app = created.app;

    for (let attempt = 0; attempt < 101; attempt += 1) {
      const response = await app.inject({ method: "GET", url: "/health" });
      expect(response.statusCode).toBe(200);
    }
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it("rate limits protected routes with a stable error code", async () => {
    const created = await createApp();
    app = created.app;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await app.inject({ method: "GET", url: "/v1/todos" });
      expect(response.statusCode).toBe(401);
    }

    const limited = await app.inject({ method: "GET", url: "/v1/todos" });

    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toEqual({
      code: "rate_limited",
      message: "Too many requests",
      request_id: "req_auth",
    });
    expect(limited.headers["retry-after"]).toBeTruthy();
    expect(verifyApiKey).not.toHaveBeenCalled();
  });
});
