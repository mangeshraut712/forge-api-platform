/**
 * Fastify error helpers — map internal errors to the ApiErrorBody shape.
 */
import type { FastifyReply } from "fastify";
import { ERROR_CODES, type ErrorCode, apiError } from "@forge/shared";

export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode | string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: ErrorCode | string,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function unauthorized(message = "Unauthorized"): ApiError {
  return new ApiError(401, ERROR_CODES.unauthorized, message);
}

export function forbidden(message = "Forbidden"): ApiError {
  return new ApiError(403, ERROR_CODES.forbidden, message);
}

export function notFound(message = "Not found"): ApiError {
  return new ApiError(404, ERROR_CODES.not_found, message);
}

export function validationError(message: string, details?: unknown): ApiError {
  return new ApiError(422, ERROR_CODES.validation_error, message, details);
}

export function conflict(message: string): ApiError {
  return new ApiError(409, ERROR_CODES.conflict, message);
}

export function quotaExceeded(message = "Quota exceeded"): ApiError {
  return new ApiError(429, ERROR_CODES.quota_exceeded, message);
}

export function internalError(message = "Internal server error"): ApiError {
  return new ApiError(500, ERROR_CODES.internal_error, message);
}

/** Send an ApiError-shaped response with the request id. */
export function sendApiError(
  reply: FastifyReply,
  error: ApiError,
  requestId: string,
): FastifyReply {
  reply.request.errorCode = error.code;
  return reply
    .code(error.statusCode)
    .send(apiError(error.code, error.message, requestId, error.details));
}
