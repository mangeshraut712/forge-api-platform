import { describe, expect, it } from "vitest";
import { isPublicRoute, resolveRequestId } from "./request-utils.js";

describe("request utilities", () => {
  it("matches only the public health routes", () => {
    expect(isPublicRoute("/health")).toBe(true);
    expect(isPublicRoute("/ready?probe=true")).toBe(true);
    expect(isPublicRoute("/health/extra")).toBe(false);
    expect(isPublicRoute("/health-check")).toBe(false);
  });

  it("keeps safe incoming request ids", () => {
    expect(resolveRequestId("trace-123")).toBe("trace-123");
  });

  it("replaces unsafe or oversized request ids", () => {
    expect(resolveRequestId("bad id")).not.toBe("bad id");
    expect(resolveRequestId("x".repeat(129))).not.toBe("x".repeat(129));
  });
});
