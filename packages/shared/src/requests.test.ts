import { describe, expect, it } from "vitest";
import { isValidIdempotencyKey } from "./requests.js";

describe("idempotency keys", () => {
  it("accepts printable keys up to the storage limit", () => {
    expect(isValidIdempotencyKey("checkout-123")).toBe(true);
    expect(isValidIdempotencyKey("x".repeat(255))).toBe(true);
  });

  it("rejects missing, whitespace, and oversized keys", () => {
    expect(isValidIdempotencyKey(undefined)).toBe(false);
    expect(isValidIdempotencyKey(" ")).toBe(false);
    expect(isValidIdempotencyKey("x".repeat(256))).toBe(false);
  });
});
