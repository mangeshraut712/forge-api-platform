import { describe, expect, it } from "vitest";
import { sessionUserFromSession } from "./session-user";

describe("sessionUserFromSession", () => {
  it("requires a user id", () => {
    expect(sessionUserFromSession(null)).toBeNull();
    expect(sessionUserFromSession({})).toBeNull();
    expect(sessionUserFromSession({ user: { email: "a@b.c" } })).toBeNull();
    expect(sessionUserFromSession({ user: undefined })).toBeNull();
  });

  it("returns the session user when an id is present", () => {
    expect(
      sessionUserFromSession({
        user: { id: "user_1", email: "a@b.c", name: "Ada" },
      }),
    ).toEqual({ id: "user_1", email: "a@b.c", name: "Ada" });
  });
});
