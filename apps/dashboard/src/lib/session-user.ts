export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

type SessionLike = {
  user?: { id?: string; email?: string | null; name?: string | null } | null;
} | null;

/**
 * A session without a Prisma user id is unauthenticated. Treating a missing
 * id as a user would drop the owner filter and list every project.
 */
export function sessionUserFromSession(
  session: SessionLike,
): SessionUser | null {
  const id = session?.user?.id;
  if (!session?.user || !id) return null;
  return {
    id,
    email: session.user.email,
    name: session.user.name,
  };
}
