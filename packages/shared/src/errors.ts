export const ERROR_CODES = {
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  key_revoked: "key_revoked",
  key_expired: "key_expired",
  insufficient_scope: "insufficient_scope",
  quota_exceeded: "quota_exceeded",
  quota_unavailable: "quota_unavailable",
  not_found: "not_found",
  validation_error: "validation_error",
  conflict: "conflict",
  rate_limited: "rate_limited",
  internal_error: "internal_error",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export type ApiErrorBody = {
  error: {
    code: ErrorCode | string;
    message: string;
    request_id?: string;
    details?: unknown;
  };
};

export function apiError(
  code: ErrorCode | string,
  message: string,
  requestId?: string,
  details?: unknown,
): ApiErrorBody {
  return {
    error: {
      code,
      message,
      ...(requestId ? { request_id: requestId } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };
}
