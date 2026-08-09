/**
 * Shared Fastify types for auth context attached to requests.
 */
import type { ApiKey, Project } from "@forge/db";

export type AuthContext = {
  project: Pick<
    Project,
    "id" | "name" | "slug" | "plan" | "customDailyLimit" | "customMonthlyLimit"
  >;
  apiKey: Pick<ApiKey, "id" | "name" | "environment" | "scopes">;
  scopes: string[];
};

/** Augment FastifyRequest with an optional auth context. */
declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
    requestId: string;
    errorCode?: string;
  }
}
