"use client";

import { useState } from "react";
import { createApiKeyAction } from "@/lib/key-actions";
import { ALL_SCOPES, SCOPES, type Scope } from "@forge/shared";

export default function CreateKeyForm({ projectId }: { projectId: string }) {
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"TEST" | "LIVE">("TEST");
  const [scopes, setScopes] = useState<Scope[]>([
    SCOPES.TODOS_READ,
    SCOPES.TODOS_WRITE,
  ]);
  const [expiresAt, setExpiresAt] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setRawKey(null);

    const result = await createApiKeyAction({
      projectId,
      name,
      environment,
      scopes,
      expiresAt: expiresAt || null,
    });

    if (result.success) {
      setRawKey(result.rawKey);
      setName("");
    } else {
      setError(result.error);
    }
    setLoading(false);
  }

  function toggleScope(scope: Scope) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  function copyKey() {
    if (rawKey) {
      void navigator.clipboard.writeText(rawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div>
      {rawKey && (
        <div style={{ marginBottom: "1rem" }}>
          <div
            style={{
              color: "#4ade80",
              marginBottom: "0.5rem",
              fontSize: "0.85rem",
            }}
          >
            ✅ Key created! Copy it now — it won&apos;t be shown again.
          </div>
          <div className="key-display">{rawKey}</div>
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

      <form onSubmit={handleSubmit}>
        <label htmlFor="key-name">Key name</label>
        <input
          id="key-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Production key"
          required
        />

        <label htmlFor="env">Environment</label>
        <select
          id="env"
          value={environment}
          onChange={(e) => setEnvironment(e.target.value as "TEST" | "LIVE")}
        >
          <option value="TEST">TEST</option>
          <option value="LIVE">LIVE</option>
        </select>

        <label htmlFor="expires">Expiration (optional)</label>
        <input
          id="expires"
          type="datetime-local"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
        />

        <label>Scopes</label>
        <div style={{ marginBottom: "0.75rem" }}>
          {ALL_SCOPES.map((scope) => (
            <label
              key={scope}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.25rem",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={scopes.includes(scope)}
                onChange={() => toggleScope(scope)}
                style={{ width: "auto", marginBottom: 0 }}
              />
              <span style={{ fontSize: "0.9rem" }}>{scope}</span>
            </label>
          ))}
        </div>

        <button
          type="submit"
          className="btn"
          disabled={loading || scopes.length === 0}
        >
          {loading ? "Creating..." : "Create key"}
        </button>
      </form>
    </div>
  );
}
