import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { requestIdPlugin } from "./request-id.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

describe("request id middleware", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("echoes a safe client id and replaces an unsafe one", async () => {
    app = Fastify({ logger: false });
    await requestIdPlugin(app);
    app.get("/ping", async (request) => ({ id: request.requestId }));

    const safe = await app.inject({
      method: "GET",
      url: "/ping",
      headers: { "x-request-id": "abc.DEF_123:xyz-" },
    });
    const unsafe = await app.inject({
      method: "GET",
      url: "/ping",
      headers: { "x-request-id": "bad id" },
    });
    const empty = await app.inject({
      method: "GET",
      url: "/ping",
      headers: { "x-request-id": "" },
    });
    const missing = await app.inject({ method: "GET", url: "/ping" });

    expect(safe.json()).toEqual({ id: "abc.DEF_123:xyz-" });
    expect(safe.headers["x-request-id"]).toBe("abc.DEF_123:xyz-");
    expect(unsafe.json().id).toMatch(UUID);
    expect(unsafe.headers["x-request-id"]).toBe(unsafe.json().id);
    expect(unsafe.headers["x-request-id"]).not.toBe("bad id");
    expect(empty.json().id).toMatch(UUID);
    expect(missing.json().id).toMatch(UUID);
  });
});
