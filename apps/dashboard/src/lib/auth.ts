/**
 * NextAuth configuration with credentials provider (dev) + Google (prod).
 * Uses Prisma tables from @forge/db. JWT always carries the Prisma user id.
 */
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@forge/db";

const isDev = process.env.NODE_ENV !== "production";
const enableDevLogin = process.env.AUTH_DEV_LOGIN === "true";
const hasGoogleCreds = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  providers: [
    ...(hasGoogleCreds
      ? [
          GoogleProvider({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          }),
        ]
      : []),
    ...(isDev && enableDevLogin
      ? [
          CredentialsProvider({
            name: "Dev Login",
            credentials: {
              email: { label: "Email", type: "email" },
            },
            async authorize(credentials) {
              if (!credentials?.email) return null;
              const email = credentials.email.trim().toLowerCase();
              if (!email.includes("@")) return null;

              const existing = await prisma.user.findUnique({
                where: { email },
              });
              if (existing?.deletedAt) return null;
              const user =
                existing ??
                (await prisma.user.create({
                  data: {
                    email,
                    name: email.split("@")[0] ?? "Dev User",
                  },
                }));
              return {
                id: user.id,
                email: user.email,
                name: user.name ?? undefined,
                image: user.image ?? undefined,
              };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Google OAuth: ensure a Prisma user exists and is linked by googleSub.
      // Without an adapter, NextAuth's user.id is the Google sub — not our cuid.
      if (account?.provider === "google" && user.email) {
        const email = user.email.trim().toLowerCase();
        const existing = await prisma.user.findUnique({
          where: { email },
          select: { deletedAt: true },
        });
        if (existing?.deletedAt) return false;
        const dbUser = await prisma.user.upsert({
          where: { email },
          update: {
            googleSub: account.providerAccountId,
            name: user.name ?? undefined,
            image: user.image ?? undefined,
          },
          create: {
            email,
            name: user.name ?? undefined,
            image: user.image ?? undefined,
            googleSub: account.providerAccountId,
          },
        });
        if (dbUser.deletedAt) return false;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      // On initial sign-in, resolve the Prisma user id into the JWT.
      if (user) {
        if (account?.provider === "google" && user.email) {
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email.trim().toLowerCase() },
            select: { id: true },
          });
          if (dbUser) {
            token.userId = dbUser.id;
          }
        } else if (user.id) {
          // Credentials provider already returns the Prisma cuid
          token.userId = user.id;
        }
      }

      // Self-heal older tokens that might still hold a Google sub
      if (!token.userId && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: String(token.email).toLowerCase() },
          select: { id: true },
        });
        if (dbUser) token.userId = dbUser.id;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { id: true, deletedAt: true },
        });
        if (!dbUser || dbUser.deletedAt) {
          return { ...session, user: undefined };
        }
        (session.user as { id?: string }).id = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
