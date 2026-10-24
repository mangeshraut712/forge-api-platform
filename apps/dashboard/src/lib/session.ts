/**
 * Server-side session helpers for dashboard actions and pages.
 * Never trust a client-provided userId — always resolve from the session.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";
import { sessionUserFromSession, type SessionUser } from "./session-user";

export type { SessionUser } from "./session-user";
export { sessionUserFromSession } from "./session-user";

/**
 * Returns the authenticated user or null when unauthenticated.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  return sessionUserFromSession(session);
}

/**
 * Returns the authenticated user or throws (for server actions).
 */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    const err = new Error("Unauthorized");
    (err as Error & { code?: string }).code = "unauthorized";
    throw err;
  }
  return user;
}
