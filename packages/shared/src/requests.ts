const IDEMPOTENCY_KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && IDEMPOTENCY_KEY_PATTERN.test(value);
}
