"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginForm({
  hasGoogle,
  hasDevLogin,
  error,
}: {
  hasGoogle: boolean;
  hasDevLogin: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState("dev@forge.local");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await signIn("credentials", { email, callbackUrl: "/projects" });
  }

  return (
    <div>
      {error && (
        <div id="login-error" role="alert" className="form-error">
          {error}
        </div>
      )}
      {hasGoogle && (
        <>
          <button
            type="button"
            className="btn"
            style={{
              width: "100%",
              marginBottom: "1rem",
              background: "#1d4ed8",
            }}
            onClick={() => signIn("google", { callbackUrl: "/projects" })}
          >
            Sign in with Google
          </button>
          {hasDevLogin && (
            <div
              style={{
                textAlign: "center",
                color: "#a3a3a3",
                marginBottom: "1rem",
                fontSize: "0.85rem",
              }}
            >
              — or —
            </div>
          )}
        </>
      )}

      {hasDevLogin && (
        <form
          onSubmit={handleSubmit}
          aria-describedby={error ? "login-error" : undefined}
        >
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
            aria-invalid={error ? true : undefined}
          />
          <button
            type="submit"
            className="btn"
            disabled={loading}
            aria-busy={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )}

      {!hasGoogle && !hasDevLogin && (
        <p style={{ color: "#f87171" }}>
          No authentication providers configured. Set
          AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET or AUTH_DEV_LOGIN=true.
        </p>
      )}
    </div>
  );
}
