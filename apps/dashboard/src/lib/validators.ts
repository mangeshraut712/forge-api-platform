const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export type FieldResult<T> =
  { ok: true; value: T } | { ok: false; error: string };

export function validateProjectName(name: string): FieldResult<string> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Project name is required" };
  if (trimmed.length > 200) {
    return {
      ok: false,
      error: "Project name must be 200 characters or fewer",
    };
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return {
      ok: false,
      error: "Project name cannot contain control characters",
    };
  }
  return { ok: true, value: trimmed };
}

export function validateProjectSlug(slug: string): FieldResult<string> {
  const normalized = slug
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized || normalized.length < 2) {
    return { ok: false, error: "Slug must be at least 2 characters" };
  }
  if (normalized.length > 63) {
    return { ok: false, error: "Slug must be 63 characters or fewer" };
  }
  return { ok: true, value: normalized };
}

export function validateKeyName(name: string): FieldResult<string> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Key name is required" };
  if (trimmed.length > 100) {
    return { ok: false, error: "Key name must be 100 characters or fewer" };
  }
  if (CONTROL_CHARS.test(trimmed)) {
    return { ok: false, error: "Key name cannot contain control characters" };
  }
  return { ok: true, value: trimmed };
}

export function validateKeyEnvironment(
  environment: string,
): FieldResult<"TEST" | "LIVE"> {
  if (environment !== "TEST" && environment !== "LIVE") {
    return { ok: false, error: "Invalid key environment" };
  }
  return { ok: true, value: environment };
}

export function validateExpiresAt(
  expiresAt: string | null | undefined,
  now = Date.now(),
): FieldResult<Date | null> {
  if (!expiresAt) return { ok: true, value: null };
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, error: "Expiration must be a valid date" };
  }
  if (parsed.getTime() <= now) {
    return { ok: false, error: "Expiration must be in the future" };
  }
  return { ok: true, value: parsed };
}

/** Map unexpected failures to a fixed message so database errors stay private. */
export function publicActionError(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (code === "unauthorized") return "Unauthorized";
    if (code === "forbidden") return "Project not found";
  }
  return fallback;
}

export function loginErrorMessage(code: string | undefined): string | null {
  switch (code) {
    case undefined:
    case "":
      return null;
    case "CredentialsSignin":
      return "Sign-in failed. Check the email and try again.";
    case "AccessDenied":
      return "This account is not allowed to sign in.";
    case "Configuration":
      return "Sign-in is not configured.";
    default:
      return "Sign-in failed. Try again.";
  }
}
