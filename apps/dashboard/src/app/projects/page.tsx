import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@forge/db";
import { redirect } from "next/navigation";
import CreateProjectForm from "./create-project-form";

export default async function ProjectsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const userId = (session.user as { id?: string }).id!;
  const projects = await prisma.project.findMany({
    where: { ownerId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { apiKeys: true, todos: true } },
    },
  });

  return (
    <div>
      <h1>Projects</h1>

      <div className="card">
        <h2>Create new project</h2>
        <CreateProjectForm />
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          No projects yet. Create one above to get started.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Plan</th>
              <th>Keys</th>
              <th>Todos</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {projects.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.slug}</td>
                <td>{p.plan}</td>
                <td>{p._count.apiKeys}</td>
                <td>{p._count.todos}</td>
                <td style={{ display: "flex", gap: "0.5rem" }}>
                  <a href={`/projects/${p.id}/keys`} className="btn">
                    Manage Keys
                  </a>
                  <a href={`/projects/${p.id}/usage`} className="btn">
                    Usage
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
