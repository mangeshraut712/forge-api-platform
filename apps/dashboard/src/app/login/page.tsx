import { redirect } from "next/navigation";
import { hasGoogleAuth, isDevLoginEnabled } from "@/lib/auth-policy";
import { getSessionUser } from "@/lib/session";
import { loginErrorMessage } from "@/lib/validators";
import LoginForm from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const user = await getSessionUser();
  if (user) {
    redirect("/projects");
  }

  const params = await searchParams;
  const errorCode = Array.isArray(params.error)
    ? params.error[0]
    : params.error;
  const hasGoogle = hasGoogleAuth();
  const hasDevLogin = isDevLoginEnabled();

  return (
    <div style={{ maxWidth: "400px", margin: "4rem auto" }}>
      <h1>Sign in to ForgeAPI</h1>
      <p style={{ color: "#a3a3a3", marginBottom: "1.5rem" }}>
        {hasGoogle && hasDevLogin
          ? "Sign in with Google, or use any email in dev mode."
          : hasGoogle
            ? "Sign in with your Google account."
            : hasDevLogin
              ? "Use any email to sign in (dev mode)."
              : "No authentication provider is configured."}
      </p>
      <LoginForm
        hasGoogle={hasGoogle}
        hasDevLogin={hasDevLogin}
        error={loginErrorMessage(errorCode)}
      />
    </div>
  );
}
