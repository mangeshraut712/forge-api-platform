import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/components/session-provider";

export const metadata: Metadata = {
  title: "ForgeAPI Dashboard",
  description: "Manage your ForgeAPI projects and API keys",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <nav className="navbar">
            <a href="/" className="logo">
              ForgeAPI
            </a>
            <div className="nav-links">
              <a href="/projects">Projects</a>
              <a href="/api/auth/signout">Sign out</a>
            </div>
          </nav>
          <main className="container">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
