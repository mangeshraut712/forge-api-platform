/**
 * Request logging to the RequestLog table.
 * Fire-and-forget so it never blocks the response.
 */
import { prisma } from "@forge/db";

const MAX_LOG_PATH_LENGTH = 2048;

/** Drop query strings and control characters before a path is stored. */
export function sanitizeLogPath(path: string): string {
  const withoutQuery = path.split("?")[0] ?? "";
  const withoutHash = withoutQuery.split("#")[0] ?? "";
  const cleaned = withoutHash.replace(/[\u0000-\u001f\u007f]/g, "");
  const sliced = cleaned.slice(0, MAX_LOG_PATH_LENGTH);
  if (sliced.startsWith("/")) return sliced;
  return `/${sliced}`.slice(0, MAX_LOG_PATH_LENGTH);
}

export type RequestLogInput = {
  projectId: string;
  apiKeyId?: string | null;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  requestId: string;
  errorCode?: string | null;
};

export function logRequest(input: RequestLogInput): void {
  void prisma.requestLog
    .create({
      data: {
        projectId: input.projectId,
        apiKeyId: input.apiKeyId ?? null,
        method: input.method,
        path: sanitizeLogPath(input.path),
        statusCode: input.statusCode,
        latencyMs: input.latencyMs,
        requestId: input.requestId,
        errorCode: input.errorCode ?? null,
      },
    })
    .catch((err) => {
      console.error("[log] failed to write request log:", err.message);
    });
}
