import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./index.js";

let app: Awaited<ReturnType<typeof buildServer>> | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("API server", () => {
  it("serves liveness checks without infrastructure dependencies", async () => {
    app = await buildServer();

    const response = await app.inject({
      method: "GET",
      url: "/health?probe=true",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
  });

  it("rejects protected routes before reaching their handlers", async () => {
    app = await buildServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/todos",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: { code: "unauthorized" },
    });
    expect(response.headers["x-request-id"]).toBeTruthy();
  });

  it("allows browser clients to preflight PATCH requests", async () => {
    app = await buildServer();

    const response = await app.inject({
      method: "OPTIONS",
      url: "/v1/todos/example",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "authorization,content-type",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toContain("PATCH");
  });
});
