import { describe, expect, it } from "vitest";
import {
  authSecretProblem,
  hasGoogleAuth,
  isDevLoginEnabled,
  isVerifiedGoogleProfile,
} from "./auth-policy";

describe("auth policy", () => {
  it("enables dev login only outside production", () => {
    expect(
      isDevLoginEnabled({ NODE_ENV: "development", AUTH_DEV_LOGIN: "true" }),
    ).toBe(true);
    expect(
      isDevLoginEnabled({ NODE_ENV: "test", AUTH_DEV_LOGIN: "true" }),
    ).toBe(true);
    expect(
      isDevLoginEnabled({ NODE_ENV: "production", AUTH_DEV_LOGIN: "true" }),
    ).toBe(false);
    expect(
      isDevLoginEnabled({ NODE_ENV: "development", AUTH_DEV_LOGIN: "false" }),
    ).toBe(false);
  });

  it("requires both Google credentials", () => {
    expect(
      hasGoogleAuth({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret" }),
    ).toBe(true);
    expect(
      hasGoogleAuth({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "" }),
    ).toBe(false);
  });

  it("requires a long auth secret in production and skips the build phase", () => {
    expect(
      authSecretProblem({
        NODE_ENV: "production",
        AUTH_SECRET: "short",
      }),
    ).toMatch(/AUTH_SECRET/);
    expect(
      authSecretProblem({
        NODE_ENV: "production",
        AUTH_SECRET: "s".repeat(32),
      }),
    ).toBeNull();
    expect(
      authSecretProblem({
        NODE_ENV: "production",
        AUTH_SECRET: "",
        NEXT_PHASE: "phase-production-build",
      }),
    ).toBeNull();
    expect(authSecretProblem({ NODE_ENV: "test", AUTH_SECRET: "" })).toBeNull();
  });

  it("accepts only verified Google profiles", () => {
    expect(isVerifiedGoogleProfile({ email_verified: true })).toBe(true);
    expect(isVerifiedGoogleProfile({ email_verified: false })).toBe(false);
    expect(isVerifiedGoogleProfile({ email_verified: "true" })).toBe(false);
    expect(isVerifiedGoogleProfile(null)).toBe(false);
    expect(isVerifiedGoogleProfile(undefined)).toBe(false);
  });
});
