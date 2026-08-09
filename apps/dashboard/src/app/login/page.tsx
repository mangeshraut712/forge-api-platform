import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const session = await getServerSession(authOptions);
  if (session) {
    redirect("/projects");
  }

  const hasGoogle = Boolean(
    process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
  );
  const hasDevLogin = process.env.AUTH_DEV_LOGIN === "true";

  return (
    <div style={{ maxWidth: "400px", margin: "4rem auto" }}>
      <h1>Sign in to ForgeAPI</h1>
      <p style={{ color: "#666", marginBottom: "1.5rem" }}>
        {hasGoogle && hasDevLogin
          ? "Sign in with Google, or use any email in dev mode."
          : hasGoogle
            ? "Sign in with your Google account."
            : hasDevLogin
              ? "Use any email to sign in (dev mode)."
              : "No authentication provider is configured."}
      </p>
      <LoginForm hasGoogle={hasGoogle} hasDevLogin={hasDevLogin} />
    </div>
  );
}
