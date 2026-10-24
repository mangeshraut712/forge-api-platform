import { afterEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import {
  ApiError,
  conflict,
  forbidden,
  insufficientScope,
  internalError,
  notFound,
  quotaExceeded,
  sendApiError,
  unauthorized,
  validationError,
} from "./errors.js";

describe("API error helpers", () => {
  it("maps helpers onto status codes and error codes", () => {
    const cases = [
      [unauthorized(), 401, "unauthorized", "Unauthorized"],
      [unauthorized("Missing"), 401, "unauthorized", "Missing"],
      [forbidden(), 403, "forbidden", "Forbidden"],
      [forbidden("No auth context"), 403, "forbidden", "No auth context"],
      [
        insufficientScope("Missing required scope(s): todos:write"),
        403,
        "insufficient_scope",
        "Missing required scope(s): todos:write",
      ],
      [notFound(), 404, "not_found", "Not found"],
      [validationError("Invalid"), 422, "validation_error", "Invalid"],
      [conflict("Clash"), 409, "conflict", "Clash"],
      [quotaExceeded(), 429, "quota_exceeded", "Quota exceeded"],
      [internalError(), 500, "internal_error", "Internal server error"],
    ] as const;

    for (const [error, statusCode, code, message] of cases) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toBeInstanceOf(Error);
      expect(error.statusCode).toBe(statusCode);
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    }
  });

  it("keeps validation details on the error", () => {
    const details = [{ path: ["title"], message: "Required" }];
    const error = validationError("Invalid request body", details);
    expect(error.details).toEqual(details);
    expect(unauthorized().details).toBeUndefined();
  });
});

describe("sendApiError", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("writes the shared error envelope and records the error code", async () => {
    let errorCode: string | undefined;
    app = Fastify({ logger: false });
    app.addHook("onResponse", async (request) => {
      errorCode = request.errorCode;
    });
    app.get("/denied", async (_request, reply) => {
      return sendApiError(
        reply,
        validationError("Invalid request body", { field: "title" }),
        "req_123",
      );
    });

    const response = await app.inject({ method: "GET", url: "/denied" });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: {
        code: "validation_error",
        message: "Invalid request body",
        request_id: "req_123",
        details: { field: "title" },
      },
    });
    expect(errorCode).toBe("validation_error");
  });

  it("omits details when the error has none", async () => {
    app = Fastify({ logger: false });
    app.get("/denied", async (_request, reply) => {
      return sendApiError(reply, unauthorized("Missing"), "req_auth");
    });

    const response = await app.inject({ method: "GET", url: "/denied" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "unauthorized",
        message: "Missing",
        request_id: "req_auth",
      },
    });
  });
});
