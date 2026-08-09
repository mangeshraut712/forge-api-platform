/**
 * Control-plane auth helpers.
 * Dashboard wires Auth.js; this package holds shared ownership checks.
 */
import type { PrismaClient } from "@forge/db";

export async function assertProjectOwner(
  db: PrismaClient,
  projectId: string,
  userId: string,
) {
  const project = await db.project.findFirst({
    where: { id: projectId, ownerId: userId },
  });
  if (!project) {
    const err = new Error("Project not found or not owned by user");
    (err as Error & { code?: string }).code = "forbidden";
    throw err;
  }
  return project;
}

export async function softDeleteUser(db: PrismaClient, userId: string) {
  const now = new Date();
  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { deletedAt: now },
    });
    const projects = await tx.project.findMany({
      where: { ownerId: userId },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    if (projectIds.length > 0) {
      await tx.apiKey.updateMany({
        where: { projectId: { in: projectIds }, revokedAt: null },
        data: { revokedAt: now },
      });
    }
    await tx.session.deleteMany({ where: { userId } });
    return { revokedProjects: projectIds.length };
  });
}
