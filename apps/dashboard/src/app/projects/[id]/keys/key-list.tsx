"use client";

import { useState } from "react";
import { revokeApiKeyAction, rotateApiKeyAction } from "@/lib/key-actions";

type KeyRow = {
  id: string;
  name: string;
  environment: "TEST" | "LIVE";
  keyPrefix: string;
  scopes: string[];
  revokedAt: Date | string | null;
  graceEndsAt?: Date | string | null;
  lastUsedAt: Date | string | null;
  createdAt: Date | string;
};

function isInGrace(key: KeyRow, now = Date.now()): boolean {
  if (!key.revokedAt || !key.graceEndsAt) return false;
  return new Date(key.graceEndsAt).getTime() > now;
}

function statusLabel(key: KeyRow): {
  label: string;
  className: string;
  style?: React.CSSProperties;
} {
  if (isInGrace(key)) {
    return {
      label: "Grace",
      className: "badge",
      style: { background: "#713f12", color: "#fbbf24" },
    };
  }
  if (key.revokedAt) {
    return { label: "Revoked", className: "badge badge-revoked" };
  }
  return {
    label: "Active",
    className: "badge",
    style: { background: "#14532d", color: "#4ade80" },
  };
}

export default function KeyList({
  keys,
  projectId,
}: {
  keys: KeyRow[];
  projectId: string;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [rotating, setRotating] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleRevoke(keyId: string) {
    if (
      !confirm(
        "Are you sure you want to revoke this key? This cannot be undone.",
      )
    ) {
      return;
    }
    setRevoking(keyId);
    setError(null);
    const result = await revokeApiKeyAction({ projectId, keyId });
    if (!result.success) setError(result.error);
    setRevoking(null);
  }

  async function handleRotate(keyId: string) {
    if (
      !confirm(
        "Rotate this key? The old key will keep working for 7 days (grace period).",
      )
    ) {
      return;
    }
    setRotating(keyId);
    setNewKey(null);
    setError(null);
    const result = await rotateApiKeyAction({ projectId, keyId });
    if (result.success) {
      setNewKey(result.rawKey);
    } else {
      setError(result.error);
    }
    setRotating(null);
  }

  function copyKey() {
    if (newKey) {
      void navigator.clipboard.writeText(newKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (keys.length === 0) {
    return (
      <div className="empty-state">No API keys yet. Create one above.</div>
    );
  }

  return (
    <div>
      {error && (
        <div
          style={{
            color: "#f87171",
            marginBottom: "0.75rem",
            fontSize: "0.85rem",
          }}
        >
          {error}
        </div>
      )}

      {newKey && (
        <div style={{ marginBottom: "1rem" }}>
          <div
            style={{
              color: "#4ade80",
              marginBottom: "0.5rem",
              fontSize: "0.85rem",
            }}
          >
            ✅ New key created! Copy it now — it won&apos;t be shown again.
          </div>
          <div className="key-display">{newKey}</div>
          <button
            type="button"
            onClick={copyKey}
            className="btn"
            style={{ marginTop: "0.5rem" }}
          >
            {copied ? "Copied!" : "Copy key"}
          </button>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Env</th>
            <th>Prefix</th>
            <th>Scopes</th>
            <th>Status</th>
            <th>Last used</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const status = statusLabel(key);
            const actionable = !key.revokedAt || isInGrace(key);
            return (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>
                  <span
                    className={`badge ${key.environment === "LIVE" ? "badge-live" : "badge-test"}`}
                  >
                    {key.environment}
                  </span>
                </td>
                <td style={{ fontFamily: "monospace", fontSize: "0.85rem" }}>
                  {key.keyPrefix}...
                </td>
                <td style={{ fontSize: "0.8rem" }}>{key.scopes.join(", ")}</td>
                <td>
                  <span className={status.className} style={status.style}>
                    {status.label}
                  </span>
                  {isInGrace(key) && key.graceEndsAt && (
                    <div
                      style={{
                        fontSize: "0.7rem",
                        color: "#666",
                        marginTop: "0.15rem",
                      }}
                    >
                      until {new Date(key.graceEndsAt).toLocaleDateString()}
                    </div>
                  )}
                </td>
                <td style={{ fontSize: "0.8rem", color: "#666" }}>
                  {key.lastUsedAt
                    ? new Date(key.lastUsedAt).toLocaleDateString()
                    : "Never"}
                </td>
                <td style={{ display: "flex", gap: "0.5rem" }}>
                  {actionable && (
                    <>
                      {!key.revokedAt && (
                        <button
                          type="button"
                          onClick={() => handleRotate(key.id)}
                          className="btn"
                          disabled={rotating === key.id}
                        >
                          {rotating === key.id ? "Rotating..." : "Rotate"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleRevoke(key.id)}
                        className="btn btn-danger"
                        disabled={revoking === key.id}
                      >
                        {revoking === key.id
                          ? "Revoking..."
                          : isInGrace(key)
                            ? "End grace"
                            : "Revoke"}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
