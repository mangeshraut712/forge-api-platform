import { randomUUID } from "node:crypto";

const MAX_REQUEST_ID_LENGTH = 128;
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]+$/;

export function isPublicRoute(url: string): boolean {
  const pathname = url.split("?", 1)[0];
  return pathname === "/health" || pathname === "/ready";
}

export function resolveRequestId(incoming?: string): string {
  if (
    incoming &&
    incoming.length <= MAX_REQUEST_ID_LENGTH &&
    SAFE_REQUEST_ID.test(incoming)
  ) {
    return incoming;
  }
  return randomUUID();
}
