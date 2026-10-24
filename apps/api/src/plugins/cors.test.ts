import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { env } from "../lib/env.js";
import { corsPlugin } from "./cors.js";

describe("CORS plugin", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("reflects configured origins and exposes quota headers", async () => {
    const origin = env.corsOrigins[0] ?? "http://localhost:3000";
    app = Fastify({ logger: false });
    await corsPlugin(app);
    app.get("/health", async () => ({ ok: true }));

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(origin);
    expect(response.headers["access-control-allow-credentials"]).not.toBe(
      "true",
    );
    expect(String(response.headers["access-control-expose-headers"])).toContain(
      "X-RateLimit-Remaining",
    );
    expect(String(response.headers["access-control-expose-headers"])).toContain(
      "X-Request-Id",
    );
  });

  it("allows idempotent browser preflight requests", async () => {
    const origin = env.corsOrigins[1] ?? env.corsOrigins[0];
    app = Fastify({ logger: false });
    await corsPlugin(app);
    app.delete("/v1/todos/:id", async () => ({ ok: true }));

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/todos/todo_1",
      headers: {
        origin,
        "access-control-request-method": "DELETE",
        "access-control-request-headers": "idempotency-key,authorization",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(String(response.headers["access-control-allow-methods"])).toContain(
      "DELETE",
    );
    expect(String(response.headers["access-control-allow-methods"])).toContain(
      "PATCH",
    );
    expect(String(response.headers["access-control-allow-headers"])).toMatch(
      /idempotency-key/i,
    );
  });

  it("does not reflect an origin outside the allow list", async () => {
    app = Fastify({ logger: false });
    await corsPlugin(app);
    app.get("/health", async () => ({ ok: true }));

    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://evil.example" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
