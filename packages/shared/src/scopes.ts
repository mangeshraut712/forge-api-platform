export const SCOPES = {
  TODOS_READ: "todos:read",
  TODOS_WRITE: "todos:write",
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export const ALL_SCOPES: Scope[] = [SCOPES.TODOS_READ, SCOPES.TODOS_WRITE];

export function hasScope(
  granted: string[],
  required: Scope | Scope[],
): boolean {
  const needed = Array.isArray(required) ? required : [required];
  return needed.every((s) => granted.includes(s));
}
