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
import { sendApiError, forbidden } from "../lib/errors.js";

export function requireScope(required: Scope | Scope[]): preHandlerHookHandler {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.auth) {
      return sendApiError(reply, forbidden("No auth context"), req.requestId);
    }
    if (!hasScope(req.auth.scopes, required)) {
      const needed = Array.isArray(required) ? required : [required];
      return sendApiError(
        reply,
        forbidden(`Missing required scope(s): ${needed.join(", ")}`),
        req.requestId,
      );
    }
  };
}
