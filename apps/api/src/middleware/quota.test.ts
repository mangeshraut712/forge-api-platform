import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { quotaExceeded } from "../lib/errors.js";
import { authContext } from "../test/fixtures.js";
import { errorHandlerPlugin } from "./error-handler.js";
import { quotaPlugin } from "./quota.js";

const { checkQuota } = vi.hoisted(() => ({
  checkQuota: vi.fn(),
}));

vi.mock("../services/quota-service.js", () => ({
  checkQuota,
}));

const allowed = {
  allowed: true,
  remaining: 99,
  limit: 100,
  window: "day" as const,
  resetUnix: 1_800_000_000,
};

async function createApp(options?: {
  auth?: ReturnType<typeof authContext> | null;
  url?: string;
}): Promise<{ app: FastifyInstance; handled: () => boolean }> {
  const app = Fastify({ logger: false });
  let handled = false;
  app.addHook("onRequest", async (request) => {
    request.requestId = "req_quota";
    if (options?.auth) request.auth = options.auth;
  });
  await quotaPlugin(app);
  await errorHandlerPlugin(app);
  app.get(options?.url ?? "/v1/todos", async () => {
    handled = true;
    return { ok: true };
  });
  return { app, handled: () => handled };
}

describe("quota middleware", () => {
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    checkQuota.mockReset();
    checkQuota.mockResolvedValue(allowed);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("skips requests that have no auth context", async () => {
    const created = await createApp();
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/v1/todos" });

    expect(response.statusCode).toBe(200);
    expect(checkQuota).not.toHaveBeenCalled();
    expect(created.handled()).toBe(true);
  });

  it("skips public routes even when auth is present", async () => {
    const created = await createApp({
      auth: authContext(),
      url: "/health",
    });
    app = created.app;

    const response = await app.inject({
      method: "GET",
      url: "/health?probe=true",
    });

    expect(response.statusCode).toBe(200);
    expect(checkQuota).not.toHaveBeenCalled();
  });

  it("adds quota headers when the request is allowed", async () => {
    const created = await createApp({ auth: authContext() });
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/v1/todos" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-ratelimit-limit"]).toBe("100");
    expect(response.headers["x-ratelimit-remaining"]).toBe("99");
    expect(response.headers["x-ratelimit-reset"]).toBe("1800000000");
    expect(checkQuota).toHaveBeenCalledWith(
      "proj_1",
      expect.objectContaining({ id: "proj_1", plan: "FREE" }),
    );
    expect(created.handled()).toBe(true);
  });

  it("rejects an exhausted quota before the handler runs", async () => {
    checkQuota.mockResolvedValue({ ...allowed, allowed: false, remaining: 0 });
    const created = await createApp({ auth: authContext() });
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/v1/todos" });

    expect(response.statusCode).toBe(429);
    expect(response.json().error).toMatchObject({
      code: "quota_exceeded",
      request_id: "req_quota",
    });
    expect(response.json().error.message).toContain("Quota exceeded");
    expect(response.headers["x-ratelimit-remaining"]).toBe("0");
    expect(response.headers["x-ratelimit-reset"]).toBe("1800000000");
    expect(created.handled()).toBe(false);
  });

  it("lets a quota service failure reach the error handler", async () => {
    checkQuota.mockRejectedValue(quotaExceeded("Quota service unavailable"));
    const created = await createApp({ auth: authContext() });
    app = created.app;

    const response = await app.inject({ method: "GET", url: "/v1/todos" });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({
      error: {
        code: "quota_exceeded",
        message: "Quota service unavailable",
        request_id: "req_quota",
      },
    });
    expect(created.handled()).toBe(false);
  });
});
