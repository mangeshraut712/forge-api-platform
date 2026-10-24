import { describe, expect, it } from "vitest";
import {
  loginErrorMessage,
  publicActionError,
  validateExpiresAt,
  validateKeyEnvironment,
  validateKeyName,
  validateProjectName,
  validateProjectSlug,
} from "./validators";

describe("dashboard input validation", () => {
  it("trims and bounds project names", () => {
    expect(validateProjectName("  Demo  ")).toEqual({
      ok: true,
      value: "Demo",
    });
    expect(validateProjectName("   ")).toEqual({
      ok: false,
      error: "Project name is required",
    });
    expect(validateProjectName("a".repeat(201)).ok).toBe(false);
    expect(validateProjectName("bad\nname").ok).toBe(false);
    expect(validateProjectName("bad\u0000name").ok).toBe(false);
  });

  it("normalizes slugs and rejects ones that collapse", () => {
    expect(validateProjectSlug(" My App ")).toEqual({
      ok: true,
      value: "my-app",
    });
    expect(validateProjectSlug("..")).toEqual({
      ok: false,
      error: "Slug must be at least 2 characters",
    });
    expect(validateProjectSlug("a".repeat(80)).ok).toBe(false);
  });

  it("validates key names, environments, and future expiry", () => {
    const now = Date.parse("2026-06-01T00:00:00.000Z");
    expect(validateKeyName("  CI  ")).toEqual({ ok: true, value: "CI" });
    expect(validateKeyName("x".repeat(101)).ok).toBe(false);
    expect(validateKeyEnvironment("LIVE")).toEqual({
      ok: true,
      value: "LIVE",
    });
    expect(validateKeyEnvironment("PROD").ok).toBe(false);
    expect(validateExpiresAt(null, now)).toEqual({ ok: true, value: null });
    expect(validateExpiresAt("not-a-date", now).ok).toBe(false);
    expect(validateExpiresAt("2026-05-01T00:00:00.000Z", now).ok).toBe(false);
    expect(validateExpiresAt("2026-07-01T00:00:00.000Z", now)).toEqual({
      ok: true,
      value: new Date("2026-07-01T00:00:00.000Z"),
    });
  });

  it("hides unexpected errors and keeps auth failures generic", () => {
    expect(
      publicActionError(new Error("Invalid prisma invocation"), "nope"),
    ).toBe("nope");
    expect(publicActionError({ code: "forbidden" }, "nope")).toBe(
      "Project not found",
    );
    expect(publicActionError({ code: "unauthorized" }, "nope")).toBe(
      "Unauthorized",
    );
    expect(publicActionError("boom", "nope")).toBe("nope");
  });

  it("does not echo arbitrary login error codes", () => {
    expect(loginErrorMessage(undefined)).toBeNull();
    expect(loginErrorMessage("CredentialsSignin")).toMatch(/Sign-in failed/);
    expect(loginErrorMessage("AccessDenied")).toMatch(/not allowed/);
    expect(loginErrorMessage("<script>alert(1)</script>")).toBe(
      "Sign-in failed. Try again.",
    );
  });
});
