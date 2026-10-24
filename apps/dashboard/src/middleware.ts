import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized: ({ token }) =>
      typeof token?.userId === "string" && token.userId.length > 0,
  },
});

export const config = {
  matcher: ["/projects/:path*"],
};
