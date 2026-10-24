/**
 * Pure auth policy checks shared by the NextAuth config and the login page.
 * Kept free of NextAuth and Prisma so the rules can be unit tested.
 */

type AuthEnv = {
  NODE_ENV?: string;
  AUTH_DEV_LOGIN?: string;
  AUTH_GOOGLE_ID?: string;
  AUTH_GOOGLE_SECRET?: string;
  AUTH_SECRET?: string;
  NEXT_PHASE?: string;
};

export function isDevLoginEnabled(env: AuthEnv = process.env): boolean {
  return env.NODE_ENV !== "production" && env.AUTH_DEV_LOGIN === "true";
}

export function hasGoogleAuth(env: AuthEnv = process.env): boolean {
  return Boolean(env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET);
}

/**
 * Production refuses to start with a missing or short session secret.
 * Next.js sets NEXT_PHASE while it imports this module during `next build`.
 */
export function authSecretProblem(env: AuthEnv = process.env): string | null {
  if (env.NEXT_PHASE === "phase-production-build") return null;
  if (env.NODE_ENV !== "production") return null;
  if ((env.AUTH_SECRET ?? "").length >= 32) return null;
  return "AUTH_SECRET must be at least 32 characters in production";
}

export function isVerifiedGoogleProfile(profile: unknown): boolean {
  return (
    typeof profile === "object" &&
    profile !== null &&
    "email_verified" in profile &&
    profile.email_verified === true
  );
}
