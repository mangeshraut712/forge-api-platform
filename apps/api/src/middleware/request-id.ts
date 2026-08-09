/**
 * Request ID middleware — generates a unique ID per request and attaches it.
 * Also sets it on the response header for client-side correlation.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { resolveRequestId } from "../lib/request-utils.js";

const HEADER = "x-request-id";

export async function requestIdPlugin(app: FastifyInstance): Promise<void> {
  app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
    const incoming = req.headers[HEADER] as string | undefined;
    const id = resolveRequestId(incoming);
    req.requestId = id;
    reply.header(HEADER, id);
  });
}
