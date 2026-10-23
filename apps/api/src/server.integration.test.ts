import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "./index.js";

describe("server integration", () => {
  let app: Awaited<ReturnType<typeof buildServer>> | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  it("returns the not-found envelope for an unsupported public method", async () => {
    app = await buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/health?probe=true",
      headers: { "x-request-id": "trace-post" },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        code: "not_found",
        message: "Route POST /health?probe=true not found",
        request_id: "trace-post",
      },
    });
  });

  it("does not expose a missing private route without authentication", async () => {
    app = await buildServer();

    const response = await app.inject({
      method: "GET",
      url: "/v1/does-not-exist",
      headers: { "x-request-id": "trace-missing" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toMatchObject({
      code: "unauthorized",
      request_id: "trace-missing",
    });
  });
});
