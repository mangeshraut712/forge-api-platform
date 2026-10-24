import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { ApiError, validationError } from "../lib/errors.js";
import { requestIdPlugin } from "./request-id.js";
import { errorHandlerPlugin } from "./error-handler.js";

async function createApp(options?: { requestId?: boolean }): Promise<{
  app: FastifyInstance;
  errorCode: () => string | undefined;
}> {
  const app = Fastify({ logger: false });
  let lastErrorCode: string | undefined;
  if (options?.requestId !== false) {
    await requestIdPlugin(app);
  }
  app.addHook("onResponse", async (request) => {
    lastErrorCode = request.errorCode;
  });
  await errorHandlerPlugin(app);

  app.get("/invalid", async () => {
    throw validationError("Invalid request body", [{ path: "title" }]);
  });
  app.get("/revoked", async () => {
    throw new ApiError(403, "key_revoked", "API key has been revoked");
  });
  app.get("/limited", async () => {
    const error = new Error(
      "Rate limit exceeded, retry in 1000 ms",
    ) as Error & {
      statusCode: number;
    };
    error.statusCode = 429;
    throw error;
  });
  app.get("/client-error", async () => {
    const error = new Error("Request is invalid") as Error & {
      statusCode: number;
    };
    error.statusCode = 400;
    throw error;
  });
  app.get("/status-500", async () => {
    const error = new Error("still private") as Error & { statusCode: number };
    error.statusCode = 500;
    throw error;
  });
  app.get("/zod", async () => {
    const parsed = z.object({ title: z.string() }).safeParse({});
    if (!parsed.success) throw parsed.error;
    return { ok: true };
  });
  app.get("/boom", async () => {
    throw new Error("database password=secret");
  });

  return { app, errorCode: () => lastErrorCode };
}

describe("error handler", () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
    vi.restoreAllMocks();
  });

  it("renders API errors with their details", async () => {
    const created = await createApp();
    app = created.app;

    const response = await app.inject({
      method: "GET",
      url: "/invalid",
      headers: { "x-request-id": "trace_422" },
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: {
        code: "validation_error",
        message: "Invalid request body",
        request_id: "trace_422",
        details: [{ path: "title" }],
      },
    });
    expect(created.errorCode()).toBe("validation_error");
  });

  it("preserves non-standard API error codes", async () => {
    const created = await createApp();
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/revoked" });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toMatchObject({
      code: "key_revoked",
      message: "API key has been revoked",
    });
    expect(created.errorCode()).toBe("key_revoked");
  });

  it("maps rate limits onto rate_limited without the library message", async () => {
    const created = await createApp();
    app = created.app;

    const response = await app.inject({
      method: "GET",
      url: "/limited",
      headers: { "x-request-id": "trace_429" },
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "rate_limited",
        message: "Too many requests",
        request_id: "trace_429",
      },
    });
    expect(JSON.stringify(response.json())).not.toContain("1000");
    expect(created.errorCode()).toBe("rate_limited");
  });

  it("maps other client errors onto validation_error", async () => {
    const created = await createApp();
    app = created.app;

    const response = await app.inject({
      method: "GET",
      url: "/client-error",
      headers: { "x-request-id": "trace_400" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: "validation_error",
        message: "Request is invalid",
        request_id: "trace_400",
      },
    });
  });

  it("renders zod failures as validation errors", async () => {
    const created = await createApp();
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/zod" });

    expect(response.statusCode).toBe(422);
    expect(response.json().error).toMatchObject({
      code: "validation_error",
      message: "Validation failed",
    });
    expect(response.json().error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: ["title"] })]),
    );
  });

  it("hides unexpected failures", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const created = await createApp();
    app = created.app;

    const response = await app.inject({
      method: "GET",
      url: "/boom",
      headers: { "x-request-id": "trace_500" },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: "internal_error",
        message: "Internal server error",
        request_id: "trace_500",
      },
    });
    expect(JSON.stringify(response.json())).not.toContain("password");
    expect(spy).toHaveBeenCalledWith(
      "[api] unhandled error:",
      expect.objectContaining({ message: "database password=secret" }),
    );
    expect(created.errorCode()).toBe("internal_error");
  });

  it("treats a 500 status on a generic error as an internal failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const created = await createApp();
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/status-500" });

    expect(response.statusCode).toBe(500);
    expect(response.json().error).toMatchObject({
      code: "internal_error",
      message: "Internal server error",
    });
    expect(JSON.stringify(response.json())).not.toContain("still private");
    expect(spy).toHaveBeenCalled();
  });

  it("uses an unknown request id when the request-id plugin did not run", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const created = await createApp({ requestId: false });
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.json().error.request_id).toBe("unknown");
    expect(spy).toHaveBeenCalled();
  });

  it("returns the not-found envelope for an unknown route", async () => {
    const created = await createApp();
    app = created.app;

    const response = await app.inject({
      method: "POST",
      url: "/missing?x=1",
      headers: { "x-request-id": "trace_404" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "not_found",
        message: "Route POST /missing?x=1 not found",
        request_id: "trace_404",
      },
    });
    expect(created.errorCode()).toBe("not_found");
  });
});
