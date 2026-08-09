/**
 * Server-side session helpers for dashboard actions and pages.
 * Never trust a client-provided userId — always resolve from the session.
 */
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

/**
 * Returns the authenticated user or null when unauthenticated.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!session?.user || !id) return null;
  return {
    id,
    email: session.user.email,
    name: session.user.name,
  };
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
