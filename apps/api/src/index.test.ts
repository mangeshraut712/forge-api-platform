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
});
