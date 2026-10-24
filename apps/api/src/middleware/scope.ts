/**
 * Scope guard middleware factory.
 * Usage: app.get("/todos", requireScope("todos:read"), handler)
 */
import type {
  FastifyRequest,
  FastifyReply,
  preHandlerHookHandler,
} from "fastify";
import { hasScope, type Scope } from "@forge/shared";
import {
  sendApiError,
  insufficientScope,
  unauthorized,
} from "../lib/errors.js";

export function requireScope(required: Scope | Scope[]): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      return sendApiError(
        reply,
        unauthorized("No auth context"),
        req.requestId,
      );
    }
    if (!hasScope(req.auth.scopes, required)) {
      const needed = Array.isArray(required) ? required : [required];
      return sendApiError(
        reply,
        insufficientScope(`Missing required scope(s): ${needed.join(", ")}`),
        req.requestId,
      );
    }
  };
}
