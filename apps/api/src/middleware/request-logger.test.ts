import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { authContext } from "../test/fixtures.js";
import { requestLoggerPlugin } from "./request-logger.js";

const { logRequest } = vi.hoisted(() => ({
  logRequest: vi.fn(),
}));

vi.mock("../services/log-service.js", () => ({
  logRequest,
}));

async function createApp(options?: {
  auth?: ReturnType<typeof authContext> | null;
  url?: string;
  errorCode?: string;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.addHook("onRequest", async (request) => {
    request.requestId = "req_log";
    if (options?.auth) request.auth = options.auth;
  });
  await requestLoggerPlugin(app);
  app.get(options?.url ?? "/v1/items", async (request, reply) => {
    if (options?.errorCode) request.errorCode = options.errorCode;
    return reply.code(options?.errorCode ? 404 : 200).send({ ok: true });
  });
  return app;
}

describe("request logger", () => {
  let app: FastifyInstance | undefined;

  beforeEach(() => {
    logRequest.mockReset();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("records an authenticated request with its latency and error code", async () => {
    app = await createApp({ auth: authContext(), errorCode: "not_found" });

    const response = await app.inject({
      method: "GET",
      url: "/v1/items?limit=1",
    });

    expect(response.statusCode).toBe(404);
    expect(logRequest).toHaveBeenCalledWith({
      projectId: "proj_1",
      apiKeyId: "key_1",
      method: "GET",
      path: "/v1/items?limit=1",
      statusCode: 404,
      latencyMs: expect.any(Number),
      requestId: "req_log",
      errorCode: "not_found",
    });
    const latency = logRequest.mock.calls[0]?.[0]?.latencyMs as number;
    expect(latency).toBeGreaterThanOrEqual(0);
  });

  it("skips unauthenticated requests", async () => {
    app = await createApp();

    const response = await app.inject({ method: "GET", url: "/v1/items" });

    expect(response.statusCode).toBe(200);
    expect(logRequest).not.toHaveBeenCalled();
  });

  it("skips public routes even when auth is present", async () => {
    app = await createApp({ auth: authContext(), url: "/health" });

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(logRequest).not.toHaveBeenCalled();
  });
});
