/**
 * Request logging to the RequestLog table.
 * Fire-and-forget so it never blocks the response.
 */
import { prisma } from "@forge/db";

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
        path: input.path,
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
