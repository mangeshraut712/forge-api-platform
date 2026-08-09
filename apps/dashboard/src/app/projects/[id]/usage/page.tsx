import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@forge/db";
import { redirect } from "next/navigation";
import { assertProjectOwner } from "@forge/auth";
import { resolvePlanQuota, quotaWindowId } from "@forge/shared";

export default async function UsagePage({
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

  try {
    await assertProjectOwner(prisma, id, userId);
  } catch {
    redirect("/projects");
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      _count: { select: { apiKeys: true } },
    },
  });
  if (!project) redirect("/projects");

  const quota = resolvePlanQuota(project);
  const today = quotaWindowId(quota.window);

  // Aggregate metrics from RequestLog
  const [
    totalRequests,
    successCount,
    errorCount,
    rateLimited,
    activeKeys,
    recentLogs,
  ] = await Promise.all([
    prisma.requestLog.count({ where: { projectId: id } }),
    prisma.requestLog.count({
      where: { projectId: id, statusCode: { lt: 400 } },
    }),
    prisma.requestLog.count({
      where: { projectId: id, statusCode: { gte: 400 } },
    }),
    prisma.requestLog.count({
      where: { projectId: id, errorCode: "quota_exceeded" },
    }),
    prisma.apiKey.count({ where: { projectId: id, revokedAt: null } }),
    prisma.requestLog.findMany({
      where: { projectId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  // Latency percentiles
  const latencies = await prisma.requestLog.findMany({
    where: { projectId: id },
    select: { latencyMs: true },
    orderBy: { latencyMs: "asc" },
  });
  const latencyValues = latencies.map((l) => l.latencyMs);
  const p50 =
    latencyValues.length > 0
      ? latencyValues[Math.floor(latencyValues.length * 0.5)]
      : 0;
  const p95 =
    latencyValues.length > 0
      ? latencyValues[Math.floor(latencyValues.length * 0.95)]
      : 0;

  const successRate =
    totalRequests > 0
      ? ((successCount / totalRequests) * 100).toFixed(1)
      : "0.0";

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
          <div style={{ color: "#666", fontSize: "0.85rem" }}>
            Total requests
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#4ade80" }}>
            {successRate}%
          </div>
          <div style={{ color: "#666", fontSize: "0.85rem" }}>Success rate</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700, color: "#f87171" }}>
            {rateLimited}
          </div>
          <div style={{ color: "#666", fontSize: "0.85rem" }}>
            429 responses
          </div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{p50}ms</div>
          <div style={{ color: "#666", fontSize: "0.85rem" }}>p50 latency</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{p95}ms</div>
          <div style={{ color: "#666", fontSize: "0.85rem" }}>p95 latency</div>
        </div>
        <div className="card" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "2rem", fontWeight: 700 }}>{activeKeys}</div>
          <div style={{ color: "#666", fontSize: "0.85rem" }}>
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
        <p style={{ color: "#666", fontSize: "0.85rem" }}>
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
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Method</th>
                <th>Path</th>
                <th>Status</th>
                <th>Latency</th>
                <th>Request ID</th>
              </tr>
            </thead>
            <tbody>
              {recentLogs.map((log) => (
                <tr key={log.id}>
                  <td style={{ fontSize: "0.8rem", color: "#666" }}>
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
                      color: "#666",
                    }}
                  >
                    {log.requestId.slice(0, 8)}...
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
