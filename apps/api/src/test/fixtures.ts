import type { AuthContext } from "../lib/types.js";

export const PROJECT_ID = "proj_1";
export const API_KEY_ID = "key_1";
export const RAW_KEY = `forge_test_${"a".repeat(48)}`;

export function authContext(
  scopes: string[] = ["todos:read", "todos:write"],
): AuthContext {
  const granted = [...scopes];
  return {
    project: {
      id: PROJECT_ID,
      name: "Demo",
      slug: "demo",
      plan: "FREE" as AuthContext["project"]["plan"],
      customDailyLimit: null,
      customMonthlyLimit: null,
    },
    apiKey: {
      id: API_KEY_ID,
      name: "ci",
      environment: "TEST" as AuthContext["apiKey"]["environment"],
      scopes: granted,
    },
    scopes: granted,
  };
}

export const sampleTodo = {
  id: "todo_1",
  title: "Ship tests",
  completed: false,
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-02T00:00:00.000Z",
};
