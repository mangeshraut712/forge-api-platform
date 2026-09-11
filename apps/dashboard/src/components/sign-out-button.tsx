"use client";

import { signOut, useSession } from "next-auth/react";

export default function SignOutButton() {
  const { status } = useSession();
  if (status !== "authenticated") {
    return null;
  }

  return (
    <button
      type="button"
      className="nav-signout"
      onClick={() => void signOut({ callbackUrl: "/login" })}
    >
      Sign out
    </button>
  );
}
