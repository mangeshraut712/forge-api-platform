import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@forge/db";
import { redirect } from "next/navigation";
import { assertProjectOwner } from "@forge/auth";
import CreateKeyForm from "./create-key-form";
import KeyList from "./key-list";

export default async function KeysPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const userId = (session.user as { id?: string }).id!;

  // Verify ownership
  try {
    await assertProjectOwner(prisma, id, userId);
  } catch {
    redirect("/projects");
  }

  const keys = await prisma.apiKey.findMany({
    where: { projectId: id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <h1>API Keys</h1>
        <a href="/projects" className="btn">
          ← Back to projects
        </a>
      </div>

      <div className="card">
        <h2>Create new API key</h2>
        <CreateKeyForm projectId={id} />
      </div>

      <div className="card">
        <h2>Existing keys</h2>
        <KeyList keys={keys} projectId={id} />
      </div>
    </div>
  );
}
