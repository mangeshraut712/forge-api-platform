import { prisma } from "@forge/db";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import CreateProjectForm from "./create-project-form";

export default async function ProjectsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const projects = await prisma.project.findMany({
    where: { ownerId: user.id },
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
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Your projects</caption>
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Slug</th>
                <th scope="col">Plan</th>
                <th scope="col">Keys</th>
                <th scope="col">Todos</th>
                <th scope="col">Actions</th>
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
        </div>
      )}
    </div>
  );
}
