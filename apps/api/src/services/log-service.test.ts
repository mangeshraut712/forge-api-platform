import { beforeEach, describe, expect, it, vi } from "vitest";
import { logRequest } from "./log-service.js";

const { create } = vi.hoisted(() => ({
  create: vi.fn(),
}));

vi.mock("@forge/db", () => ({
  prisma: {
    requestLog: { create },
  },
}));

const entry = {
  projectId: "proj_1",
  method: "GET",
  path: "/v1/todos",
  statusCode: 200,
  latencyMs: 12,
  requestId: "req_1",
};

describe("logRequest", () => {
  beforeEach(() => {
    create.mockReset();
    create.mockResolvedValue({ id: "log_1" });
  });

  it("persists the request and nulls optional fields", async () => {
    logRequest(entry);
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledWith({
      data: {
        ...entry,
        apiKeyId: null,
        errorCode: null,
      },
    });
  });

  it("stores the api key and error code when they are present", async () => {
    logRequest({
      ...entry,
      apiKeyId: "key_1",
      errorCode: "not_found",
      statusCode: 404,
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        apiKeyId: "key_1",
        errorCode: "not_found",
        statusCode: 404,
      }),
    });
  });

  it("swallows persistence failures", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    create.mockRejectedValueOnce(new Error("disk full"));

    logRequest(entry);

    await vi.waitFor(() => {
      expect(spy).toHaveBeenCalledWith(
        "[log] failed to write request log:",
        "disk full",
      );
    });
    spy.mockRestore();
  });
});
