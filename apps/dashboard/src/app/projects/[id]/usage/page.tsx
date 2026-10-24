import { prisma } from "@forge/db";
import { redirect } from "next/navigation";
import { assertProjectOwner } from "@forge/auth";
import { resolvePlanQuota, quotaWindowId } from "@forge/shared";
import { getSessionUser } from "@/lib/session";
import { activeApiKeyWhere, loadUsageSummary } from "@/lib/usage-stats";

export default async function UsagePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const userId = user.id;

  try {
    await assertProjectOwner(prisma, id, userId);
  } catch {
    redirect("/projects");
  }

  const project = await prisma.project.findUnique({
    where: { id },
  });
  if (!project) redirect("/projects");

  const quota = resolvePlanQuota(project);
  const today = quotaWindowId(quota.window);
  const now = new Date();

  const [summary, activeKeys, recentLogs] = await Promise.all([
    loadUsageSummary(prisma, id),
    prisma.apiKey.count({ where: activeApiKeyWhere(id, now) }),
    prisma.requestLog.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  const { totalRequests, successRate, rateLimited, p50, p95 } = summary;

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
        <h1>Usage — {project.name}</h1>
        <a href="/projects" className="btn">
          ← Back to projects
        </a>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>
            {totalRequests.toLocaleString()}
          </div>
          <div style={{ color: "#a3a3a3", fontSize: "0.85rem" }}>
            Total requests
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#4ade80" }}>
            {successRate}%
          </div>
          <div style={{ color: "#a3a3a3", fontSize: "0.85rem" }}>
            Success rate
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#f87171" }}>
            {rateLimited}
          </div>
          <div style={{ color: "#a3a3a3", fontSize: "0.85rem" }}>
            429 responses
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{p50}ms</div>
          <div style={{ color: "#a3a3a3", fontSize: "0.85rem" }}>
            p50 latency
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{p95}ms</div>
          <div style={{ color: "#a3a3a3", fontSize: "0.85rem" }}>
            p95 latency
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{activeKeys}</div>
          <div style={{ color: "#a3a3a3", fontSize: "0.85rem" }}>
            Active API keys
          </div>
        </div>
      </div>

      <div className="card">
        <h2>Quota</h2>
        <p style={{ color: "#999", marginBottom: "0.5rem" }}>
          Plan: <strong>{project.plan}</strong> — {quota.limit.toLocaleString()}{" "}
          requests / {quota.window}
        </p>
        <p style={{ color: "#a3a3a3", fontSize: "0.85rem" }}>
          Current window: <code>{today}</code>
        </p>
      </div>

      <div className="card">
        <h2>Recent requests</h2>
        {recentLogs.length === 0 ? (
          <div className="empty-state">
            No requests yet. Call the API with your key to see logs.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Recent API requests</caption>
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Method</th>
                  <th scope="col">Path</th>
                  <th scope="col">Status</th>
                  <th scope="col">Latency</th>
                  <th scope="col">Request ID</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: "0.8rem", color: "#a3a3a3" }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td style={{ fontSize: "0.8rem" }}>{log.method}</td>
                    <td style={{ fontSize: "0.8rem", fontFamily: "monospace" }}>
                      {log.path}
                    </td>
                    <td>
                      <span
                        className="badge"
                        style={{
                          background:
                            log.statusCode < 400 ? "#14532d" : "#7f1d1d",
                          color: log.statusCode < 400 ? "#4ade80" : "#f87171",
                        }}
                      >
                        {log.statusCode}
                      </span>
                    </td>
                    <td style={{ fontSize: "0.8rem" }}>{log.latencyMs}ms</td>
                    <td
                      style={{
                        fontSize: "0.7rem",
                        fontFamily: "monospace",
                        color: "#a3a3a3",
                      }}
                    >
                      {log.requestId.slice(0, 8)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
