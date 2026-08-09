/**
 * Global error handler — converts unhandled errors into ApiErrorBody shape.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { apiError, ERROR_CODES } from "@forge/shared";
import { ApiError } from "../lib/errors.js";

export async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler(
    (err: Error, req: FastifyRequest, reply: FastifyReply) => {
      const requestId = req.requestId ?? "unknown";

      if (err instanceof ApiError) {
        const apiErr = err;
        req.errorCode = String(apiErr.code);
        return reply
          .code(apiErr.statusCode)
          .send(
            apiError(apiErr.code, apiErr.message, requestId, apiErr.details),
          );
      }

      if (
        "statusCode" in err &&
        typeof err.statusCode === "number" &&
        err.statusCode >= 400 &&
        err.statusCode < 500
      ) {
        req.errorCode = ERROR_CODES.validation_error;
        return reply
          .code(err.statusCode)
          .send(apiError(ERROR_CODES.validation_error, err.message, requestId));
      }

      // Zod validation errors
      if (err.name === "ZodError" && "issues" in err) {
        const zodErr = err as Error & { issues: unknown };
        req.errorCode = ERROR_CODES.validation_error;
        return reply
          .code(422)
          .send(
            apiError(
              ERROR_CODES.validation_error,
              "Validation failed",
              requestId,
              zodErr.issues,
            ),
          );
      }

      console.error("[api] unhandled error:", err);
      req.errorCode = ERROR_CODES.internal_error;
      return reply
        .code(500)
        .send(
          apiError(
            ERROR_CODES.internal_error,
            "Internal server error",
            requestId,
          ),
        );
    },
  );

  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    const requestId = req.requestId ?? "unknown";
    req.errorCode = ERROR_CODES.not_found;
    return reply
      .code(404)
      .send(
        apiError(
          ERROR_CODES.not_found,
          `Route ${req.method} ${req.url} not found`,
          requestId,
        ),
      );
  });
}
